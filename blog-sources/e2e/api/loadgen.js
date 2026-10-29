// Steady background traffic: RATE orders per second from random customers, no browser involved.
const api = process.env.API_URL ?? 'http://api:8080';
const rate = Number(process.env.RATE ?? 4);

async function order() {
  const body = {
    productId: 1 + Math.floor(Math.random() * 8),
    quantity: 1 + Math.floor(Math.random() * 3),
    email: `customer${Math.floor(Math.random() * 50000)}@example.com`,
  };
  try {
    await fetch(`${api}/api/orders`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('order failed:', err.message);
  }
}

if (rate > 0) setInterval(order, 1000 / rate);
console.log(`loadgen: ${rate} orders/s against ${api}`);
