# Build Tiny Shop Funnels yourself, from scratch

This guide builds the [Tiny Shop Funnels](README.md) quickstart by hand, from an empty folder, one
step at a time:

1. a plain Express API and a plain five-page React shop, both working with no telemetry at all;
2. the ouo stack (collector, Tempo, Loki, rum-api, Grafana), one service at a time;
3. the API instrumented with the OpenTelemetry Node SDK;
4. the shop instrumented with `@ouo11y/browser`: every page change becomes a funnel step for free,
   and three `rum.addEvent` calls add the event steps;
5. fifty generated shoppers, then the funnel built and read in Grafana, down to the replay of a
   session that dropped.

At the end your folder is the same as [`result/`](result) next to this guide: compare with it when
you are stuck. Plan on about 40 minutes. Every command goes in its own block: run them one by one,
in order. When a step says "replace the file", select everything in it and paste the new content
over it. Long files are in collapsible sections: open one, copy it, paste it into the file named in
its title.

## Step 0. Check your tools

Node 24 or newer, and Docker Desktop running (`docker info` prints the server details, not
"Cannot connect"):

```bash
node -v
```

```bash
docker info
```

A clone of the ouo11y repository. Funnels are newer than the released rum-api and Grafana images
(`0.4.0`), so step 4 builds those two from the clone (the SDK and the collector are the released
ones). Once a release with funnels is out, step 4 uses `image:` lines instead and the clone is not
needed.

```bash
git clone https://github.com/ouo11y/ouo11y.git ~/ouo11y
```

## Step 1. Create the folders

```bash
mkdir -p ~/Desktop/tiny-shop-funnels/backend ~/Desktop/tiny-shop-funnels/frontend/src ~/Desktop/tiny-shop-funnels/stack ~/Desktop/tiny-shop-funnels/generate-sessions
```

```bash
cd ~/Desktop/tiny-shop-funnels
```

You will use four terminal tabs: the API, the shop, the stack, the generator.

## Step 2. A plain API, no telemetry yet

```bash
cd ~/Desktop/tiny-shop-funnels/backend
```

Create `backend/package.json`:

```json
{
  "name": "tiny-shop-funnels-backend",
  "private": true,
  "version": "1.0.0",
  "description": "ouo quickstart: Express API with OpenTelemetry traces",
  "type": "commonjs",
  "scripts": {
    "start": "node server.js"
  },
  "engines": {
    "node": ">=24"
  },
  "dependencies": {
    "cors": "^2.8.6",
    "express": "^5.3.0"
  }
}
```

Three products, and a checkout that declines card `...0002` (a common test card, so you know
which checkouts fail) and returns the order total. Create `backend/server.js`:

```js
const express = require("express");
const cors = require("cors");

const app = express();
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
  await sleep(120);
  if (String(req.body.cardLast4 || "") === "0002") return res.status(500).json({ error: "card declined" });
  const total = items.reduce((sum, id) => sum + (products.find((p) => p.id === id)?.price || 0), 0);
  res.json({ ok: true, orderId: Math.floor(Math.random() * 100000), total });
});

const port = Number(process.env.PORT || 5001);
app.listen(port, () => console.log(`tiny-shop-funnels API on http://localhost:${port}`));
```

```bash
npm install
```

```bash
npm start
```

Check, in another tab: `curl localhost:5001/api/products` prints the three products. Leave the API
running.

## Step 3. A plain five-page shop

A funnel needs pages. The shop has five, switched with `history.pushState` (no router library):
`/`, `/products/<id>`, `/cart`, `/checkout`, `/orders/<id>`.

```bash
cd ~/Desktop/tiny-shop-funnels/frontend
```

Create `frontend/package.json`:

```json
{
  "name": "tiny-shop-funnels-frontend",
  "private": true,
  "version": "1.0.0",
  "description": "ouo quickstart: React shop whose pages and custom events make a funnel",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "engines": {
    "node": ">=24"
  },
  "dependencies": {
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.1.2",
    "vite": "^8.3.4"
  }
}
```

<details>
<summary><code>frontend/vite.config.js</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/frontend/vite.config.js -->
```js
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
});
```

</details>
<details>
<summary><code>frontend/index.html</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/frontend/index.html -->
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tiny Shop Funnels</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

</details>

Create `frontend/src/main.jsx`:

```jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Create `frontend/src/App.jsx`:

<details>
<summary><code>frontend/src/App.jsx</code>, plain (click to open)</summary>

