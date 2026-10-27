# Build Tiny Shop with OpenTelemetry and rrweb, without the ouo SDK

This guide is for teams that want ouo's sessions, errors, traces and replays but do not want
`@ouo11y/browser` in their web app. You instrument the browser yourself with the OpenTelemetry JS
SDK, [rrweb](https://github.com/rrweb-io/rrweb) and Google's
[web-vitals](https://github.com/GoogleChrome/web-vitals), and send the data to the ouo collector
in the shape ouo reads. Nothing in the browser is ouo code.

You build, one step at a time, with no scripts:

1. a plain Express API and a plain React page, with no telemetry at all;
2. the ouo stack (the ouo collector, Tempo, Loki, Mimir, rum-api, Grafana), one folder per service;
3. the backend traced with the OpenTelemetry Node SDK (the same as in [Tiny Shop](../tiny-shop/build-it-yourself-guide.md));
4. the browser, by hand: OpenTelemetry spans and logs, a session id, the RUM events ouo
   understands, and rrweb replay in chunks.

At the end your files are the same as [`result/`](result): compare with them when you are
stuck. Plan on about 45 minutes.

```
tiny-shop-otel/
├── stack/      the ouo stack, one folder per service
├── backend/    Express API, OpenTelemetry traces
└── frontend/   React app, OpenTelemetry + rrweb + web-vitals, no ouo SDK
```

Every command goes in its own block: run them one by one, in order. Paths are relative to
`tiny-shop-otel/`, wherever you create it, and each command says which of its folders it runs
in. When a step says "replace the file", select everything in it and paste the new content over it.

## What ouo needs from a browser

This is the whole contract. The SDK does exactly this; here you do it yourself, and each line
links to the step that builds it.

| What | How | Step |
|---|---|---|
| **Where** | OTLP/HTTP to the collector (`:4318/v1/traces`, `:4318/v1/logs`), every request with `Authorization: Basic base64("<project id>:<project token>")` | [6a](#6a-send-spans-to-ouo) |
| **Who** | resource attributes `service.name`, `service.version`, `deployment.environment.name`, `ouo.platform = "web"` | [6a](#6a-send-spans-to-ouo) |
| **Which session** | `session.id` and `user.id` on **every** span and log record (attributes, not resource: the session can change while the page lives), and in the `baggage` header to your API | [6a](#6a-send-spans-to-ouo) |
| **What happened** | OTLP log records whose `event.name` is `session.start`, `session.end`, `exception`, `http.request.failed`, `navigation` or `web_vital`, with the attributes in [the session spec](../../../docs/specs/session-lifecycle.md#session-events-otel-log-records); any other name is a custom event | [6b](#6b-send-the-rum-events) |
| **Replay** | rrweb events in chunks `{ session_id, seq, started_at, ended_at, events }`, `POST` to the collector's replay port (`:4319/v1/replay/chunks`) with the same credential and `x-ouo-session-id`, `x-ouo-seq` headers | [6c](#6c-record-the-replay) |

From these, ouo builds the session (healthy, errored or crashed), its timeline, its traces and its
replay. A session whose events carry `ouo.exception.fatal = true` is `crashed`; one with a non-fatal
exception or an `http.request.failed` is `errored`.

## Step 0. Check your tools

Node 24 or newer:

```bash
node -v
```

Docker Desktop must be running. This prints the server details, not "Cannot connect":

```bash
docker info
```

VS Code's `code` command. If it is not found, open VS Code, press Cmd+Shift+P and run
**Shell Command: Install 'code' command in PATH**.

```bash
code --version
```

## Step 1. Create the folders and open VS Code

From the folder where you keep your projects:

```bash
mkdir -p tiny-shop-otel/backend tiny-shop-otel/stack
```

```bash
cd tiny-shop-otel
```

```bash
code .
```

In VS Code, open a terminal with Ctrl+\`. You will use three terminal tabs (the `+` button):
one for the backend, one for the frontend, one for the stack. Each new tab opens in
`tiny-shop-otel/`.

## Step 2. A simple API, no telemetry yet

In the first terminal tab, from `tiny-shop-otel/`:

```bash
cd backend
```

```bash
npm init -y
```

```bash
npm install express cors
```

Create `backend/server.js`:

```js
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const products = [
  { id: 1, name: "Coffee", price: 4 },
  { id: 2, name: "Tea", price: 3 },
  { id: 3, name: "Cake", price: 6 },
];

app.get("/api/products", async (req, res) => {
  await sleep(80);
  res.json(products);
});

app.post("/api/checkout", async (req, res) => {
  await sleep(150);
  res.json({ ok: true, orderId: Math.floor(Math.random() * 100000) });
});

app.get("/api/fail", (req, res) => {
  res.status(500).json({ error: "inventory service unavailable" });
});

app.listen(5001, () => console.log("tiny-shop API on http://localhost:5001"));
```

Run it:

```bash
node server.js
```

In another terminal tab, check that it answers:

```bash
curl localhost:5001/api/products
```

You get the three products as JSON. Leave the API running.

## Step 3. A dummy React UI

In the second terminal tab, from `tiny-shop-otel/` (Vite creates `frontend/`):

```bash
npm create vite@latest frontend -- --template react --no-interactive
```

```bash
cd frontend
```

```bash
npm install
```

Replace `frontend/src/App.jsx` with:

```jsx
import { useEffect, useState } from "react";

const API = "http://localhost:5001";

export default function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${API}/api/products`).then((r) => r.json()).then(setProducts);
  }, []);

  async function checkout() {
    const res = await fetch(`${API}/api/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: cart.map((p) => p.id) }),
    });
    const data = await res.json();
    setMessage(`Order #${data.orderId} placed`);
    setCart([]);
  }

  async function callBrokenApi() {
    const res = await fetch(`${API}/api/fail`);
    setMessage(`API answered ${res.status}`);
  }

  function crash() {
    throw new Error("Button exploded");
  }

  return (
    <main style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "40px auto" }}>
      <h1>Tiny Shop</h1>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            {p.name} (${p.price}) <button onClick={() => setCart([...cart, p])}>Add</button>
          </li>
        ))}
      </ul>
      <p>Cart: {cart.length} item(s)</p>
      <button onClick={checkout} disabled={!cart.length}>Checkout</button>{" "}
      <button onClick={callBrokenApi}>Call broken API</button>{" "}
      <button onClick={crash}>Throw error</button>
      <p>{message}</p>
    </main>
  );
}
```

Start it:

```bash
npm run dev
```

Open http://localhost:5173. You see the three products (the page reached your API). Click
**Add**, then **Checkout**: "Order #… placed". The app works, and nothing is instrumented yet.

## Step 4. The stack, one service at a time

### 4a. Create the files

Six services, one folder each. Each folder holds that service's compose file and its config, and
each file starts with what the service is for, who sends it data and its ports. Open a block, copy
all of it, and paste it into the file named in its title (VS Code creates the folders when you
save a new file as `stack/10-collector/compose.yaml`).

`compose.yaml` only lists the service folders:

<details>
<summary><code>stack/compose.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-otel/result/stack/compose.yaml -->
```yaml
# The ouo stack for tiny-shop-otel: one folder per service, each with its compose file and
# its config. This file only lists them. Start everything from this folder: `docker compose up -d`.
# Grafana http://localhost:3000 (admin / testing567), OTLP http://localhost:4318, replay :4319.
# Ports taken? Export OUO_GRAFANA_PORT, OUO_OTLP_HTTP_PORT, OUO_REPLAY_PORT before `up`.
include:
  - 10-collector/compose.yaml   # ingest: the only thing the apps talk to
  - 20-tempo/compose.yaml       # traces
  - 30-loki/compose.yaml        # logs and browser events
  - 40-mimir/compose.yaml       # metrics (none from this shop yet; the collector accepts /v1/metrics)
  - 50-rum-api/compose.yaml     # sessions and replay for the Grafana plugin
  - 60-grafana/compose.yaml     # the UI: datasources and the ouo11y RUM app
