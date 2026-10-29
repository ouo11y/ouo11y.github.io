// shop-api: takes an order from the browser, checks the product in Redis (falling back to
// PostgreSQL), stores the order, and hands it to the worker through RabbitMQ.
const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const amqp = require('amqplib');
const pino = require('pino');

const log = pino();
// host, port and database as fields, not a connection string: the pg instrumentation names the
// pool from them (db.client.connection.pool.name), and from a string it gets unknown_host:unknown_port.
const pg = new URL(process.env.DATABASE_URL);
const db = new Pool({
  host: pg.hostname, port: Number(pg.port), database: pg.pathname.slice(1),
  user: pg.username, password: pg.password, max: 10,
});
const redis = new Redis(process.env.REDIS_URL);
const QUEUE = 'orders';

async function main() {
  const conn = await amqp.connect(process.env.AMQP_URL);
  const channel = await conn.createConfirmChannel();
  await channel.assertQueue(QUEUE, { durable: true });

  const app = express();
  app.use(express.json());
  app.use(express.static('public'));

  // The page reads where to send its spans from here, so the bundle needs no rebuild per setup.
  app.get('/config.js', (_req, res) => {
    res.type('js').send(`window.SHOP = ${JSON.stringify({
      otlp: process.env.PUBLIC_OTLP_URL, grafana: process.env.PUBLIC_GRAFANA_URL,
    })};`);
  });

  app.get('/api/products', async (_req, res) => {
    const { rows } = await db.query('SELECT id, name, price_cents FROM products ORDER BY id');
    res.json(rows);
  });

  app.post('/api/orders', async (req, res) => {
    const { productId, quantity = 1, email } = req.body;
    const product = await getProduct(productId);
    if (!product) return res.status(404).json({ error: 'no such product' });

    const { rows: [order] } = await db.query(
      'INSERT INTO orders (product_id, quantity, customer_email) VALUES ($1, $2, $3) RETURNING id',
      [product.id, quantity, email],
    );
    // amqplib's instrumentation injects traceparent into the message headers here.
    channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify({ orderId: order.id, email })), {
      persistent: true,
      messageId: String(order.id),
      timestamp: Date.now(), // milliseconds; the worker turns it into queue wait time
      contentType: 'application/json',
    });
    await channel.waitForConfirms();
    log.info({ order_id: order.id, product_id: product.id }, 'order accepted');
    res.status(202).json({ id: order.id });
  });

  app.get('/api/orders/:id', async (req, res) => {
    const cached = await redis.get(`order:${req.params.id}:status`);
    if (cached) return res.json({ id: req.params.id, status: cached });
    const { rows } = await db.query('SELECT status FROM orders WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'no such order' });
    res.json({ id: req.params.id, status: rows[0].status });
  });

  app.use((err, _req, res, _next) => {
    log.error({ err }, 'request failed');
    res.status(500).json({ error: err.message });
  });

  app.listen(8080, () => log.info('shop-api listening on 8080'));
}

// Cache-aside: Redis first, PostgreSQL on a miss, then keep it for 30 seconds.
async function getProduct(id) {
  const key = `product:${id}`;
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit);
  const { rows } = await db.query('SELECT id, name, price_cents FROM products WHERE id = $1', [id]);
  if (!rows.length) return null;
  await redis.set(key, JSON.stringify(rows[0]), 'EX', 30);
  return rows[0];
}

main().catch((err) => { log.fatal({ err }, 'startup failed'); process.exit(1); });