```jsx
import { useEffect, useState } from "react";

const API = "http://localhost:5001";

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const go = (to) => {
    history.pushState(null, "", to);
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
  }

  async function pay(e) {
    e.preventDefault();
    const card = new FormData(e.target).get("card") || "";
    const res = await fetch(`${API}/api/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: cart.map((p) => p.id), cardLast4: card.slice(-4) }),
    });
    if (!res.ok) {
      setMessage("Payment failed, try another card");
      return;
    }
    const data = await res.json();
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
```

</details>

```bash
npm install
```

```bash
npm run dev
```

Check: open http://localhost:5173, click **Coffee**, **Add to cart ($4)**, **Cart (1)**, **Go to
checkout**, type `4242424242424242`, **Pay**: "Thanks! Order ... is paid", and the address bar
changed at every click. Leave it running.

## Step 4. The ouo stack, one service at a time

```bash
cd ~/Desktop/tiny-shop-funnels/stack
```

`compose.yaml` only lists the service folders. Each folder holds that service's compose file and
its config, and each file starts with what the service is for and its ports.

<details>
<summary><code>stack/compose.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/stack/compose.yaml -->
```yaml
# The ouo stack for tiny-shop-funnels: one folder per service, each with its compose file and its
# config. This file only lists them. Start everything from this folder: `docker compose up -d`.
# Grafana http://localhost:3000 (admin / testing567), OTLP http://localhost:4318, replay :4319.
# Ports taken? Export OUO_GRAFANA_PORT, OUO_OTLP_HTTP_PORT, OUO_REPLAY_PORT before `up`.
name: tiny-shop-funnels   # compose project name: containers and the rum-api-data volume use it
include:
  - 10-collector/compose.yaml   # ingest: the only thing the apps talk to, replay included
  - 20-tempo/compose.yaml       # traces
  - 30-loki/compose.yaml        # browser events: page views and custom events, the funnel steps
  - 50-rum-api/compose.yaml     # sessions, funnels, and where replay chunks are stored (built from source)
  - 60-grafana/compose.yaml     # the UI: datasources and the ouo11y RUM app (built from source)
```

</details>

**The collector** is the only thing your apps talk to. It checks the project credential
(`projects.htpasswd`) and routes traces to Tempo, logs (the SDK's page views and custom events)
to Loki, and replay chunks to rum-api.

<details>
<summary><code>stack/10-collector/compose.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/stack/10-collector/compose.yaml -->
```yaml
# ouo-collector: the only ingest. The browser SDK and the Node API send OTLP here; it checks the
# project credential and forwards traces to Tempo, logs to Loki and replay chunks to rum-api.
# The browser uploads replay to 4319 only: rum-api is never exposed. Ports: 4318 OTLP/HTTP, 4319 replay (both public), 13133 health (loopback).
services:
  otel-collector:
    image: ghcr.io/ouo11y/collector:0.4.0
    command: ["--config=/etc/otelcol/config.yaml"]
    ports:
      - "${OUO_OTLP_HTTP_PORT:-4318}:4318"
      - "${OUO_REPLAY_PORT:-4319}:4319"
      - "127.0.0.1:${OUO_COLLECTOR_HEALTH_PORT:-13133}:13133"
    environment:
      OUO_INGEST_TOKEN: it_dev_0000000000000000   # what it sends to rum-api; must equal rum-api's
    volumes:
      - ./config.yaml:/etc/otelcol/config.yaml:ro
      - ./projects.htpasswd:/etc/otelcol/projects.htpasswd:ro
    depends_on: [tempo, loki, rum-api]
```

</details>
<details>
<summary><code>stack/10-collector/config.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/stack/10-collector/config.yaml -->
```yaml
# ouo-collector pipelines, a trimmed copy of the full stack's config (no Sentry bridge, no
# rate limits, no metrics). Receivers: OTLP/HTTP on 4318 and replay chunks on 4319, both behind
# the project credential in projects.htpasswd. Exporters: Tempo, Loki and rum-api.

extensions:
  health_check:
    endpoint: 0.0.0.0:13133
  basicauth/server:
    htpasswd:
      file: /etc/otelcol/projects.htpasswd

receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
        include_metadata: true       # keeps the authenticated project for resource/project
        auth:
          authenticator: basicauth/server
        cors:                        # the browser app runs on another origin
          allowed_origins: ["http://localhost:*", "http://127.0.0.1:*"]
          allowed_headers: [Authorization, Content-Type, Content-Encoding, traceparent, baggage]
  # Replay: the SDK POSTs gzipped rrweb chunks here (X-Ouo-Session-Id, X-Ouo-Seq headers).
  ouoreplay:
    endpoint: 0.0.0.0:4319
    include_metadata: true
    max_request_body_size: 8388608   # 8 MB per chunk; the SDK flushes at 256 KB
    auth:
      authenticator: basicauth/server
    cors:
      allowed_origins: ["http://localhost:*", "http://127.0.0.1:*"]
      allowed_headers: [Authorization, Content-Type, Content-Encoding, X-Ouo-Session-Id, X-Ouo-Seq]

processors:
  # Stamp the authenticated project id on every resource (and drop any value the client sent).
  resource/project:
    attributes:
      - key: ouo.project.id
        action: delete
      - key: ouo.project.id
        from_context: auth.username
        action: upsert
  # Copy the OTLP event name into the `event.name` attribute, which Loki turns into a label.
  transform/events:
    error_mode: ignore
    log_statements:
      - context: log
        statements:
          - set(log.attributes["event.name"], log.event_name) where log.event_name != "" and log.attributes["event.name"] == nil
  batch:
    timeout: 1s

exporters:
  otlp_grpc/tempo:
    endpoint: tempo:4317
    tls: { insecure: true }
  otlp_http/loki:
    endpoint: http://loki:3100/otlp
    tls: { insecure: true }
  # Replay chunks go on, unchanged, to rum-api, which stores them (see 50-rum-api/config.yaml).
  ouoreplay:
    endpoint: http://rum-api:8080
    ingest_token: ${env:OUO_INGEST_TOKEN}

service:
  extensions: [health_check, basicauth/server]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [resource/project, batch]
      exporters: [otlp_grpc/tempo]
    logs:
      receivers: [otlp]
      processors: [resource/project, transform/events, batch]
      exporters: [otlp_http/loki]
    logs/replay:
      receivers: [ouoreplay]
      exporters: [ouoreplay]