```

</details>

**The collector** is the only thing your apps talk to. It checks the project credential
(`projects.htpasswd`) and routes traces, logs, metrics and replay chunks.

<details>
<summary><code>stack/10-collector/compose.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-otel/result/stack/10-collector/compose.yaml -->
```yaml
# ouo-collector: the only ingest. The browser and the Node API send OTLP here; it checks the
# project credential and forwards traces to Tempo, logs to Loki, metrics to Mimir and replay
# chunks to rum-api. Ports: 4318 OTLP/HTTP, 4319 replay (both public), 13133 health (loopback).
services:
  otel-collector:
    # `latest` follows each release. Tested with 0.4.0: pin `collector:0.4.0` or
    # `collector@sha256:ca0d001dc58153671fc501cbe280a69f86dc3e681a1b4621e827dedadb7727f2` to stay on it.
    image: ghcr.io/ouo11y/collector:latest
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
    depends_on: [tempo, loki, mimir]
```

</details>

<details>
<summary><code>stack/10-collector/config.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-otel/result/stack/10-collector/config.yaml -->
```yaml
# ouo-collector pipelines, a trimmed copy of the full stack's config (no Sentry bridge, no
# rate limits). Receivers: OTLP/HTTP on 4318 and replay chunks on 4319, both behind the
# project credential in projects.htpasswd. Exporters: Tempo, Loki, Mimir and rum-api.

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
  ouoreplay:
    endpoint: 0.0.0.0:4319
    include_metadata: true
    max_request_body_size: 8388608
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
  otlp_http/mimir:
    endpoint: http://mimir:9009/otlp
    tls: { insecure: true }
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
    metrics:
      receivers: [otlp]
      processors: [resource/project, batch]
      exporters: [otlp_http/mimir]
    logs/replay:
      receivers: [ouoreplay]
      exporters: [ouoreplay]
```

</details>

<details>
<summary><code>stack/10-collector/projects.htpasswd</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-otel/result/stack/10-collector/projects.htpasswd -->
```text
# Projects allowed to send data: one line per project, project id and SHA hash of its token.
# Read by the collector's basicauth extension. The `demo` token (pt_dev_demo_0000000000000000)
# is public: local use only. Make a line with htpasswd -nbs PROJECT TOKEN. No colon in comments.
demo:{SHA}IUpHBAUPHvXoJmvv4inmF4cN96I=
```

</details>

**The three stores**: Tempo for traces, Loki for logs and browser events, Mimir for metrics.
This shop sends no metrics yet; Mimir is there so the collector's `/v1/metrics` has somewhere
to go.

<details>
<summary><code>stack/20-tempo/compose.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-otel/result/stack/20-tempo/compose.yaml -->
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

<!-- embed: examples/quickstarts/tiny-shop-otel/result/stack/20-tempo/config.yaml -->
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

<details>
<summary><code>stack/30-loki/compose.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-otel/result/stack/30-loki/compose.yaml -->
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

<!-- embed: examples/quickstarts/tiny-shop-otel/result/stack/30-loki/config.yaml -->
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

<details>
<summary><code>stack/40-mimir/compose.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-otel/result/stack/40-mimir/compose.yaml -->
```yaml
# Mimir: stores metrics. The collector pushes the API's OTLP metrics to /otlp; Grafana queries
# it with PromQL on 9009 (/prometheus). Port 9009 is published on loopback for curl.
services:
  mimir:
    image: grafana/mimir:3.2.1
    command: ["-config.file=/etc/mimir/config.yaml"]
    ports:
      - "127.0.0.1:${OUO_MIMIR_PORT:-9009}:9009"
    volumes:
      - ./config.yaml:/etc/mimir/config.yaml:ro
      - mimir-data:/data

volumes:
  mimir-data:
```

</details>

<details>
<summary><code>stack/40-mimir/config.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-otel/result/stack/40-mimir/config.yaml -->
```yaml
# Mimir in monolithic mode (target: all) on one machine, filesystem storage.
# OTLP push at :9009/otlp/v1/metrics, PromQL at :9009/prometheus.
target: all
multitenancy_enabled: false

server:
  http_listen_port: 9009
  grpc_listen_port: 9095
  log_level: warn

common:
  storage:
    backend: filesystem
    filesystem:
      dir: /data/blocks

blocks_storage:
  storage_prefix: blocks
  bucket_store:
    sync_dir: /data/tsdb-sync
  tsdb:
    dir: /data/tsdb

compactor:
  data_dir: /data/compactor
  sharding_ring:
    instance_addr: 127.0.0.1
    kvstore: { store: memberlist }

distributor:
  ring:
    instance_addr: 127.0.0.1
    kvstore: { store: memberlist }

ingester:
  ring:
    instance_addr: 127.0.0.1
    replication_factor: 1
    kvstore: { store: memberlist }

store_gateway:
  sharding_ring:
    instance_addr: 127.0.0.1
    replication_factor: 1
    kvstore: { store: memberlist }

ruler_storage:
  storage_prefix: rules

alertmanager_storage:
  storage_prefix: alertmanager

memberlist:
  bind_addr: [127.0.0.1]
  join_members: []

limits:
  # Keep OTel metric names as sent: shop.orders becomes shop_orders, not shop_orders_total.
  otel_metric_suffixes_enabled: false
```

</details>

**rum-api** builds sessions from Loki and Tempo and gives each a status (healthy, errored,
crashed); the Grafana plugin reads it. It also stores the replay chunks.

<details>
<summary><code>stack/50-rum-api/compose.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-otel/result/stack/50-rum-api/compose.yaml -->
```yaml
# rum-api: the ouo platform service behind the Grafana plugin. It builds the session list
# (healthy / errored / crashed) from Loki and Tempo and stores replay chunks the collector
# forwards. Internal: only the collector and Grafana talk to it, on 8080 inside the network.
services:
  rum-api:
    # `latest` follows each release. Tested with 0.5.0: pin `rum-api:0.5.0` or
    # `rum-api@sha256:1ee9e606220df2c42f4ade4131fdd3f82085d6e814676a771754a85a6ae78336` to stay on it.
    image: ghcr.io/ouo11y/rum-api:latest
    command: ["-config.file=/etc/rum-api/config.yaml", "-config.expand-env=true"]
    environment:
      GRAFANA_URL: http://localhost:${OUO_GRAFANA_PORT:-3000}   # for deep links
      OUO_INGEST_TOKEN: it_dev_0000000000000000   # the collector's; development value
      OUO_READ_TOKEN: rt_dev_0000000000000000     # Grafana's; development value
      DATA_DIR: /home/nonroot                     # the image runs as nonroot
      # rum-api's own traces and logs (0.5.0 and later), through the collector like the shop's.
      # Without these it retries localhost:4318 inside its container and logs every failure.
      OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4318
      OTEL_EXPORTER_OTLP_HEADERS: Authorization=Basic%20ZGVtbzpwdF9kZXZfZGVtb18wMDAwMDAwMDAwMDAwMDAw
      OTEL_EXPORTER_OTLP_PROTOCOL: http/protobuf
      OTEL_SERVICE_NAME: rum-api
    volumes:
      - ./config.yaml:/etc/rum-api/config.yaml:ro
      - rum-api-data:/home/nonroot
    depends_on: [loki, tempo, otel-collector]

