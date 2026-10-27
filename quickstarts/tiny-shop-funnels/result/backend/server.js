// The API. HTTP server spans come from the auto-instrumentation; the spans below are manual.
const express = require("express");
const cors = require("cors");
const { trace, SpanStatusCode } = require("@opentelemetry/api");

const tracer = trace.getTracer("tiny-shop-funnels-backend");

const app = express();
// The browser calls this API from another origin and adds `traceparent` and `baggage`
// headers; cors() answers the preflight for them.
app.use(cors());
app.use(express.json());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const products = [
  { id: 1, name: "Coffee", price: 4, blurb: "Single origin, roasted on Tuesdays." },
  { id: 2, name: "Tea", price: 3, blurb: "Loose leaf green tea." },
  { id: 3, name: "Cake", price: 6, blurb: "Lemon drizzle, one slice." },
];

app.get("/api/products", async (req, res) => {
  await sleep(50 + Math.random() * 100);
  res.json(products);
});

app.post("/api/checkout", async (req, res) => {
  const items = req.body.items || [];
  // The failing path, on demand: a card ending in 0002 is declined (a common test card), so you
  // know which checkout to look for in the replay. Any other card succeeds.
  const declined = String(req.body.cardLast4 || "") === "0002";
  await tracer.startActiveSpan("checkout", async (span) => {
    span.setAttribute("app.cart.items", items.length);
    await tracer.startActiveSpan("charge card", async (child) => {
      await sleep(120);
      if (declined) {
        const err = new Error("card declined by payment provider");
        child.recordException(err);
        child.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      }
      child.end();
    });
    if (declined) span.setStatus({ code: SpanStatusCode.ERROR, message: "card declined" });
    span.end();
  });
  if (declined) return res.status(500).json({ error: "card declined" });
  const total = items.reduce((sum, id) => sum + (products.find((p) => p.id === id)?.price || 0), 0);
  res.json({ ok: true, orderId: Math.floor(Math.random() * 100000), total });
});

const port = Number(process.env.PORT || 5001);
app.listen(port, () => console.log(`tiny-shop-funnels API on http://localhost:${port}`));