```

</details>
<details>
<summary><code>stack/10-collector/projects.htpasswd</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/stack/10-collector/projects.htpasswd -->
```text
# Projects allowed to send data: one line per project, project id and SHA hash of its token.
# Read by the collector's basicauth extension. The `demo` token (pt_dev_demo_0000000000000000)
# is public: local use only. Make a line with htpasswd -nbs PROJECT TOKEN. No colon in comments.
demo:{SHA}IUpHBAUPHvXoJmvv4inmF4cN96I=
```

</details>

**Tempo** stores the traces.

<details>
<summary><code>stack/20-tempo/compose.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/stack/20-tempo/compose.yaml -->
```yaml
# Tempo: stores traces. The collector sends it spans from the browser and the API over OTLP/gRPC;
# Grafana and rum-api query it on 3200. Port 3200 is published for curl; nothing else needs it.
services:
  tempo:
    image: grafana/tempo:3.0.3
    command: ["-config.file=/etc/tempo/config.yaml"]
    ports:
      - "127.0.0.1:${OUO_TEMPO_PORT:-3200}:3200"
    volumes:
      - ./config.yaml:/etc/tempo/config.yaml:ro
      - tempo-data:/var/tempo

volumes:
  tempo-data:
```

</details>
<details>
<summary><code>stack/20-tempo/config.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/stack/20-tempo/config.yaml -->
```yaml
# Tempo 3.x single binary with local storage. Receives OTLP from the collector on 4317, serves
# queries on 3200 (Grafana streams search results over that port, hence stream_over_http).
stream_over_http_enabled: true

server:
  http_listen_port: 3200
  log_level: warn

distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317

querier:
  frontend_worker:
    frontend_address: 127.0.0.1:9095

storage:
  trace:
    backend: local
    wal:
      path: /var/tempo/wal
    local:
      path: /var/tempo/blocks
```

</details>

**Loki** stores the browser's events: `navigation` with `url.path` for every page, and the custom
events. These are the funnel steps. `event_name` becomes a label, so rum-api can fetch one kind of
step in one query.

<details>
<summary><code>stack/30-loki/compose.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/stack/30-loki/compose.yaml -->
```yaml
# Loki: stores logs. The collector sends it the browser's events and frontend logs over OTLP
# (/otlp); Grafana and rum-api query it on 3100 (rum-api builds sessions from these records).
# Port 3100 is published on loopback for curl.
services:
  loki:
    image: grafana/loki:3.7.7
    command: ["-config.file=/etc/loki/config.yaml"]
    ports:
      - "127.0.0.1:${OUO_LOKI_PORT:-3100}:3100"
    volumes:
      - ./config.yaml:/etc/loki/config.yaml:ro
      - loki-data:/loki

volumes:
  loki-data:
```

</details>
<details>
<summary><code>stack/30-loki/config.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/stack/30-loki/config.yaml -->
```yaml
# Loki 3.x single binary, filesystem storage, native OTLP ingestion on 3100.
# Only service_name, deployment_environment_name, event_name and ouo_platform become labels;
# everything else (session.id, user.id, trace_id, your log attributes) is structured metadata.
auth_enabled: false

server:
  http_listen_port: 3100
  log_level: warn

common:
  instance_addr: 127.0.0.1
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: "2024-01-01"
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  allow_structured_metadata: true   # required for OTLP
  otlp_config:
    resource_attributes:
      ignore_defaults: true         # the defaults would index per-browser ids
      attributes_config:
        - action: index_label
          attributes: [service.name, deployment.environment.name, ouo.platform]
    log_attributes:
      - action: index_label
        attributes: [event.name, ouo.platform]

analytics:
  reporting_enabled: false
```

</details>

**rum-api** builds sessions and funnels from Loki and stores replays. It is built from the clone
(`OUO11Y_REPO`), because the released `0.4.0` has no funnels.

<details>
<summary><code>stack/50-rum-api/compose.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/stack/50-rum-api/compose.yaml -->
```yaml
# rum-api: the ouo platform service behind the Grafana plugin. It builds the session list
# (healthy / errored / crashed) and the funnel reports from Loki and Tempo, and stores replay
# chunks the collector forwards. Internal: only the collector and Grafana talk to it, on 8080
# inside the network.
#
# Built from source: funnels (POST /v1/funnels/query) are newer than the released
# ghcr.io/ouo11y/rum-api:0.4.0. Once a rum-api release with funnels is tagged, replace `build:`
# with `image: ghcr.io/ouo11y/rum-api:<that version>` (see the README, "Released images").
services:
  rum-api:
    build:
      # services/rum-api of an ouo11y checkout. OUO11Y_REPO: the checkout's root (default: this
      # folder's place inside the repository).
      context: ${OUO11Y_REPO:-../../../../../..}/services/rum-api
      args: { VERSION: funnels-from-source }
    image: tiny-shop-funnels/rum-api:from-source
    command: ["-config.file=/etc/rum-api/config.yaml", "-config.expand-env=true"]
    environment:
      GRAFANA_URL: http://localhost:${OUO_GRAFANA_PORT:-3000}   # for deep links
      OUO_INGEST_TOKEN: it_dev_0000000000000000   # the collector's; development value
      OUO_READ_TOKEN: rt_dev_0000000000000000     # Grafana's; development value
      DATA_DIR: /home/nonroot                     # the image runs as nonroot
    volumes:
      - ./config.yaml:/etc/rum-api/config.yaml:ro
      - rum-api-data:/home/nonroot
    depends_on: [loki, tempo]