volumes:
  rum-api-data:
```

</details>

<details>
<summary><code>stack/50-rum-api/config.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-otel/result/stack/50-rum-api/config.yaml -->
```yaml
# rum-api configuration: where Loki and Tempo are, and the session timeouts.
# The tokens come from the environment set in compose.yaml (-config.expand-env=true).
# Replays are stored on the rum-api-data volume.
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

storage:
  backend: filesystem
```

</details>

**Grafana** with the ouo11y RUM app and its datasources.

<details>
<summary><code>stack/60-grafana/compose.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-otel/result/stack/60-grafana/compose.yaml -->
```yaml
# Grafana with the ouo11y RUM app plugin: the UI for everything above. It reads Tempo, Loki and
# Mimir directly and sessions from rum-api through the plugin. Port 3000, admin / testing567.
# provisioning/ sets up the datasources and the plugin.
services:
  grafana:
    # `latest` follows each release. Tested with 0.5.0: pin `grafana:0.5.0` or
    # `grafana@sha256:57607a3616c88867644be1f69abb4681ca73df05d6bf2682543418f0dfeb622f` to stay on it.
    image: ghcr.io/ouo11y/grafana:latest
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
    depends_on: [loki, tempo, mimir, rum-api]
```

</details>

<details>
<summary><code>stack/60-grafana/provisioning/datasources/datasources.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-otel/result/stack/60-grafana/provisioning/datasources/datasources.yaml -->
```yaml
# Grafana datasources: Loki (logs), Tempo (traces), Mimir (metrics), all inside the network.
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
    jsonData:
      lokiSearch:
        datasourceUid: loki

  - name: Mimir
    uid: mimir
    type: prometheus
    url: http://mimir:9009/prometheus
    isDefault: true
    jsonData:
      prometheusType: Mimir
      timeInterval: 15s
```

</details>

<details>
<summary><code>stack/60-grafana/provisioning/plugins/ouo11y-rum-app.yaml</code> (click to open)</summary>

<!-- embed: examples/quickstarts/tiny-shop-otel/result/stack/60-grafana/provisioning/plugins/ouo11y-rum-app.yaml -->
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

**Image versions.** The three ouo images use the `latest` tag, which follows every release. The
compose files say which version this guide was tested with and its digest: pin
`ghcr.io/ouo11y/rum-api:0.5.0`, or the `@sha256:...` digest, to keep a stack on one version. The
configs in this guide are written for the tested versions; a much newer rum-api may refuse a
config key it no longer knows, and the error in `docker compose logs rum-api` names it.

### 4b. Log in to ghcr.io

The ouo images are private for now. You need read access to the `ouo11y` packages and a
**classic** GitHub token with only the `read:packages` scope. Put the token in your shell
(`export GHCR_TOKEN=...`), never in a file, then:

```bash
echo $GHCR_TOKEN | docker login ghcr.io -u <your-github-user> --password-stdin
```

### 4c. Check the ports

The stack publishes 3000 (Grafana) and the collector's 4318 (OTLP) and 4319 (replay) to your
network, and 3100, 3200, 9009 and 13133 on loopback only. This prints nothing when they are all free:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3100|3200|4318|4319|9009|13133) '
```

If something is listed, do not stop it: move this stack instead. From `stack/`:

```bash
code .env
```

and set the ports that are taken, for example:

```
OUO_GRAFANA_PORT=13000
OUO_OTLP_HTTP_PORT=14318
OUO_REPLAY_PORT=14319
```

Compose reads `.env` on its own. The others are `OUO_LOKI_PORT`, `OUO_TEMPO_PORT`,
`OUO_MIMIR_PORT` and `OUO_COLLECTOR_HEALTH_PORT` (the `${OUO_..._PORT:-...}` lines in the
compose files). Remember the new collector ports: steps 5 and 6 tell you where they go.

### 4d. Start it

In the third terminal tab, from `tiny-shop-otel/`:

```bash
cd stack
```

```bash
docker compose up -d
```

```bash
docker compose ps
```

Six services are `Up`, and `rum-api` becomes `healthy`. Open http://localhost:3000 and log in
with **admin / testing567**. **More apps -> ouo11y RUM** is there and still empty.

## Step 5. Instrument the backend

The backend is the same as in Tiny Shop: the OpenTelemetry Node SDK has never needed the ouo SDK.
Stop the API with Ctrl+C in its terminal tab (still in `backend/`), then:

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/sdk-trace @opentelemetry/exporter-trace-otlp-http @opentelemetry/instrumentation-http @opentelemetry/instrumentation-express @opentelemetry/baggage-span-processor @opentelemetry/resources @opentelemetry/semantic-conventions
```

Create `backend/instrumentation.js`:

<!-- embed: examples/quickstarts/tiny-shop-otel/result/backend/instrumentation.js -->
```js
// OpenTelemetry SDK init. Loaded before the app with `node --require ./instrumentation.js`
// so the http and express instrumentations can patch those modules before server.js loads them.
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
const exporter = new OTLPTraceExporter({
  url: `${endpoint}/v1/traces`,
  headers: { Authorization: "Basic ZGVtbzpwdF9kZXZfZGVtb18wMDAwMDAwMDAwMDAwMDAw" },
});

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "tiny-shop-otel-backend",
    [ATTR_SERVICE_VERSION]: "1.0.0",
    "deployment.environment.name": "local",
  }),
  spanProcessors: [
    // The browser sends `baggage: session.id=...,user.id=...`; copy it onto every span so
    // backend spans can be searched by the RUM session.
    new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS),
    // OTel JS 3.0: options object, `{ exporter }` (2.x took the exporter itself).
    new BatchSpanProcessor({ exporter }),
  ],
  instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
});

sdk.start();
console.log(`[otel] tracing to ${endpoint}/v1/traces`);

