// One user action = one trace: the "buy" span is the root, every fetch below it is a child,
// and the API, the queue and the worker continue the same trace from the traceparent header.
const { tracer, trace, context } = window.otel;
const $status = document.getElementById('status');
const email = `customer${Math.floor(Math.random() * 50000)}@example.com`;

async function buy(product) {
  const span = tracer.startSpan('buy', { attributes: { 'shop.product.id': product.id } });
  const ctx = trace.setSpan(context.active(), span);
  // The browser has no async context: run each fetch inside the span's context explicitly.
  const inSpan = (fn) => context.with(ctx, fn);
  const started = performance.now();
  const traceId = span.spanContext().traceId;
  $status.textContent = `Ordering ${product.name}...`;

  const res = await inSpan(() => fetch('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId: product.id, quantity: 1, email }),
  }));
  const { id } = await res.json();
  span.setAttribute('shop.order.id', id);

  // Poll until the worker has charged the order: that is when the user sees "paid".
  let status = 'pending';
  while (status === 'pending' && performance.now() - started < 30000) {
    await new Promise((r) => setTimeout(r, 250));
    ({ status } = await (await inSpan(() => fetch(`/api/orders/${id}`))).json());
  }
  span.setAttribute('shop.order.status', status);
  span.end();

  const ms = Math.round(performance.now() - started);
  const explore = `${window.SHOP.grafana}/explore?left=${encodeURIComponent(JSON.stringify({
    datasource: 'tempo', queries: [{ refId: 'A', queryType: 'traceql', query: traceId }],
  }))}`;
  $status.innerHTML = `Order ${id}: ${status} after ${ms} ms.\ntrace_id ${traceId}\n<a href="${explore}" target="_blank">Open the trace in Grafana</a>`;
}

fetch('/api/products').then((r) => r.json()).then((products) => {
  document.getElementById('products').replaceChildren(...products.map((p) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${p.name} · $${(p.price_cents / 100).toFixed(2)}</span>`;
    const btn = document.createElement('button');
    btn.textContent = 'Buy';
    btn.onclick = () => buy(p);
    li.append(btn);
    return li;
  }));
});
