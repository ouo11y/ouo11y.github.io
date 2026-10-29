// Start OpenTelemetry before anything else touches fetch or the DOM.
import './otel.js';

const out = document.getElementById('out');

document.getElementById('price').addEventListener('click', async () => {
  const res = await fetch('/price.json');
  const { price } = await res.json();
  out.textContent = `Price: ${price}`;
});

document.getElementById('boom').addEventListener('click', () => {
  throw new Error('Tea kettle exploded');
});