const shutdown = () => sdk.shutdown().finally(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

Replace `backend/server.js` with:

<!-- embed: examples/quickstarts/tiny-shop-otel/result/backend/server.js -->
```js
// The API. HTTP server spans come from the auto-instrumentation; the spans below are manual.
const express = require("express");
const cors = require("cors");
const { trace, SpanStatusCode } = require("@opentelemetry/api");

const tracer = trace.getTracer("tiny-shop-otel-backend");
const app = express();
// The browser calls this API from another origin and adds `traceparent` and `baggage`
// headers; cors() answers the preflight for them.
app.use(cors());
app.use(express.json());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const products = [
  { id: 1, name: "Coffee", price: 4 },
  { id: 2, name: "Tea", price: 3 },
  { id: 3, name: "Cake", price: 6 },
];

app.get("/api/products", async (req, res) => {
  // A manual span around a "database" call.
  const result = await tracer.startActiveSpan("db.select products", async (span) => {
    span.setAttribute("db.system.name", "fake-db");
    await sleep(50 + Math.random() * 100);
    span.setAttribute("app.products.count", products.length);
    span.end();
    return products;
  });
  res.json(result);
});

app.post("/api/checkout", async (req, res) => {
  const items = req.body.items || [];
  // A parent span with two nested children.
  await tracer.startActiveSpan("checkout", async (span) => {
    span.setAttribute("app.cart.items", items.length);
    await tracer.startActiveSpan("validate cart", async (child) => {
      await sleep(30);
      child.end();
    });
    await tracer.startActiveSpan("charge card", async (child) => {
      await sleep(120);
      child.addEvent("payment accepted");
      child.end();
    });
    span.end();
  });
  res.json({ ok: true, orderId: Math.floor(Math.random() * 100000) });
});

app.get("/api/fail", (req, res) => {
  // Enrich the auto-created HTTP span with the error.
  const span = trace.getActiveSpan();
  const err = new Error("inventory service unavailable");
  span?.recordException(err);
  span?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  res.status(500).json({ error: err.message });
});

const port = Number(process.env.PORT || 5001);
app.listen(port, () => console.log(`tiny-shop API on http://localhost:${port}`));
```

The SDK has to load **before** Express so the instrumentation can patch it. Save that as the
start script, then start the API:

```bash
npm pkg set scripts.start="node --require ./instrumentation.js server.js"
```

```bash
npm start
```

It prints `[otel] tracing to http://localhost:4318/v1/traces`. Collector on 14318 (step 4c)?
Stop it and start it with `OUO_OTLP_ENDPOINT=http://localhost:14318 npm start` instead.

The line that matters for this guide is `BaggageSpanProcessor`: in step 6a the browser sends
`baggage: session.id=...,user.id=...` with every API call, and this processor copies both onto
every backend span. The full walk-through of these two files is
[Tiny Shop, step 5](../tiny-shop/build-it-yourself-guide.md#step-5-instrument-the-backend).

## Step 6. Instrument the web app by hand

Stop Vite with Ctrl+C in its terminal tab (still in `frontend/`), then install what the browser
needs:

```bash
npm install @opentelemetry/api @opentelemetry/core @opentelemetry/resources @opentelemetry/sdk-trace @opentelemetry/sdk-logs @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-logs-otlp-http @opentelemetry/instrumentation @opentelemetry/browser-instrumentation rrweb web-vitals
```

| Package | What it does here |
|---|---|
| `@opentelemetry/api` | what your code calls: `trace`, `logs`, `propagation`, `context` |
| `@opentelemetry/sdk-trace` | the tracer provider, span processors, and `StackContextManager` for the browser (OpenTelemetry JS 3.0 merged `sdk-trace-web` into it) |
| `@opentelemetry/sdk-logs` | the logger provider: RUM events are OTLP log records |
| `@opentelemetry/exporter-trace-otlp-http`, `exporter-logs-otlp-http` | send spans and logs to the collector over OTLP/HTTP |
| `@opentelemetry/instrumentation` | `registerInstrumentations()`, which turns instrumentations on; it records nothing itself |
| `@opentelemetry/browser-instrumentation` | only its `experimental/fetch` part here: a span for every `fetch`, with `traceparent` on calls to your API |
| `@opentelemetry/core`, `resources` | the W3C trace-context and baggage propagators; the resource (who sent the data) |
| `rrweb` | records the DOM for session replay |
| `web-vitals` | LCP, INP, CLS, FCP, TTFB, measured the way Chrome measures them |

<details>
<summary>Which OpenTelemetry browser package is which? (click to open)</summary>

The names are close and several are on their way out. As of OpenTelemetry JS 3.0:

| Package | Status | What it is |
|---|---|---|
| `@opentelemetry/sdk-trace` | current | The tracer provider. Since 3.0 it also has the browser's `StackContextManager`. |
| `@opentelemetry/sdk-trace-web` | deprecated ("Use @opentelemetry/sdk-trace") | The old browser tracer provider, with `register()`. Its last version is 2.x. |
| `@opentelemetry/instrumentation` | current | The base class every instrumentation extends, and `registerInstrumentations()`. Collects nothing on its own. |
| `@opentelemetry/instrumentation-fetch`, `instrumentation-xml-http-request` | deprecated in their READMEs (npm does not flag them) | The old fetch and XHR span instrumentations from the opentelemetry-js repo. |
| `@opentelemetry/instrumentation-document-load`, `instrumentation-user-interaction` | contrib, older | Page-load spans and click spans from opentelemetry-js-contrib. |
| `@opentelemetry/browser-instrumentation` | experimental, from the new [opentelemetry-browser](https://github.com/open-telemetry/opentelemetry-browser) repo | The replacements, one import path each under `experimental/`: `fetch`, `xhr`, `navigation`, `navigation-timing`, `resource-timing`, `user-action`, `web-vitals`, `console`, `errors`. |
| `@opentelemetry/browser-sdk` | experimental, same repo | A one-call setup of the providers and those instrumentations. |
| `@opentelemetry/instrumentation-web` | does not exist | Often what people mean by one of the above. |

This guide takes only `fetch` from `@opentelemetry/browser-instrumentation`. Spans are matched to
the session by their `session.id` attribute, so the span shape does not matter to ouo. Its other
instrumentations emit events with their own names and attributes: `browser.navigation`,
`browser.web_vital` and `browser.user_action.click` would be custom events to ouo, not page views
or vitals, and their `exception` has no `ouo.exception.fatal`, so a crash would count as errored.
Step 6b writes those events itself. `browser-instrumentation`
0.9 is still built on the 0.223 (2.x) line of `@opentelemetry/instrumentation`; npm installs that
copy next to yours, and it works with the 3.0 SDK because both use the one global API.

</details>

All the telemetry code goes in one folder, `frontend/src/telemetry/`. Create it:

```bash
mkdir src/telemetry
```

### 6a. Send spans to ouo

Three files: where the data goes, the session id, and OpenTelemetry itself.

Create `frontend/src/telemetry/config.js`:

<!-- embed: examples/quickstarts/tiny-shop-otel/result/frontend/src/telemetry/config.js -->
```js
// Where the telemetry goes and who this app is. Moved ports? Override in .env.local.

// The tiny-shop API (backend/).
export const API = import.meta.env.VITE_API_URL || "http://localhost:5001";

// The ouo collector: OTLP/HTTP for spans and logs, and the replay receiver for rrweb chunks.
export const OTLP_ENDPOINT = import.meta.env.VITE_OTLP_ENDPOINT || "http://localhost:4318";
export const REPLAY_ENDPOINT = import.meta.env.VITE_REPLAY_ENDPOINT || "http://localhost:4319";

// Every request to the collector carries the project credential:
// Basic base64("<project id>:<project token>"). The token is public by design: it ships in the bundle.
export const AUTHORIZATION = `Basic ${btoa("demo:pt_dev_demo_0000000000000000")}`;

export const SERVICE = {
  name: "tiny-shop-otel-frontend",
  version: "1.0.0",
  environment: "local",
};
```

Create `frontend/src/telemetry/session.js`. It keeps one session id per visit in
`localStorage`, shared by all tabs, and replaces it after 30 minutes without activity or after
4 hours, which are the rules ouo uses everywhere
([session lifecycle](../../../docs/specs/session-lifecycle.md)):

<!-- embed: examples/quickstarts/tiny-shop-otel/result/frontend/src/telemetry/session.js -->
```js
// The RUM session: one id for one visit, shared by every tab of the origin through localStorage.
// Same rules as ouo's SDKs (docs/specs/session-lifecycle.md): a session ends after 30 minutes
// without activity or after 4 hours, and the next signal starts a new one.
const SESSION_KEY = "tiny-shop.session";
const DEVICE_KEY = "tiny-shop.device";
const INACTIVITY_MS = 30 * 60 * 1000;
const MAX_DURATION_MS = 4 * 60 * 60 * 1000;

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked (private mode, quota): the session lives as long as the page.
  }
}

// device.id: random, one per browser profile, kept across sessions. Never a fingerprint.
export const deviceId = read(DEVICE_KEY) ?? crypto.randomUUID();
write(DEVICE_KEY, deviceId);

const listeners = [];
let current = null;
let lastWrite = 0;

// fn("start", session, previousSession | null) and fn("end", session, reason).
export function onSessionChange(fn) {
  listeners.push(fn);
}

function endReason(session, now) {
  if (now - session.lastActivity >= INACTIVITY_MS) return "inactivity";
  if (now - session.startedAt >= MAX_DURATION_MS) return "max_duration";
  return null;
}

// The current session. Starts one on first use and replaces an expired one, so call it for
// every signal: the id it returns is always valid.
export function getSession() {
  const now = Date.now();
  current = read(SESSION_KEY) ?? current; // another tab may have touched or replaced it
  if (current && !endReason(current, now)) return current;

  const previous = current;
  current = {
    id: crypto.randomUUID(),
    // Anonymous until the app knows the user; the id stays with the browser across sessions.
    userId: previous?.userId ?? crypto.randomUUID(),
    startedAt: now,
    lastActivity: now,
    replaySeq: 0,
  };
  write(SESSION_KEY, current);
  if (previous) for (const fn of listeners) fn("end", previous, endReason(previous, now));
  for (const fn of listeners) fn("start", current, previous);
  return current;
}

// A click, a key, a scroll or a request: the session is still in use.
export function touch() {
  const session = getSession();
  session.lastActivity = Date.now();
  if (session.lastActivity - lastWrite >= 1000) {
    lastWrite = session.lastActivity;
    write(SESSION_KEY, session);
  }
}

// Replay chunks are numbered per session, and a reload continues the numbering.
export function nextReplaySeq() {
  const session = getSession();
  const seq = session.replaySeq++;
  write(SESSION_KEY, session);
  return seq;
}
```

Create `frontend/src/telemetry/otel.js`:

<!-- embed: examples/quickstarts/tiny-shop-otel/result/frontend/src/telemetry/otel.js -->
```js
// OpenTelemetry for the browser: spans and logs to the ouo collector over OTLP/HTTP.
import { context, logs, propagation, trace } from "@opentelemetry/api";
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
// The fetch instrumentation from the opentelemetry-browser repo; @opentelemetry/instrumentation-fetch
// is deprecated in its favour. The package is experimental, hence the path.
import { FetchInstrumentation } from "@opentelemetry/browser-instrumentation/experimental/fetch";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { BatchSpanProcessor, StackContextManager, TracerProvider } from "@opentelemetry/sdk-trace";
import { API, AUTHORIZATION, OTLP_ENDPOINT, REPLAY_ENDPOINT, SERVICE } from "./config.js";
import { deviceId, getSession, touch } from "./session.js";

const headers = { Authorization: AUTHORIZATION };

// Who sent the data. ouo.platform = "web" tells ouo this is a browser app.
const resource = resourceFromAttributes({
  "service.name": SERVICE.name,
  "service.version": SERVICE.version,
  "deployment.environment.name": SERVICE.environment,
  "ouo.platform": "web",
  "device.id": deviceId,
});

// session.id and user.id go on every span, not on the resource: the session can change while
// the page stays open.
class SessionSpanProcessor {
  onStart(span) {
    const session = getSession();
    span.setAttribute("session.id", session.id);
    span.setAttribute("user.id", session.userId);
  }
  onEnd() {}
  forceFlush() {
    return Promise.resolve();
  }
  shutdown() {
    return Promise.resolve();
  }
}

// traceparent joins the API's spans to the browser's trace; baggage carries session.id and
// user.id to the API. The baggage is added at inject time because the browser has no async
// context: baggage set with context.with() is gone by the time fetch sends the request.
class SessionPropagator {
  inner = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  });
  inject(ctx, carrier, setter) {
    const session = getSession();
    const baggage = (propagation.getBaggage(ctx) ?? propagation.createBaggage())
      .setEntry("session.id", { value: session.id })
      .setEntry("user.id", { value: session.userId });
    this.inner.inject(propagation.setBaggage(ctx, baggage), carrier, setter);
  }
  extract(ctx, carrier, getter) {
    return this.inner.extract(ctx, carrier, getter);
  }
  fields() {
    return this.inner.fields();
  }
}

export const tracerProvider = new TracerProvider({
  resource,
  spanProcessors: [
    new SessionSpanProcessor(),
    new BatchSpanProcessor({ exporter: new OTLPTraceExporter({ url: `${OTLP_ENDPOINT}/v1/traces`, headers }) }),
  ],
});

export const loggerProvider = new LoggerProvider({
  resource,
  processors: [
    new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${OTLP_ENDPOINT}/v1/logs`, headers }) }),
  ],
});