volumes:
  rum-api-data:
```

</details>
<details>
<summary><code>stack/50-rum-api/config.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/stack/50-rum-api/config.yaml -->
```yaml
# rum-api configuration: where Loki and Tempo are, and the session timeouts.
# The tokens come from the environment set in compose.yaml (-config.expand-env=true).
server:
  http_listen_address: ":8080"

auth:
  ingest_token: "${OUO_INGEST_TOKEN}"
  read_token: "${OUO_READ_TOKEN}"

loki:
  url: http://loki:3100
  datasource_uid: loki

tempo:
  url: http://tempo:3200
  datasource_uid: tempo

session:
  inactivity: 30m
  max_duration: 4h

# Where replay chunks are stored. filesystem: files under DATA_DIR, here the rum-api-data volume
# (<dir>/replays/<session id>/, one chunk per upload, in sequence order). For more
# than one rum-api, or real retention, use backend: s3 with MinIO or any S3 bucket:
#   storage:
#     backend: s3
#     s3: { endpoint: "minio:9000", bucket: ouo-replays, insecure: true, force_path_style: true,
#           access_key_id: ..., secret_access_key: ... }
storage:
  backend: filesystem
```

</details>

**Grafana** with the ouo11y RUM app, which has the **Funnels** page. Its `Dockerfile` builds the
plugin from the clone and copies it into `grafana/grafana`, like the released image does.

<details>
<summary><code>stack/60-grafana/compose.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/stack/60-grafana/compose.yaml -->
```yaml
# Grafana with the ouo11y RUM app plugin: the UI for everything above. It reads Tempo and Loki
# directly, and sessions, funnels and replays from rum-api through the plugin. Port 3000,
# admin / testing567. provisioning/ sets up the datasources and the plugin.
#
# Built from source: the plugin's Funnels page is newer than the released
# ghcr.io/ouo11y/grafana:0.4.0. Dockerfile (next to this file) builds plugins/ouo11y-rum-app of an
# ouo11y checkout and copies it into grafana/grafana, like the released image. OUO11Y_REPO: the
# checkout's root (default: this folder's place inside the repository). Once a grafana image with
# funnels is tagged, replace `build:` with `image: ghcr.io/ouo11y/grafana:<that version>`.
services:
  grafana:
    build:
      context: .
      additional_contexts:
        ouo11y: ${OUO11Y_REPO:-../../../../../..}
    image: tiny-shop-funnels/grafana:from-source
    ports:
      - "${OUO_GRAFANA_PORT:-3000}:3000"
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: testing567
      GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS: ouo11y-rum-app
      GF_SECURITY_DISABLE_FRONTEND_SANDBOX_FOR_PLUGINS: ouo11y-rum-app
      OUO_READ_TOKEN: rt_dev_0000000000000000   # read by provisioning/plugins; equals rum-api's
    volumes:
      - ./provisioning:/etc/grafana/provisioning:ro
    depends_on: [loki, tempo, rum-api]
```

</details>
<details>
<summary><code>stack/60-grafana/Dockerfile</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/stack/60-grafana/Dockerfile -->
```dockerfile
# syntax=docker/dockerfile:1
# Grafana with the ouo11y RUM app plugin built from an ouo11y checkout (the Funnels page is not
# in a released image yet). compose.yaml passes the checkout as the named build context
# `ouo11y`; only the files copied below are sent. Same result as the released grafana image.
FROM node:24-bookworm-slim AS plugin
WORKDIR /src
# The plugin is an npm workspace of the repository: install from the root lockfile, plugin only.
COPY --from=ouo11y package.json package-lock.json ./
COPY --from=ouo11y sdk/browser/package.json sdk/browser/
COPY --from=ouo11y sdk/react-native/package.json sdk/react-native/
COPY --from=ouo11y examples/ouo-web/package.json examples/ouo-web/
COPY --from=ouo11y plugins/ouo11y-rum-app/package.json plugins/ouo11y-rum-app/
RUN npm ci --no-audit --no-fund --ignore-scripts -w plugins/ouo11y-rum-app
COPY --from=ouo11y plugins/ouo11y-rum-app/src plugins/ouo11y-rum-app/src
COPY --from=ouo11y plugins/ouo11y-rum-app/.config plugins/ouo11y-rum-app/.config
COPY --from=ouo11y plugins/ouo11y-rum-app/tsconfig.json plugins/ouo11y-rum-app/.cprc.json plugins/ouo11y-rum-app/README.md plugins/ouo11y-rum-app/CHANGELOG.md plugins/ouo11y-rum-app/LICENSE plugins/ouo11y-rum-app/
RUN npm run build -w plugins/ouo11y-rum-app

FROM grafana/grafana:13.2.1
COPY --from=plugin --chown=grafana:root /src/plugins/ouo11y-rum-app/dist /var/lib/grafana/plugins/ouo11y-rum-app
ENV GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=ouo11y-rum-app \
    GF_SECURITY_DISABLE_FRONTEND_SANDBOX_FOR_PLUGINS=ouo11y-rum-app
