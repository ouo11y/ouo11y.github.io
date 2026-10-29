-- Runs once, the first time the postgres volume is created.
CREATE TABLE products (
  id          int PRIMARY KEY,
  name        text NOT NULL,
  price_cents int  NOT NULL
);

INSERT INTO products (id, name, price_cents) VALUES
  (1, 'Trace-colored mug', 1200), (2, 'Span sticker pack', 400), (3, 'Exemplar hoodie', 4800),
  (4, 'Collector cap', 2200), (5, 'Baggage tote', 1600), (6, 'Histogram socks', 900),
  (7, 'Context notebook', 700), (8, 'Sampler keyring', 500);

CREATE TABLE orders (
  id             bigserial PRIMARY KEY,
  product_id     int         NOT NULL REFERENCES products (id),
  quantity       int         NOT NULL,
  customer_email text        NOT NULL,
  status         text        NOT NULL DEFAULT 'pending',
  created_at     timestamptz NOT NULL DEFAULT now(),
  paid_at        timestamptz
);

-- Three million past orders from 50,000 customers, so that a query without an index is slow
-- the way it is in production, not in a demo. There is deliberately no index on customer_email:
-- part 3 of the series finds that from a slow click, then adds it.
INSERT INTO orders (product_id, quantity, customer_email, status, created_at, paid_at)
SELECT 1 + (g % 8), 1 + (g % 3), 'customer' || (g % 50000) || '@example.com', 'paid',
       now() - (g || ' seconds')::interval, now() - (g || ' seconds')::interval
FROM generate_series(1, 3000000) AS g;

ANALYZE orders;