context.setGlobalContextManager(new StackContextManager().enable());
propagation.setGlobalPropagator(new SessionPropagator());
trace.setGlobalTracerProvider(tracerProvider);
logs.setGlobalLoggerProvider(loggerProvider);

// Called for every failed fetch; set by events.js (it emits http.request.failed).
let onFailedFetch = () => {};
export function setFailedFetchHandler(fn) {
  onFailedFetch = fn;
}

registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation({
      // Only calls to our API get the trace headers. A RegExp: a plain string must equal the whole URL.
      propagateTraceHeaderCorsUrls: [new RegExp(`^${API}/`)],
      // Never trace the telemetry itself.
      ignoreUrls: [new RegExp(`^${OTLP_ENDPOINT}/`), new RegExp(`^${REPLAY_ENDPOINT}/`)],
      applyCustomAttributesOnSpan(span, request, result) {
        touch();
        if (result.status >= 400) onFailedFetch(request.method ?? "GET", result.url, result.status);
      },
    }),
  ],
});

// Send what is batched now (the page is being hidden and may never come back).
export function flushTelemetry() {
  void tracerProvider.forceFlush();
  void loggerProvider.forceFlush();
}
```

What each part is for:

- **The resource** says who sent the data. `ouo.platform = "web"` is how ouo knows a browser
  sent it; `service.version` is the app version that session health is broken down by.
- **`SessionSpanProcessor`** puts `session.id` and `user.id` on every span when it starts. That
  is how ouo lists a session's traces.
- **`SessionPropagator`** sends `traceparent` (one trace from the click to the API) and
  `baggage` with the session (the API's `BaggageSpanProcessor` copies it onto its spans). It adds
  the baggage itself on every request: the browser has no async context, so baggage set with
  `context.with()` is gone by the time `fetch` sends the request.
- **`propagateTraceHeaderCorsUrls`** must be a RegExp: OpenTelemetry compares a plain string with
  the **whole** request URL, so `"http://localhost:5001"` matches no call and the API starts its own
  trace.
- **`ignoreUrls`** keeps the exporters' own requests to the collector out of the traces.
- **`FetchInstrumentation`** comes from `@opentelemetry/browser-instrumentation/experimental/fetch`,
  the replacement for the deprecated `@opentelemetry/instrumentation-fetch` (same options). Pass
  `sanitizeUrl` if your URLs carry tokens: it rewrites `url.full` before the span records it.
- **The logger provider** is set up now and used in step 6b.

Create `frontend/src/telemetry/index.js`, a first version that only starts the session:

```js
// RUM without the ouo SDK. Import this first, before React.
import "./otel.js";
import { getSession } from "./session.js";

