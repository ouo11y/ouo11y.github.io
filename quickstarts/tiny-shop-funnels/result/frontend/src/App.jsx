import { useEffect, useState } from "react";
import { API, rum } from "./rum";

// A five-page shop. Every page change goes through history.pushState, which the SDK records as a
// `navigation` event with `url.path`: those are the funnel's page steps. The custom events
// (rum.addEvent) are its event steps:
//
//   /  ->  /products/<id>  ->  add_to_cart  ->  /checkout  ->  order_paid
//
// Funnel step = a page path (exact, or prefix such as /products/*) or a custom event name.

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const go = (to) => {
    history.pushState(null, "", to); // recorded by the SDK as navigation (kind push)
    setPath(to);
  };
  return [path, go];
}

function Link({ to, go, children, ...rest }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        e.preventDefault();
        go(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

export default function App() {
  const [path, go] = usePath();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${API}/api/products`).then((r) => r.json()).then(setProducts);
  }, []);

  function addToCart(p) {
    setCart([...cart, p]);
    // A custom event: a funnel step by its name. Attributes are kept on the event (Loki
    // structured metadata) and shown on the session timeline.
    rum.addEvent("add_to_cart", { "product.id": p.id, "product.name": p.name });
  }

  async function pay(e) {
    e.preventDefault();
    const card = new FormData(e.target).get("card") || "";
    rum.addEvent("checkout_submitted", { "cart.items": cart.length });
    const res = await fetch(`${API}/api/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: cart.map((p) => p.id), cardLast4: card.slice(-4) }),
    });
    if (!res.ok) {
      rum.captureError(new Error(`checkout failed: ${(await res.json()).error}`));
      setMessage("Payment failed, try another card");
      return;
    }
    const data = await res.json();
    rum.addEvent("order_paid", { "order.id": data.orderId, "order.total": data.total });
    setCart([]);
    go(`/orders/${data.orderId}`);
  }

  const product = path.startsWith("/products/") && products.find((p) => `/products/${p.id}` === path);

  return (
    <main style={{ fontFamily: "sans-serif", maxWidth: 520, margin: "40px auto" }}>
      <nav style={{ display: "flex", gap: 12 }}>
        <Link to="/" go={go}>Tiny Shop</Link>
        <Link to="/cart" go={go} data-testid="cart-link">Cart ({cart.length})</Link>
      </nav>

      {path === "/" && (
        <ul>
          {products.map((p) => (
            <li key={p.id}>
              <Link to={`/products/${p.id}`} go={go}>{p.name}</Link> (${p.price})
            </li>
          ))}
        </ul>
      )}

      {product && (
        <section>
          <h2>{product.name}</h2>
          <p>{product.blurb}</p>
          <button onClick={() => addToCart(product)}>Add to cart (${product.price})</button>
        </section>
      )}

      {path === "/cart" && (
        <section>
          <h2>Cart</h2>
          <ul>
            {cart.map((p, i) => (
              <li key={i}>{p.name}</li>
            ))}
          </ul>
          <button disabled={!cart.length} onClick={() => go("/checkout")}>Go to checkout</button>
        </section>
      )}

      {path === "/checkout" && (
        <form onSubmit={pay} style={{ display: "grid", gap: 6 }}>
          <h2>Checkout</h2>
          <input name="card" placeholder="card number" autoComplete="cc-number" />
          <button disabled={!cart.length}>Pay</button>
        </form>
      )}

      {path.startsWith("/orders/") && <h2>Thanks! Order {path.split("/").pop()} is paid.</h2>}

      <p>{message}</p>
    </main>
  );
}