```

</details>
<details>
<summary><code>stack/60-grafana/provisioning/datasources/datasources.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/stack/60-grafana/provisioning/datasources/datasources.yaml -->
```yaml
# Grafana datasources: Loki (browser events), Tempo (traces), both inside the network.
# The uids are fixed because rum-api's config refers to them.
# Log lines with a trace_id link to the trace in Tempo.
apiVersion: 1

datasources:
  - name: Loki
    uid: loki
    type: loki
    url: http://loki:3100
    jsonData:
      derivedFields:
        - name: TraceID
          datasourceUid: tempo
          matcherType: label
          matcherRegex: trace_id
          url: "$${__value.raw}"
          urlDisplayLabel: View trace

  - name: Tempo
    uid: tempo
    type: tempo
    url: http://tempo:3200
    isDefault: true
    jsonData:
      lokiSearch:
        datasourceUid: loki
```

</details>
<details>
<summary><code>stack/60-grafana/provisioning/plugins/ouo11y-rum-app.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/stack/60-grafana/provisioning/plugins/ouo11y-rum-app.yaml -->
```yaml
# Enables the ouo11y RUM app (More apps -> ouo11y RUM) and points it at rum-api.
# Grafana adds the read token to every call it forwards; ${OUO_READ_TOKEN} comes from the
# container environment and must equal rum-api's.
apiVersion: 1

apps:
  - type: ouo11y-rum-app
    org_id: 1
    jsonData:
      rumApiUrl: http://rum-api:8080
    secureJsonData:
      readToken: ${OUO_READ_TOKEN}
```

</details>

The collector image is private for now: log in to ghcr.io once with a GitHub token that has
`read:packages`.

```bash
echo $GHCR_TOKEN | docker login ghcr.io -u <github-user> --password-stdin
```

Point the builds at your clone and start everything. The first run builds rum-api and Grafana
(two to three minutes):

```bash
export OUO11Y_REPO=~/ouo11y
```

```bash
docker compose up -d --build
```

Check: rum-api has the funnel endpoint (a 400 for an empty funnel, not a 404):

```bash
docker compose exec grafana curl -s -X POST http://rum-api:8080/v1/funnels/query -H 'Authorization: Bearer rt_dev_0000000000000000' -d '{"steps":[]}'
```

It prints `{"error":"a funnel has 2 to 10 steps"}`. http://localhost:3000 (admin / testing567):
More apps -> ouo11y RUM has **Funnels**. Ports taken by another stack? See "When something does
not work" below.

## Step 5. Instrument the API

Stop the API (Ctrl+C in its tab). Replace `backend/package.json` (the OpenTelemetry packages, and
`start` now loads `instrumentation.js` first):

<details>
<summary><code>backend/package.json</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/backend/package.json -->
```json
{
  "name": "tiny-shop-funnels-backend",
  "private": true,
  "version": "1.0.0",
  "description": "ouo quickstart: Express API with OpenTelemetry traces",
  "type": "commonjs",
  "scripts": {
    "start": "node --require ./instrumentation.js server.js"
  },
  "engines": {
    "node": ">=24"
  },
  "dependencies": {
    "@opentelemetry/api": "^1.10.0",
    "@opentelemetry/baggage-span-processor": "^0.6.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.300.0",
    "@opentelemetry/instrumentation-express": "^0.72.0",
    "@opentelemetry/instrumentation-http": "^0.300.0",
    "@opentelemetry/resources": "^3.0.0",
    "@opentelemetry/sdk-node": "^0.300.0",
    "@opentelemetry/sdk-trace": "^3.0.0",
    "@opentelemetry/semantic-conventions": "^1.43.0",
    "cors": "^2.8.6",
    "express": "^5.3.0"
  }
}
```

</details>
<details>
<summary><code>backend/instrumentation.js</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/backend/instrumentation.js -->
```js
// OpenTelemetry SDK init: traces to the ouo collector over OTLP/HTTP.
// Loaded before the app with `node --require ./instrumentation.js` so the http and express
// instrumentations can patch those modules before server.js loads them.
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { BatchSpanProcessor } = require("@opentelemetry/sdk-trace");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http");
const { ExpressInstrumentation } = require("@opentelemetry/instrumentation-express");
const { BaggageSpanProcessor, ALLOW_ALL_BAGGAGE_KEYS } = require("@opentelemetry/baggage-span-processor");
const { resourceFromAttributes } = require("@opentelemetry/resources");
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require("@opentelemetry/semantic-conventions");

// The ouo collector, the only ingest. Moved ports? OUO_OTLP_ENDPOINT=http://localhost:14318
const endpoint = process.env.OUO_OTLP_ENDPOINT || "http://localhost:4318";

// Every request needs the project credential: Basic base64("<project id>:<project token>").
// This is the quickstart's `demo` project: base64("demo:pt_dev_demo_0000000000000000").
const headers = { Authorization: "Basic ZGVtbzpwdF9kZXZfZGVtb18wMDAwMDAwMDAwMDAwMDAw" };

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "tiny-shop-funnels-backend",
    [ATTR_SERVICE_VERSION]: "1.0.0",
    "deployment.environment.name": "local",
  }),
  spanProcessors: [
    // The browser SDK sends `baggage: session.id=...,user.id=...`; copy it onto every span so
    // backend spans can be searched by the RUM session.
    new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS),
    new BatchSpanProcessor({ exporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers }) }),
  ],
  instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
});