console.log("[telemetry] session", getSession().id);

export { API } from "./config.js";
export function addEvent() {}
```

Replace `frontend/src/main.jsx` with:

<!-- embed: examples/quickstarts/tiny-shop-otel/result/frontend/src/main.jsx -->
```jsx
// Start the telemetry before React renders anything.
import "./telemetry";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

In `frontend/src/App.jsx`, replace the line `const API = "http://localhost:5001";` with:

```jsx
import { API, addEvent } from "./telemetry";
```

Collector moved to 14318 in step 4c? Create `frontend/.env.local`:

```
VITE_OTLP_ENDPOINT=http://localhost:14318
VITE_REPLAY_ENDPOINT=http://localhost:14319
```

Start Vite:

```bash
npm run dev
```

Reload http://localhost:5173 with DevTools open. The Console prints
`[telemetry] session <uuid>`. In the Network tab, the API calls have an `OPTIONS` preflight
(the browser asks the API to accept `traceparent` and `baggage`) and a few seconds later a
`POST /v1/traces` to the collector answers `200`.

Click **Add**, then **Checkout**, wait up to a minute, then in Grafana: **Explore**, **Tempo**,
**TraceQL**:

```
{ resource.service.name = "tiny-shop-otel-backend" && name = "charge card" }
```

Open the newest trace. Its root is the browser:

```
tiny-shop-otel-frontend  POST
└─ tiny-shop-otel-backend  POST /api/checkout
   ├─ middleware - corsMiddleware, middleware - jsonParser, request handler - /api/checkout
   └─ checkout
      ├─ validate cart
      └─ charge card
```

Click any span, the browser's and the API's: `session.id` and `user.id` are on all of them, and
they are the id the Console printed.

### 6b. Send the RUM events

Spans alone are not a session for ouo: it builds sessions from log records. Create
`frontend/src/telemetry/events.js`:

<!-- embed: examples/quickstarts/tiny-shop-otel/result/frontend/src/telemetry/events.js -->
```js
// RUM events as OpenTelemetry log records. ouo reads them by event.name
// (session.start, exception, http.request.failed, navigation, web_vital); any other name is a
// custom event on the session timeline. The body is a one-line summary for the Loki log line;
// ouo itself reads only the attributes.
import { logs, SeverityNumber } from "@opentelemetry/api";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import { setFailedFetchHandler } from "./otel.js";
import { deviceId, getSession, onSessionChange } from "./session.js";

const logger = logs.getLogger("tiny-shop-rum");

export function emit(name, attributes = {}, { severity = "INFO", session = getSession(), body = name } = {}) {
  logger.emit({
    eventName: name,
    severityNumber: SeverityNumber[severity],
    severityText: severity,
    body,
    attributes: { "event.name": name, "session.id": session.id, "user.id": session.userId, ...attributes },
  });
}

// A custom event, e.g. addEvent("cart.added", { "product.id": 1 }).
export function addEvent(name, attributes = {}) {
  emit(name, attributes, { body: `${name} ${JSON.stringify(attributes)}` });
}

// session.start and session.end, with the ids of the session they are about.
onSessionChange((type, session, detail) => {
  if (type === "start") {
    emit(
      "session.start",
      {
        "ouo.session.started_at": session.startedAt,
        "device.id": deviceId,
        ...(detail ? { "session.previous_id": detail.id } : {}),
      },
      { session, body: `session.start ${session.id}` },
    );
  } else {
    emit(
      "session.end",
      {
        "ouo.session.end_reason": detail,
        "ouo.session.duration_ms": session.lastActivity - session.startedAt,
        "device.id": deviceId,
      },
      { session, body: `session.end ${session.id} (${detail})` },
    );
  }
});

// Uncaught errors and unhandled rejections. fatal = true marks the session "crashed"; the
// page keeps running, so the session goes on.
export function captureErrors() {
  const report = (error) => {
    const err = error instanceof Error ? error : new Error(String(error));
    emit(
      "exception",
      {
        "exception.type": err.name,
        "exception.message": err.message,
        "exception.stacktrace": err.stack ?? "",
        "ouo.exception.fatal": true,
        "ouo.exception.handled": false,
      },
      { severity: "ERROR", body: `${err.name}: ${err.message}` },
    );
  };
  addEventListener("error", (event) => report(event.error ?? event.message));
  addEventListener("unhandledrejection", (event) => report(event.reason));
}

// A 4xx or 5xx answer marks the session "errored". The fetch span has the details.
setFailedFetchHandler((method, url, status) => {
  emit(
    "http.request.failed",
    { "http.request.method": method, "url.full": url, "http.response.status_code": status },
    { severity: "WARN", body: `${method} ${url} ${status}` },
  );
});

// Page views: the first load and every client-side route change.
export function trackNavigation() {
  let from = document.referrer ? new URL(document.referrer).pathname : "";
  const report = () => {
    if (location.pathname === from) return;
    emit(
      "navigation",
      { "url.path": location.pathname, "ouo.navigation.from": from },
      { body: `navigation ${from || "(entry)"} -> ${location.pathname}` },
    );
    from = location.pathname;
  };
  report();
  const pushState = history.pushState;
  history.pushState = function (...args) {
    pushState.apply(this, args);
    report();
  };
  addEventListener("popstate", report);
}

// Core Web Vitals from Google's web-vitals library. Most are final only when the page is hidden.
export function trackWebVitals() {
  // CLS has no unit; the others are milliseconds.
  const shown = (metric) => (metric.name === "CLS" ? metric.value.toFixed(3) : `${Math.round(metric.value)} ms`);
  const report = (metric) =>
    emit(
      "web_vital",
      {
        "ouo.web_vital.name": metric.name,
        "ouo.web_vital.value": metric.value,
        "ouo.web_vital.rating": metric.rating,
      },
      { body: `${metric.name} ${shown(metric)} ${metric.rating}` },
    );
  onCLS(report);
  onFCP(report);
  onINP(report);
  onLCP(report);
  onTTFB(report);
}
```

- **`emit`** is the one function that makes a RUM event: an OTLP log record with `eventName` and
  the same name as the `event.name` attribute, plus `session.id` and `user.id`. Its `body` is a
  one-line summary (`GET http://localhost:5001/api/fail 500`, `LCP 176 ms good`), which is the log
  line Loki shows; ouo reads only the attributes.