sdk.start();
console.log(`[otel] traces to ${endpoint}`);

const shutdown = () => sdk.shutdown().finally(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

</details>

Replace `backend/server.js`: the same API, plus a `checkout` span with a `charge card` child that
records the declined card as an error.

<details>
<summary><code>backend/server.js</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/backend/server.js -->
```js
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
```

</details>

```bash
cd ~/Desktop/tiny-shop-funnels/backend
```

```bash
npm install
```

```bash
npm start
```

Check: the first line is `[otel] traces to http://localhost:4318`.

## Step 6. Instrument the shop: pages and funnel events

Stop Vite (Ctrl+C). Replace `frontend/package.json` (adds `@ouo11y/browser` 0.2.1):

<details>
<summary><code>frontend/package.json</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/frontend/package.json -->
```json
{
  "name": "tiny-shop-funnels-frontend",
  "private": true,
  "version": "1.0.0",
  "description": "ouo quickstart: React shop whose pages and custom events make a funnel",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "engines": {
    "node": ">=24"
  },
  "dependencies": {
    "@ouo11y/browser": "0.2.1",
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.1.2",
    "vite": "^8.3.4"
  }
}
```

</details>

Create `frontend/src/rum.js`. No session sampling (a funnel counts sessions), replay for every
session (to watch the ones that drop), inputs masked:

<details>
<summary><code>frontend/src/rum.js</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/frontend/src/rum.js -->
```js
// ouo browser SDK init: sessions, page views and custom events (the funnel steps), errors, fetch
// tracing and session replay, so a session that dropped out of the funnel can be watched.
import { initRUM } from "@ouo11y/browser";

// The API (backend/). Moved it? VITE_API_URL in .env.local.
export const API = import.meta.env.VITE_API_URL || "http://localhost:5001";

export const rum = initRUM({
  // The ouo collector, the only thing the page talks to. Spans and events go to 4318, replay
  // chunks to 4319 (derived from `endpoint` when it uses port 4318). Moved ports? Set
  // VITE_OUO_ENDPOINT and VITE_OUO_REPLAY_ENDPOINT in .env.local.
  endpoint: import.meta.env.VITE_OUO_ENDPOINT || "http://localhost:4318",
  replayEndpoint: import.meta.env.VITE_OUO_REPLAY_ENDPOINT || undefined,
  projectId: "demo",
  projectToken: "pt_dev_demo_0000000000000000", // public by design, ships in the bundle
  service: { name: "tiny-shop-funnels-frontend", version: "1.0.0", environment: "local" },
  // Calls to the API get `traceparent` + `baggage`, so its spans join the browser's trace and the
  // replay, the click and the backend error share one trace id.
  tracing: { propagateTo: [new RegExp(`^${API}/`)] },

  // Every session is kept: a funnel counts sessions, so sampling would scale every step down.
  session: { sampleRate: 1 },
  // Replay of every session, inputs masked: open a dropped session from the funnel and watch it.
  replay: { enabled: true, sampleRate: 1, maskAllInputs: true },
  debug: false,
});
```

</details>

Replace `frontend/src/main.jsx`, so the SDK starts before React renders:

<details>
<summary><code>frontend/src/main.jsx</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/frontend/src/main.jsx -->
```jsx
// Initialise ouo before React renders anything.
import "./rum";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

</details>

Replace `frontend/src/App.jsx`. Compared with step 3:

- **Pages need nothing**: the SDK records every page load and `pushState` as a `navigation` event
  with `url.path`. Those are the funnel's page steps.
- **Three custom events**: `rum.addEvent("add_to_cart")`, `rum.addEvent("checkout_submitted")` and
  `rum.addEvent("order_paid")`. Those are the event steps.
- the API URL comes from `rum.js`, and a declined payment is reported with `rum.captureError`.

<details>
<summary><code>frontend/src/App.jsx</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/frontend/src/App.jsx -->
```jsx
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
```

</details>

```bash
cd ~/Desktop/tiny-shop-funnels/frontend
```

```bash
npm install
```

```bash
npm run dev
```

Check: buy a coffee again as in step 3. In Grafana -> ouo11y RUM -> **Sessions**, open your
session (the newest): its activity list has `Navigation` entries for `/`, `/products/1`, `/cart`,
`/checkout`, `/orders/...` with `add_to_cart`, `checkout_submitted` and `order_paid` between them,
and the replay plays your clicks.

## Step 7. Fifty shoppers

One session makes a dull funnel. The generator drives 50 headless Chromium sessions through the
shop, each a real browser with the real SDK. Each follows one persona (bounce, deep link, out of
order, browse, cart, abandon, declined card, buyer) with random pauses; the seed makes the mix the
same on every run, and it ends with how many sessions must reach each step.

```bash
cd ~/Desktop/tiny-shop-funnels/generate-sessions
```

<details>
<summary><code>generate-sessions/package.json</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/generate-sessions/package.json -->
```json
{
  "name": "tiny-shop-funnels-generate-sessions",
  "private": true,
  "version": "1.0.0",
  "description": "ouo quickstart: drives ~50 real browser sessions through the shop so the funnel has shape",
  "type": "module",
  "scripts": {
    "generate": "node generate.mjs"
  },
  "engines": {
    "node": ">=24"
  },
  "devDependencies": {
    "playwright": "1.64.1"
  }
}
```

</details>
<details>
<summary><code>generate-sessions/generate.mjs</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-funnels/result/generate-sessions/generate.mjs -->
```js
// Drives ~50 sessions through the running shop in headless Chromium, each one a real browser with
// the real SDK, so page views, custom events and replays reach ouo exactly as from people.
// Each session follows one persona; the script prints how many sessions should reach each funnel
// step, so you can check the funnel in Grafana against it.
//
//   npm install && npx playwright install chromium   # once
//   npm run generate                                 # SHOP_URL=http://localhost:5173 by default
import { chromium } from "playwright";

const SHOP = process.env.SHOP_URL || "http://localhost:5173";
const SESSIONS = Number(process.env.SESSIONS || 50);
const PARALLEL = Number(process.env.PARALLEL || 5);

// The funnel the README builds: / -> /products/* -> add_to_cart -> /checkout -> order_paid.
const STEPS = ["page:/", "page:/products/*", "event:add_to_cart", "page:/checkout", "event:order_paid"];

// Persona: weight (share of sessions), the funnel step it reaches (0: never enters) and what it does.
const PERSONAS = {
  bounce: { weight: 10, reaches: 1, run: async (s) => { await s.open("/"); } },
  // Lands on a product from a link, never sees the home page: not in the funnel (step 1 is /).
  deepLink: { weight: 10, reaches: 0, run: async (s) => { await s.open("/products/2"); await s.add(); await s.checkout(); await s.pay("4242"); } },
  // Adds to cart first and visits / afterwards: the order matters, so it only reaches step 1.
  outOfOrder: { weight: 6, reaches: 1, run: async (s) => { await s.open("/products/1"); await s.add(); await s.home(); } },
  browse: { weight: 18, reaches: 2, run: async (s) => { await s.open("/"); await s.product(); if (s.coin()) { await s.home(); await s.product(); } } },
  cart: { weight: 16, reaches: 3, run: async (s) => { await s.open("/"); await s.product(); await s.add(); if (s.coin()) await s.add(); } },
  abandon: { weight: 12, reaches: 4, run: async (s) => { await s.open("/"); await s.product(); await s.add(); await s.checkout(); } },
  declined: { weight: 8, reaches: 4, run: async (s) => { await s.open("/"); await s.product(); await s.add(); await s.checkout(); await s.pay("0002"); } },
  buyer: { weight: 20, reaches: 5, run: async (s) => { await s.open("/"); await s.product(); if (s.coin()) { await s.home(); await s.product(); } await s.add(); await s.checkout(); await s.pay("4242"); } },
};

// Deterministic: the same seed gives the same personas and pauses (Mulberry32).
let seed = Number(process.env.SEED || 7);
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pickPersonas(n) {
  // Largest remainder: the counts follow the weights exactly, then the order is shuffled.
  const names = Object.keys(PERSONAS);
  const total = names.reduce((s, k) => s + PERSONAS[k].weight, 0);
  const exact = names.map((k) => (PERSONAS[k].weight * n) / total);
  const counts = exact.map(Math.floor);
  const order = exact.map((x, i) => [x - counts[i], i]).sort((a, b) => b[0] - a[0]);
  for (let i = 0; counts.reduce((a, b) => a + b, 0) < n; i++) counts[order[i][1]]++;
  const list = names.flatMap((k, i) => Array(counts[i]).fill(k));
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const pause = (page, min, max) => page.waitForTimeout(min + rand() * (max - min));

function session(page) {
  const s = {
    coin: () => rand() < 0.5,
    open: async (path) => {
      await page.goto(SHOP + path);
      await page.waitForLoadState("networkidle");
      await pause(page, 300, 1500);
    },
    home: async () => {
      await page.getByRole("link", { name: "Tiny Shop" }).click();
      await pause(page, 300, 1200);
    },
    product: async () => {
      const links = page.locator("ul li a");
      await links.first().waitFor();
      await links.nth(Math.floor(rand() * (await links.count()))).click();
      await pause(page, 800, 4000); // reading the product page
    },
    add: async () => {
      await page.getByRole("button", { name: /Add to cart/ }).click();
      await pause(page, 300, 1500);
    },
    checkout: async () => {
      await page.getByTestId("cart-link").click();
      await pause(page, 300, 1200);
      await page.getByRole("button", { name: "Go to checkout" }).click();
      await pause(page, 1000, 5000); // finding the card
    },
    pay: async (card) => {
      await page.getByPlaceholder("card number").fill(`4000 0000 0000 ${card}`);
      await page.getByRole("button", { name: "Pay" }).click();
      await page.waitForLoadState("networkidle");
      await pause(page, 500, 1500);
    },
  };
  return s;
}

async function runOne(browser, persona, i) {
  const context = await browser.newContext(); // fresh storage: a new user and a new session
  const page = await context.newPage();
  try {
    await PERSONAS[persona].run(session(page));
    // Leaving the page flushes the SDK's last batch (pagehide) and ends the session.
    await page.goto("about:blank");
    await page.waitForTimeout(1000);
  } catch (err) {
    console.error(`session ${i} (${persona}) failed: ${err.message}`);
    return false;
  } finally {
    await context.close();
  }
  console.log(`session ${String(i + 1).padStart(2)} ${persona}`);
  return true;
}

const personas = pickPersonas(SESSIONS);
const browser = await chromium.launch();
const ok = [];
let next = 0;
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    while (next < personas.length) {
      const i = next++;
      if (await runOne(browser, personas[i], i)) ok.push(personas[i]);
    }
  })
);
await browser.close();

// The hand count: sessions reaching each step, from the personas that ran.
console.log(`\n${ok.length} sessions sent. Expected funnel ${STEPS.join(" -> ")}:`);
let prev;
STEPS.forEach((step, i) => {
  const n = ok.filter((p) => PERSONAS[p].reaches > i).length;
  const drop = prev === undefined ? "" : `   dropped ${prev - n}`;
  console.log(`  ${i + 1}. ${step.padEnd(20)} ${String(n).padStart(3)} sessions${drop}`);
  prev = n;
});
console.log(`  (not entered: ${ok.filter((p) => PERSONAS[p].reaches === 0).length} sessions that never opened /)`);
```

</details>

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm run generate
```

Check: after about a minute it prints

```
50 sessions sent. Expected funnel page:/ -> page:/products/* -> event:add_to_cart -> page:/checkout -> event:order_paid:
  1. page:/                45 sessions
  2. page:/products/*      37 sessions   dropped 8
  3. event:add_to_cart     28 sessions   dropped 9
  4. page:/checkout        20 sessions   dropped 8
  5. event:order_paid      10 sessions   dropped 10
  (not entered: 5 sessions that never opened /)
```

That is the answer Grafana must give, plus your own session from step 6.

## Step 8. Build the funnel in Grafana

http://localhost:3000 -> More apps -> ouo11y RUM -> **Funnels**, time range **Last 1 hour**.