- **`session.start` / `session.end`** come from `session.js` when it starts or replaces a session.
  `session.end` is a courtesy: ouo also ends a session on its own after 30 minutes of silence.
- **`exception`** with `ouo.exception.fatal = true` marks the session `crashed`. For a caught
  error you report yourself, send `fatal: false` and `handled: true`: the session is `errored`.
- **`http.request.failed`** comes from the fetch instrumentation's `applyCustomAttributesOnSpan`
  hook in `otel.js`, for every 4xx and 5xx answer.
- **`navigation`** is a page view; `trackNavigation` also wraps `history.pushState`, which is
  what client-side routers call.
- **`web_vital`** values come from `web-vitals`. Most of them are only final when the page is
  hidden, which is why step 6c flushes when that happens.

Replace `frontend/src/telemetry/index.js` with a second version:

```js
// RUM without the ouo SDK. Import this first, before React.
import { captureErrors, trackNavigation, trackWebVitals } from "./events.js";
import { flushTelemetry } from "./otel.js";
import { getSession, touch } from "./session.js";

getSession(); // resume the session, or start one (session.start)
captureErrors();
trackNavigation();
trackWebVitals();

// User activity keeps the session alive.
for (const type of ["click", "keydown", "scroll", "touchstart"]) {
  addEventListener(type, touch, { capture: true, passive: true });
}

// The tab is hidden: it may be closed next, so send everything now.
addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushTelemetry();
});

console.log("[telemetry] session", getSession().id);

export { API } from "./config.js";
export { addEvent } from "./events.js";
```

Your session started in step 6a, before `session.start` existed. Start a fresh one: in the
DevTools Console run

```js
localStorage.removeItem("tiny-shop.session")
```

and reload. Click **Add** twice, **Checkout**, **Call broken API** and **Throw error**, then switch
to another browser tab for a moment (the page is hidden: the Web Vitals are sent).

In Grafana, **Explore**, **Loki**:

```
{service_name="tiny-shop-otel-frontend"}
```

`session.start`, `navigation`, `web_vital`, `cart.added`, `http.request.failed` and `exception`,
each with `session_id`. Then **More apps -> ouo11y RUM -> Sessions**: your session is there,
`crashed`, with 1 failed request and its traces. The replay panel is still empty.

### 6c. Record the replay

Create `frontend/src/telemetry/replay.js`:

<!-- embed: examples/quickstarts/tiny-shop-otel/result/frontend/src/telemetry/replay.js -->
```js
// Session replay: rrweb records the page, and the events go to ouo in chunks
// (docs/adr/0003-replay-model.md): { session_id, seq, started_at, ended_at, events },
// POST /v1/replay/chunks on the collector's replay port, every 5 s or at 256 KB.
import { record } from "rrweb";
import { AUTHORIZATION, REPLAY_ENDPOINT } from "./config.js";
import { getSession, nextReplaySeq, onSessionChange } from "./session.js";

const FLUSH_INTERVAL_MS = 5000;
const MAX_CHUNK_BYTES = 256 * 1024;
const KEEPALIVE_MAX_BYTES = 60 * 1024; // browsers cap keepalive request bodies at 64 KiB in total

let buffer = [];
let bufferBytes = 0;
let chunk = null; // { session_id, seq, started_at } of the events in the buffer
let timer = null;

function push(event) {
  if (buffer.length === 0) {
    // The chunk belongs to the session that was current when its first event happened.
    chunk = { session_id: getSession().id, seq: nextReplaySeq(), started_at: event.timestamp };
    timer = setTimeout(flushReplay, FLUSH_INTERVAL_MS);
  }
  buffer.push(event);
  bufferBytes += JSON.stringify(event).length;
  if (bufferBytes >= MAX_CHUNK_BYTES) flushReplay();
}

// Sends the buffered events as one chunk. pageHidden: the page may be gone after this.
export function flushReplay(pageHidden = false) {
  if (buffer.length === 0) return;
  clearTimeout(timer);
  const body = JSON.stringify({ ...chunk, ended_at: buffer[buffer.length - 1].timestamp, events: buffer });
  const headers = {
    "content-type": "application/json",
    Authorization: AUTHORIZATION,
    "x-ouo-session-id": chunk.session_id,
    "x-ouo-seq": String(chunk.seq),
  };
  buffer = [];
  bufferBytes = 0;
  fetch(`${REPLAY_ENDPOINT}/v1/replay/chunks`, {
    method: "POST",
    headers,
    body,
    // keepalive lets the request outlive the page, but only for small bodies.
    keepalive: pageHidden && body.length < KEEPALIVE_MAX_BYTES,
  }).catch((err) => console.warn("[replay] chunk upload failed", err));
}

export function startReplay() {
  record({
    emit: push,
    maskAllInputs: true, // what users type never leaves the browser
    blockClass: "ouo-block", // elements with this class are recorded as an empty box
    maskTextClass: "ouo-mask", // text inside elements with this class is masked
    checkoutEveryNms: 5 * 60 * 1000, // a full snapshot every 5 minutes keeps seeking fast
  });
  // A new session needs its own full snapshot: send the old session's events first.
  onSessionChange((type, session, previous) => {
    if (type !== "start" || !previous) return;
    flushReplay(document.visibilityState === "hidden");
    record.takeFullSnapshot();
  });
}
```

- **One session, one replay, many chunks.** rrweb emits a stream of events; they are cut into
  chunks every 5 seconds or at 256 KB. `seq` numbers the chunks of a session and is kept in the
  session, so a reload continues the numbering; ouo plays the chunks in `seq` order.
- **Each chunk names its session** twice: `session_id` in the body, and `x-ouo-session-id` /
  `x-ouo-seq` headers that the collector checks before it stores the chunk.
- **A new session needs a full snapshot.** rrweb's later events only describe changes, so when
  the session is replaced the old chunk is sent and `record.takeFullSnapshot()` starts the new
  session's replay from a complete page.
- **Privacy.** `maskAllInputs` keeps what users type out of the replay. Add the class
  `ouo-block` to an element to record it as an empty box, `ouo-mask` to mask its text.
- **Leaving the page.** `keepalive` lets the last request outlive the page, but browsers allow
  only 64 KiB of keepalive bodies at a time, so a bigger last chunk is sent without it.

Replace `frontend/src/telemetry/index.js` with its final version:

<!-- embed: examples/quickstarts/tiny-shop-otel/result/frontend/src/telemetry/index.js -->
```js
// RUM without the ouo SDK: OpenTelemetry + rrweb + web-vitals. Import this first, before React.
import { captureErrors, trackNavigation, trackWebVitals } from "./events.js";
import { flushTelemetry } from "./otel.js";
import { flushReplay, startReplay } from "./replay.js";
import { getSession, touch } from "./session.js";

getSession(); // resume the session, or start one (session.start)
captureErrors();
trackNavigation();
trackWebVitals();
startReplay();

// User activity keeps the session alive.
for (const type of ["click", "keydown", "scroll", "touchstart"]) {
  addEventListener(type, touch, { capture: true, passive: true });
}

// The tab is hidden: it may be closed next, so send everything now.
addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "hidden") return;
  flushReplay(true);
  flushTelemetry();
});

console.log("[telemetry] session", getSession().id);

export { API } from "./config.js";
export { addEvent } from "./events.js";
```