1. Step 1 is already **Page**, **is**, `/`. Click its value box: it lists the paths seen in the
   range, most frequent first.
2. Step 2: set **starts with**, type `/products/` and pick "Use this value": any product page.
3. **Add step**: **Event**, `add_to_cart` (custom event names are suggested too).
4. **Add step**: switch it to **Page**, **is**, `/checkout`.
5. **Add step**: **Event**, `order_paid`.
6. **Service**: `tiny-shop-funnels-frontend`, then Enter.

Check: the bars read 46, 38, 29, 21, 11: the generator's numbers plus your purchase. The address
bar now holds the funnel (`...&step=page:/&step=page:/products/*&step=event:add_to_cart&...`):
copy it to share it.

Under each bar: the big percentage is relative to step 1; **% of previous step** is the step's own
conversion (checkout -> paid is about 50%, the leak); **median · p75** is the time from the
previous step. The 5 deep-link sessions never opened `/`, so they are not in this funnel; the 3
out-of-order ones added to cart before opening `/` and count for step 1 only. The full rules are
in [docs/funnels.md](../../../docs/funnels.md).

## Step 9. From a drop-off to the replay

1. Click the hatched **−10** above **order_paid**: the 10 sessions that reached `/checkout` and
   did not pay, with their last page and how long they took to get stuck.
2. Click **Replay** on a row. The session page opens: a declined one shows `Error: checkout
   failed: card declined` and the failed `POST /api/checkout`; an abandoned one stops on the form.

Check: the replay plays that shopper's path, the card input masked.

## Step 10. Clean up

Stop the API and Vite with Ctrl+C. Stop the stack, keeping its data:

```bash
cd ~/Desktop/tiny-shop-funnels/stack
```

```bash
docker compose down
```

or delete its data and replays too:

```bash
docker compose down -v
```

## When something does not work

| You see | Cause and fix |
|---|---|
| `Bind for 0.0.0.0:4318 failed: port is already allocated` (or 3000, 3100, 3200, 13133) | another stack has the port: `export OUO_GRAFANA_PORT=13000 OUO_OTLP_HTTP_PORT=14318 OUO_REPLAY_PORT=14319 OUO_LOKI_PORT=13100 OUO_TEMPO_PORT=13200 OUO_COLLECTOR_HEALTH_PORT=13134` before `up`, then `OUO_OTLP_ENDPOINT=http://localhost:14318 npm start` for the API and `frontend/.env.local` with `VITE_OUO_ENDPOINT=http://localhost:14318` and `VITE_OUO_REPLAY_ENDPOINT=http://localhost:14319` |
| `docker compose up` fails with `unable to prepare context` or a missing `ouo11y` context | `OUO11Y_REPO` is not set in this terminal, or does not point at the clone: step 4 |
| `denied` when pulling `ghcr.io/ouo11y/collector` | not logged in to ghcr.io: step 4 |
| No **Funnels** page in the app menu | Grafana is not the image built in step 4: `docker compose up -d --build`, then hard-reload the browser |
| The step box suggests nothing | no page views in the range yet: buy once (step 6), time range **Last 1 hour** |
| Every bar is 0 | step 1 does not match (`/` vs `/home`) or the Service filter has a typo; check the paths on a session page |
| More sessions than the generator printed | your own sessions or a second `npm run generate`: every run adds the same 45 / 37 / 28 / 20 / 10 |
| `generate` times out on `Add to cart` | the shop is not on 5173: `SHOP_URL=http://localhost:<port> npm run generate` |
| Bars a little low right after the run | each page's last events are sent when it is left: wait 10 s and **Refresh** |
| CORS error on `/v1/logs` or `/v1/replay/chunks` in the browser console | the shop is not on `localhost` / `127.0.0.1`, or the replay URL is wrong after moving ports |