### 6d. The custom event

Replace `frontend/src/App.jsx` with the final version. Compared with step 3, the API URL comes
from `telemetry/config.js` (the same value the fetch instrumentation matches), and **Add**
records a custom `cart.added` event:

<!-- embed: examples/quickstarts/tiny-shop-otel/result/frontend/src/App.jsx -->
```jsx
import { useEffect, useState } from "react";
import { API, addEvent } from "./telemetry";

export default function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${API}/api/products`).then((r) => r.json()).then(setProducts);
  }, []);

  function addToCart(p) {
    setCart([...cart, p]);
    // A custom event: a log record with event.name "cart.added" in Loki.
    addEvent("cart.added", { "product.id": p.id, "product.name": p.name });
  }

  async function checkout() {
    const res = await fetch(`${API}/api/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: cart.map((p) => p.id) }),
    });
    const data = await res.json();
    setMessage(`Order #${data.orderId} placed`);
    setCart([]);
  }

  async function callBrokenApi() {
    // A 500: recorded as http.request.failed in the browser and as an error span in the API.
    const res = await fetch(`${API}/api/fail`);
    setMessage(`API answered ${res.status}`);
  }

  function crash() {
    // An uncaught error: an exception event, and the session is marked crashed.
    throw new Error("Button exploded");
  }

  return (
    <main style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "40px auto" }}>
      <h1>Tiny Shop</h1>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            {p.name} (${p.price}) <button onClick={() => addToCart(p)}>Add</button>
          </li>
        ))}
      </ul>
      <p>Cart: {cart.length} item(s)</p>
      <button onClick={checkout} disabled={!cart.length}>Checkout</button>{" "}
      <button onClick={callBrokenApi}>Call broken API</button>{" "}
      <button onClick={crash}>Throw error</button>
      <p>{message}</p>
    </main>
  );
}
```

## Step 7. See the full picture

Reload http://localhost:5173. Click **Add** twice, **Checkout**, **Call broken API**, then
**Throw error**. In the Network tab, `POST /v1/replay/chunks` on port 4319 answers `202` every
few seconds. Switch to another tab for a moment, then wait up to a minute.

**More apps -> ouo11y RUM -> Sessions**, open the newest session:

- the header says `crashed`, with 1 crash, 1 failed request and its traces;
- the activity list next to the replay has the navigation, the Web Vitals, both `cart.added`,
  the failed request and the exception;
- the **Replay** panel plays what you clicked;
- each trace opens in Tempo, from the browser's `fetch` span to the API's `charge card`.

This is the same session the ouo SDK would have produced, from code you own.

## Step 8. What the ouo SDK adds on top

What you built covers the contract. `@ouo11y/browser` also does the following; add what you
need, or switch to it later without changing anything on the server side.

| The SDK | Here | To add it to `telemetry/` |
|---|---|---|
| `setUser()` / `clearUser()` / `endSession()`, with the `user_change` and `manual` end reasons | an anonymous user id per browser | **Easy**, about 30 lines in `session.js`: set `userId`, or end the session and start a new one with that reason |
| Session sampling and a byte cap on buffered replay | every session is recorded and sent | **Easy**, about 10 lines each: decide once per session at start and keep the decision in the session; drop replay events past the cap |
| XHR spans | `fetch` spans only | **Easy**, a few lines: `XhrInstrumentation` from `@opentelemetry/browser-instrumentation/experimental/xhr` |
| Long tasks, resource load errors, `console.error` | uncaught errors only | **Easy**, 15 to 20 lines each: a `PerformanceObserver` for `longtask`, a capture-phase `error` listener, a wrapper around `console.error`, each calling `emit()` |
| `ouo.sdk.name` / `ouo.sdk.version`, browser and OS resource attributes | not sent | **Easy to start**, about 20 lines from `navigator.userAgentData`; parsing user agents well across browsers is the long tail |
| gzips replay and OTLP bodies | plain JSON (the collector also accepts `Content-Encoding: gzip`) | **Easy for replay**, about 15 lines with `CompressionStream("gzip")` in `replay.js`. OTLP needs your own exporter around the OTLP serializer |
| Click and interaction spans | none | **Medium**: a span per click that the `fetch` spans it causes join (the context has to survive the `await`s, which `StackContextManager` does not do). `user-action` from `browser-instrumentation` gives click events, not spans |
| Records the replay in one tab at a time (a lease in `localStorage`) | every open tab records; two tabs of one session interleave in its replay | **Medium**, about 40 lines: a lease with a heartbeat and an expiry so a closed or crashed tab hands over, and a full snapshot in the tab that takes over |
| Keeps unsent data in IndexedDB and retries after a network error | a failed request is lost | **Hard**, 150 to 250 lines: your own span, log and replay exporters that store the serialized bodies, retry with backoff, cap the stored bytes, and send them in order without duplicates after a reload |
| A kill switch | none | **Needs a server**: a config endpoint the page reads at start |

Most rows are a few lines; together they would roughly double the 400 lines in `telemetry/`. The
cost is less the code than the edge cases: `@ouo11y/browser` is about 4,700 lines with 4,100 lines
of tests, most of them for the storage, retry, tab and page-lifecycle cases of the last rows.

## Step 9. Clean up

Stop the API and Vite with Ctrl+C. Stop the stack, keeping its data (in the stack's tab, from
`stack/`):

```bash
docker compose down
```

or delete its data too:

```bash
docker compose down -v
```

## When something does not work

| You see | Cause and fix |
|---|---|
| `Bind for 0.0.0.0:4318 failed: port is already allocated` | another stack has the port: step 4c, move this one with `stack/.env` |
| `rum-api` keeps restarting after a pull | a newer `latest` that wants a different config: `docker compose logs rum-api` names the key; pin the tested version (step 4a, "Image versions") |
| `denied` when pulling `ghcr.io/ouo11y/...` | not logged in to ghcr.io, or no read access yet: step 4b |
| `401` from `/v1/traces`, `/v1/logs` or `/v1/replay/chunks` | the `Authorization` header is missing or wrong (`AUTHORIZATION` in `config.js`) |
| CORS error on the collector in the console | the page is not on `localhost` / `127.0.0.1` (the collector's allowed origins), or a port in `.env.local` is wrong |
| The backend trace starts at `POST /api/checkout`, without the browser span | `propagateTraceHeaderCorsUrls` does not match the API URL (use the RegExp), or the page was not reloaded |
| Backend spans have no `session.id` | the `baggage` header is not sent (`SessionPropagator` not registered) or `BaggageSpanProcessor` is missing in `instrumentation.js` |
| Traces and logs in Grafana, but no session in ouo11y RUM | the log records lack `session.id`, or the resource lacks `ouo.platform` or `service.name` |
| A session with no replay | no `202` from `:4319/v1/replay/chunks`: check the port (`VITE_REPLAY_ENDPOINT`) and the headers |
| Replay shows a blank page | the chunk with the full snapshot was lost; reload the page to record a new one |
| No `LCP` or `FCP` in Loki | the page loaded in a background tab: web-vitals reports them only for pages that were visible while loading |
| Nothing in Tempo yet | wait up to a minute: new traces reach search later than trace-by-id |
