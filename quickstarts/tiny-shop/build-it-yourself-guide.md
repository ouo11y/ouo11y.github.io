# Build Tiny Shop yourself, from scratch

This guide builds the [Tiny Shop](README.md) quickstart by hand, one step at a time, with no
scripts:

1. a plain Express API and a plain React page, both working with no telemetry at all;
2. the ouo stack (Grafana, Loki, Tempo, Mimir, the ouo collector) from one compose file;
3. the backend instrumented with the OpenTelemetry Node SDK, with manual spans, and its traces
   in Grafana;
4. the web app instrumented with `@ouo11y/browser`, and one trace from the click in the browser
   to the API's manual spans.

At the end your files are the same as [`result/backend/`](result/backend) and
[`result/frontend/`](result/frontend) next to this guide: compare with them when you are stuck. Plan on
about 30 minutes.

Every command goes in its own block: run them one by one, in order. When a step says
"replace the file", select everything in it and paste the new content over it.

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

```bash
mkdir -p ~/Desktop/tiny-shop/backend ~/Desktop/tiny-shop/frontend ~/Desktop/tiny-shop/stack
```

```bash
cd ~/Desktop/tiny-shop
```

```bash
code .
```

In VS Code, open a terminal with Ctrl+\`. You will use three terminal tabs (the `+` button):
one for the backend, one for the frontend, one for the stack.

## Step 2. A simple API, no telemetry yet

In the first terminal tab:

```bash
cd ~/Desktop/tiny-shop/backend
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

You get the three products as JSON. (A `%` at the end is zsh saying the output had no final
newline; it is not part of the answer.) Leave the API running.

## Step 3. A dummy React UI

In the second terminal tab:

```bash
cd ~/Desktop/tiny-shop
```

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

## Step 4. Run the ouo stack from one file

### 4a. Create the compose file

The whole stack is one file: Grafana, Loki, Tempo, Mimir, rum-api and the ouo collector, with
their configuration inline. Open the block below, copy all of it, and paste it into a new file
`stack/compose.yaml` in VS Code. (It is the same file as
[`deploy/compose/quickstart.yaml`](../../../deploy/compose/quickstart.yaml).)

<details>
<summary><code>stack/compose.yaml</code> (click to open)</summary>

<!-- embed: deploy/compose/quickstart.yaml -->
```yaml
# ouo quickstart: the whole local stack in one file, on the latest ouo release.
# GENERATED by deploy/scripts/gen-quickstart.sh; do not edit by hand.
#
# The ouo images default to :latest, the newest release. This file was generated for, and its
# configs come from, these releases (digest = the multi-arch image index at that version):
#
#   collector  0.4.0  sha256:ca0d001dc58153671fc501cbe280a69f86dc3e681a1b4621e827dedadb7727f2  OUO_COLLECTOR_VERSION
#   rum-api    0.5.0  sha256:1ee9e606220df2c42f4ade4131fdd3f82085d6e814676a771754a85a6ae78336  OUO_RUM_API_VERSION
#   grafana    0.5.0  sha256:57607a3616c88867644be1f69abb4681ca73df05d6bf2682543418f0dfeb622f  OUO_GRAFANA_VERSION (plugin ouo11y-rum-app 0.9.0)
#
# To stay on exactly these, put e.g. OUO_GRAFANA_VERSION=0.5.0 (or 0.5.0@sha256:...) in a .env
# file next to this one. Each config below comes from its image's release commit; Loki, Tempo
# and Mimir from grafana-v0.5.0. A later release that needs new configs comes with a regenerated
# file: fetch it again (deploy/compose/quickstart.yaml in the ouo11y/ouo11y repo).
#
# Copy this file into an empty folder as compose.yaml, then:
#
#   echo $GHCR_TOKEN | docker login ghcr.io -u <github-user> --password-stdin   # images are private for now
#   docker compose up -d
#
# Grafana          http://localhost:3000      admin / testing567, More apps -> ouo11y RUM
# OTLP/HTTP        http://localhost:4318      /v1/traces /v1/logs /v1/metrics
# Replay           http://localhost:4319      /v1/replay/chunks
# Credential       HTTP Basic, project id `demo`, project token `pt_dev_demo_0000000000000000`
#                  (Authorization: Basic ZGVtbzpwdF9kZXZfZGVtb18wMDAwMDAwMDAwMDAwMDAw)
#
# Ports collide? Set OUO_GRAFANA_PORT, OUO_OTLP_HTTP_PORT, OUO_REPLAY_PORT, ... in a .env
# file next to this one (names and defaults: deploy/compose/.env.example in the repo). An SDK
# then needs both URLs, e.g. endpoint :14318 and replayEndpoint :14319.
# Stop: `docker compose down`; wipe the data too: `docker compose down -v`.
#
# Development tokens only (they are public): fine on a laptop, never on a reachable host.
# A server install is deploy/vm/install.sh. Needs Docker Compose >= 2.24 (`configs.content`).
#
# No `name:` on purpose: the project is named after the folder, so two copies of this file in
# two folders are two separate stacks (a fixed name would make `down -v` in one remove the other).

services:
  grafana:
    image: ${OUO_IMAGE_REGISTRY:-ghcr.io/ouo11y}/grafana:${OUO_GRAFANA_VERSION:-latest}
    ports:
      - "${OUO_GRAFANA_PORT:-3000}:3000"
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: ${OUO_GRAFANA_ADMIN_PASSWORD:-testing567}
      GF_AUTH_ANONYMOUS_ENABLED: "false"
      GF_USERS_DEFAULT_THEME: dark
      GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS: ouo11y-rum-app
      GF_SECURITY_DISABLE_FRONTEND_SANDBOX_FOR_PLUGINS: ouo11y-rum-app
      # Read by the plugin provisioning file; must equal rum-api's OUO_READ_TOKEN.
      OUO_READ_TOKEN: ${OUO_READ_TOKEN:-rt_dev_0000000000000000}
      # Grafana feature toggles the plugin can use (comma-separated), empty by default.
      OUO_FEATURE_TOGGLES_ENABLE: ${OUO_FEATURE_TOGGLES_ENABLE:-}
    configs:
      - source: grafana-datasources
        target: /etc/grafana/provisioning/datasources/datasources.yaml
      - source: grafana-plugin-app
        target: /etc/grafana/provisioning/plugins/ouo11y-rum-app.yaml
    volumes:
      - grafana-data:/var/lib/grafana
    depends_on:
      grafana-plugin:
        condition: service_completed_successfully
      loki:
        condition: service_started
      tempo:
        condition: service_started
      mimir:
        condition: service_started
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health >/dev/null 2>&1 || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 30

  # The grafana-data volume hides the plugin the image ships in /var/lib/grafana/plugins;
  # copy it onto the volume before every start so an image upgrade also upgrades the plugin.
  grafana-plugin:
    image: ${OUO_IMAGE_REGISTRY:-ghcr.io/ouo11y}/grafana:${OUO_GRAFANA_VERSION:-latest}
    entrypoint: ["sh", "-ec"]
    command:
      - |
        mkdir -p /pvc/plugins
        rm -rf /pvc/plugins/ouo11y-rum-app
        cp -a /var/lib/grafana/plugins/ouo11y-rum-app /pvc/plugins/ouo11y-rum-app
        echo "ouo11y-rum-app $$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' /pvc/plugins/ouo11y-rum-app/plugin.json | head -1) installed"
    volumes:
      - grafana-data:/pvc
    restart: "no"

  loki:
    image: grafana/loki:3.7.7
    command: ["-config.file=/etc/loki/config.yaml", "-config.expand-env=true"]
    ports:
      - "${OUO_LOKI_PORT:-3100}:3100"
    environment:
      OUO_RETENTION_LOGS: ${OUO_RETENTION_LOGS:-720h}
      OUO_LOKI_COMPACTION_INTERVAL: ${OUO_LOKI_COMPACTION_INTERVAL:-10m}
      OUO_LOKI_RETENTION_DELETE_DELAY: ${OUO_LOKI_RETENTION_DELETE_DELAY:-2h}
      OUO_LOKI_DELETE_CANCEL_PERIOD: ${OUO_LOKI_DELETE_CANCEL_PERIOD:-24h}
    configs:
      - source: loki
        target: /etc/loki/config.yaml
      - source: loki-runtime
        target: /etc/loki/runtime.yaml
    volumes:
      - loki-data:/loki

  tempo:
    image: grafana/tempo:3.0.3
    command: ["-config.file=/etc/tempo/config.yaml", "-config.expand-env=true"]
    ports:
      - "${OUO_TEMPO_PORT:-3200}:3200"
    environment:
      OUO_RETENTION_TRACES: ${OUO_RETENTION_TRACES:-336h}
    configs:
      - source: tempo
        target: /etc/tempo/config.yaml
    volumes:
      - tempo-data:/var/tempo

  mimir:
    image: grafana/mimir:3.2.1
    command: ["-config.file=/etc/mimir/config.yaml", "-config.expand-env=true"]
    ports:
      - "${OUO_MIMIR_PORT:-9009}:9009"
    environment:
      OUO_RETENTION_METRICS: ${OUO_RETENTION_METRICS:-2160h}
    configs:
      - source: mimir
        target: /etc/mimir/config.yaml
    volumes:
      - mimir-data:/data

  # The only ingest (ADR-0007): OTLP on 4318 and replay chunks on 4319, both behind HTTP
  # Basic project credentials checked against the projects-htpasswd config below.
  otel-collector:
    image: ${OUO_IMAGE_REGISTRY:-ghcr.io/ouo11y}/collector:${OUO_COLLECTOR_VERSION:-latest}
    command: ["--config=/etc/otelcol/config.yaml"]
    ports:
      - "127.0.0.1:${OUO_OTLP_GRPC_PORT:-4317}:4317"
      - "${OUO_OTLP_HTTP_PORT:-4318}:4318"
      - "${OUO_REPLAY_PORT:-4319}:4319"
      - "${OUO_SENTRY_PORT:-4320}:4320"
      - "127.0.0.1:${OUO_COLLECTOR_HEALTH_PORT:-13133}:13133"
    environment:
      OUO_INGEST_TOKEN: ${OUO_INGEST_TOKEN:-it_dev_0000000000000000}
      OUO_ALLOWED_ORIGINS: ${OUO_ALLOWED_ORIGINS:-http://localhost:*,http://127.0.0.1:*}
      OUO_RATELIMIT_CLIENT_KEY: ${OUO_RATELIMIT_CLIENT_KEY:-address}
      OUO_RATELIMIT_PROJECT_RATE: ${OUO_RATELIMIT_PROJECT_RATE:-1000}
      OUO_RATELIMIT_PROJECT_BURST: ${OUO_RATELIMIT_PROJECT_BURST:-5000}
      OUO_RATELIMIT_CLIENT_RATE: ${OUO_RATELIMIT_CLIENT_RATE:-100}
      OUO_RATELIMIT_CLIENT_BURST: ${OUO_RATELIMIT_CLIENT_BURST:-300}
      OUO_SENTRY_UPSTREAM: ${OUO_SENTRY_UPSTREAM:-none}
      OUO_SENTRY_PROJECT_ID: ${OUO_SENTRY_PROJECT_ID:-1}
      OUO_SENTRY_PUBLIC_KEY: ${OUO_SENTRY_PUBLIC_KEY:-publickey0000000000000000000000}
      OUO_SENTRY_SERVICE_NAME: ${OUO_SENTRY_SERVICE_NAME:-sentry-demo}
    configs:
      - source: collector
        target: /etc/otelcol/config.yaml
      - source: projects-htpasswd
        target: /etc/otelcol/projects.htpasswd
    depends_on:
      - loki
      - tempo
      - mimir

  # Internal: replay chunk sink and the plugin's API. SDKs never talk to it.
  rum-api:
    image: ${OUO_IMAGE_REGISTRY:-ghcr.io/ouo11y}/rum-api:${OUO_RUM_API_VERSION:-latest}
    command: ["-config.file=/etc/rum-api/config.yaml", "-config.expand-env=true"]
    ports:
      - "${OUO_RUM_API_PORT:-8080}:8080"
    environment:
      GRAFANA_URL: http://localhost:${OUO_GRAFANA_PORT:-3000}
      OUO_INGEST_TOKEN: ${OUO_INGEST_TOKEN:-it_dev_0000000000000000}
      OUO_READ_TOKEN: ${OUO_READ_TOKEN:-rt_dev_0000000000000000}
      # Operator API /v1/admin/* and the per-project source-map upload tokens (ADR-0011).
      OUO_ADMIN_TOKEN: ${OUO_ADMIN_TOKEN:-at_dev_0000000000000000}
      OUO_UPLOAD_TOKENS: ${OUO_UPLOAD_TOKENS:-demo:ut_dev_demo_0000000000000000}
      REPLAY_RETENTION: ${OUO_RETENTION_REPLAYS:-720h}
      LOG_RETENTION: ${OUO_RETENTION_LOGS:-720h}
      REPLAY_SWEEP_INTERVAL: ${OUO_REPLAY_SWEEP_INTERVAL:-1h}
      # The image runs as nonroot. A named volume mounted on the existing nonroot home is
      # seeded with that owner; one mounted on /data would be root-owned and unwritable.
      DATA_DIR: /home/nonroot
      OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4318
      OTEL_EXPORTER_OTLP_HEADERS: ${OUO_BACKEND_OTLP_HEADERS:-Authorization=Basic%20aW50ZXJuYWw6cHRfZGV2X2ludGVybmFsXzAwMDAwMDAwMDAwMDAw}
      OTEL_EXPORTER_OTLP_PROTOCOL: http/protobuf
      OTEL_SERVICE_NAME: rum-api
      OTEL_RESOURCE_ATTRIBUTES: deployment.environment.name=local
    configs:
      - source: rum-api
        target: /etc/rum-api/config.yaml
    volumes:
      - rum-api-data:/home/nonroot
    depends_on:
      - loki
      - tempo
      - otel-collector

volumes:
  grafana-data:
  loki-data:
  tempo-data:
  mimir-data:
  rum-api-data:

configs:
  collector:
    # deploy/compose/collector/config.yaml at collector-v0.4.0
    content: |
      # ouo-collector configuration for the local stack (ADR-0007: the collector is the edge).
      #
      # Image: ouo/collector, built from collector/ (collector/builder.yaml). Compose mounts this
      # file and projects.htpasswd into /etc/otelcol/. Ports:
      #   4318 OTLP/HTTP  public  Basic auth (project id : project token), CORS
      #   4319 replay     public  Basic auth, CORS, POST /v1/replay/chunks
      #   4320 Sentry     public  Sentry SDK envelopes (ADR-0008), Sentry DSN key auth, forwarded to Sentry
      #   4317 OTLP/gRPC  loopback in compose, same Basic auth (send the Authorization metadata)
      #   13133 health    loopback
      #   8888 self-metrics (Prometheus pull, not published; they are also pushed to Mimir)
      #
      # Environment:
      #   OUO_INGEST_TOKEN     bearer the ouoreplay exporter sends to rum-api (must equal rum-api's)
      #   OUO_ALLOWED_ORIGINS  optional comma-separated CORS origin list, no spaces
      #                        (default http://localhost:*,http://127.0.0.1:*)
      #   OUO_RATELIMIT_CLIENT_KEY  address (default) or x_forwarded_for behind a reverse proxy
      #   OUO_RATELIMIT_{PROJECT,CLIENT}_{RATE,BURST}  bucket sizes (defaults 1000/5000 and 100/300;
      #                        deploy/scripts/qa-edge.sh lowers them to test the buckets)
      #   OUO_SENTRY_UPSTREAM  Sentry ingest base URL the bridge forwards to (https://oNNN.ingest.sentry.io),
      #                        or "none" to answer locally (default none: no data leaves the laptop)
      #   OUO_SENTRY_PROJECT_ID, OUO_SENTRY_PUBLIC_KEY  the DSN's project id and public key
      #
      # Every receiver uses include_metadata: true so the resource processor and ouoratelimit
      # can read the authenticated project (auth.username) and request headers from the
      # client context. Anything that drops that context (batch) must come after them.

      extensions:
        health_check:
          endpoint: 0.0.0.0:13133
        basicauth/server:
          htpasswd:
            file: /etc/otelcol/projects.htpasswd
        # Receivers authenticate through ouoauth, which delegates to basicauth/server and
        # counts every rejected request (401) as ouo_auth_failures_total{reason} in Mimir.
        ouoauth:
          authenticator: basicauth/server
        # Receiver middleware sharing the ouoratelimit processor's buckets: the OTLP receiver
        # answers an empty export (no spans / records / points) 200 without calling the
        # pipeline, so only a middleware can charge it. Requests it charged are not charged
        # again by the processor; other receivers (replay, Sentry) are charged by the processor.
        ouoratelimit:
          processor: ouoratelimit

      receivers:
        otlp:
          protocols:
            grpc:
              endpoint: 0.0.0.0:4317
              include_metadata: true
              auth:
                authenticator: ouoauth
              middlewares:
                - id: ouoratelimit
            http:
              # 0.0.0.0 inside the container; exposure is decided by the compose port binding.
              endpoint: 0.0.0.0:4318
              include_metadata: true
              max_request_body_size: 4194304   # 4 MiB, applied to the compressed and the decompressed body
              auth:
                authenticator: ouoauth
              middlewares:
                - id: ouoratelimit
              cors:
                allowed_origins: $${env:OUO_ALLOWED_ORIGINS:-http://localhost:*,http://127.0.0.1:*}
                allowed_headers: [Authorization, Content-Type, Content-Encoding, traceparent, baggage]
                exposed_headers: [Retry-After]
                max_age: 7200
        ouoreplay:
          endpoint: 0.0.0.0:4319
          include_metadata: true
          max_request_body_size: 8388608       # 8 MiB: frames chunks (rrweb chunks stop at max_rrweb_chunk_bytes, 4 MiB)
          auth:
            authenticator: ouoauth
          cors:
            allowed_origins: $${env:OUO_ALLOWED_ORIGINS:-http://localhost:*,http://127.0.0.1:*}
            allowed_headers: [Authorization, Content-Type, Content-Encoding, X-Ouo-Session-Id, X-Ouo-Seq]
            exposed_headers: [Retry-After]
            max_age: 7200
        # Sentry SDK bridge (ADR-0008, docs/specs/sentry-bridge.md): apps change only their DSN host.
        # Every envelope is forwarded byte for byte to the project's upstream Sentry and Sentry's
        # answer goes back unchanged; accepted envelopes are translated into sessions, errors,
        # traces (logs/traces pipelines) and video replay chunks (routed to logs/replay).
        ouosentry:
          endpoint: 0.0.0.0:4320
          upstream_timeout: 30s
          projects:
            - sentry_project_id: "$${env:OUO_SENTRY_PROJECT_ID:-1}"
              public_keys: ["$${env:OUO_SENTRY_PUBLIC_KEY:-publickey0000000000000000000000}"]
              upstream: $${env:OUO_SENTRY_UPSTREAM:-none}
              ouo_project_id: demo
              service_name: $${env:OUO_SENTRY_SERVICE_NAME:-sentry-demo}

      connectors:
        # The Sentry bridge emits replay chunks on its logs output; send them to the replay
        # pipeline (ouoreplay exporter -> rum-api) and everything else to Loki.
        routing/sentry:
          default_pipelines: [logs]
          table:
            - context: log
              condition: log.attributes["ouo.replay.chunk"] == true
              pipelines: [logs/replay]

      processors:
        memory_limiter:
          check_interval: 1s
          limit_mib: 512
          spike_limit_mib: 128
        # Token buckets per project (auth.username) and per client; over the limit the OTLP
        # receiver answers 429 + Retry-After (gRPC RESOURCE_EXHAUSTED + RetryInfo). All
        # pipelines share one set of buckets. Behind a reverse proxy (deploy/vm sets
        # OUO_RATELIMIT_CLIENT_KEY=x_forwarded_for) the TCP peer is the proxy, so key the
        # client bucket on the first X-Forwarded-For hop instead of the address.
        ouoratelimit:
          project:
            rate: $${env:OUO_RATELIMIT_PROJECT_RATE:-1000}
            burst: $${env:OUO_RATELIMIT_PROJECT_BURST:-5000}
          client:
            rate: $${env:OUO_RATELIMIT_CLIENT_RATE:-100}
            burst: $${env:OUO_RATELIMIT_CLIENT_BURST:-300}
            key_from: $${env:OUO_RATELIMIT_CLIENT_KEY:-address}
          idle_timeout: 10m
        # Stamp the authenticated project on every resource, overwriting whatever the client
        # sent (delete first so a request without auth context can never keep a spoofed value).
        resource/project:
          attributes:
            - key: ouo.project.id
              action: delete
            - key: ouo.project.id
              from_context: auth.username
              action: upsert
        batch:
          timeout: 1s
          send_batch_size: 512
          send_batch_max_size: 1024
        # Copy the OTLP top-level event_name (OTel Logs API `eventName`) into the
        # `event.name` log attribute so Loki can index it as a label regardless of
        # whether the SDK set it as a field or as an attribute. Also makes sure
        # `ouo.platform` exists as a log attribute when it was only set on the resource.
        transform/events:
          error_mode: ignore
          log_statements:
            - context: log
              statements:
                - set(log.attributes["event.name"], log.event_name) where log.event_name != "" and log.attributes["event.name"] == nil
                - set(log.attributes["ouo.platform"], resource.attributes["ouo.platform"]) where log.attributes["ouo.platform"] == nil and resource.attributes["ouo.platform"] != nil

      # Collector >= 0.150 names the exporters otlp_grpc / otlp_http (otlp / otlphttp are deprecated aliases).
      exporters:
        otlp_grpc/tempo:
          endpoint: tempo:4317
          tls:
            insecure: true
        otlp_http/loki:
          endpoint: http://loki:3100/otlp
          tls:
            insecure: true
        otlp_http/mimir:
          endpoint: http://mimir:9009/otlp
          tls:
            insecure: true
        # Replay chunks -> rum-api's internal sink (POST /v1/replay/chunks with
        # X-Ouo-Project-Id, X-Ouo-Session-Id, X-Ouo-Seq and the ingest bearer).
        ouoreplay:
          endpoint: http://rum-api:8080
          ingest_token: $${env:OUO_INGEST_TOKEN}
          timeout: 30s
          sending_queue:
            enabled: true
            queue_size: 1000
          retry_on_failure:
            enabled: true
            max_elapsed_time: 5m
        debug:
          verbosity: basic

      service:
        extensions: [health_check, basicauth/server, ouoauth, ouoratelimit]
        telemetry:
          logs:
            level: info
          # Self-metrics (otelcol_receiver_*, otelcol_exporter_*, ouo_ratelimit_rejected_total,
          # ouo_auth_failures_total, ouo_replay_chunks_total): pushed to Mimir over OTLP every 15 s, and pullable on :8888
          # inside the network for debugging.
          metrics:
            level: normal
            readers:
              - periodic:
                  interval: 15000
                  exporter:
                    otlp:
                      protocol: http/protobuf
                      endpoint: http://mimir:9009/otlp/v1/metrics
              - pull:
                  exporter:
                    prometheus:
                      host: 0.0.0.0
                      port: 8888
        pipelines:
          traces:
            receivers: [otlp, ouosentry]
            processors: [memory_limiter, ouoratelimit, resource/project, batch]
            exporters: [otlp_grpc/tempo]
          logs:
            receivers: [otlp, routing/sentry]
            processors: [memory_limiter, ouoratelimit, resource/project, transform/events, batch]
            exporters: [otlp_http/loki]
          metrics:
            receivers: [otlp]
            processors: [memory_limiter, ouoratelimit, resource/project, batch]
            exporters: [otlp_http/mimir]
          # Replay chunks: one log record per chunk, project stamped by the receiver. No batch:
          # the receiver waits for the queue hand-off and answers 202, 429 or 503 per chunk.
          logs/replay:
            receivers: [ouoreplay, routing/sentry]
            processors: [memory_limiter, ouoratelimit]
            exporters: [ouoreplay]
          # Sentry bridge output before routing; the project is in the client context
          # (auth.username), so resource/project and ouoratelimit work downstream.
          logs/sentry:
            receivers: [ouosentry]
            processors: [memory_limiter]
            exporters: [routing/sentry]
  projects-htpasswd:
    # deploy/compose/collector/projects.htpasswd at collector-v0.4.0
    content: |
      # Development project registry for ouo-collector (basicauth extension, ADR-0007).
      # LOCAL USE ONLY. The demo token is public in this repository; never deploy this file.
      # One line per project. username = project id, password = project token, {SHA} hash.
      # Generate a line with   htpasswd -nbs PROJECT TOKEN
      # Comment lines in this file must never contain a colon character (see project/kb/collector-components.md).
      demo:{SHA}IUpHBAUPHvXoJmvv4inmF4cN96I=
      # internal = the platform's own telemetry (rum-api, demo backend), token pt_dev_internal_00000000000000,
      # so it has its own rate-limit buckets and never spends a client project's quota.
      internal:{SHA}wXBw3q7GMLhIo7ifP3a0fC2Z14M=
  loki:
    # deploy/compose/loki/config.yaml at grafana-v0.5.0
    content: |
      # Loki 3.x single-binary, filesystem storage, native OTLP ingestion.
      # Started with -config.expand-env=true: the OUO_* variables below come from compose.yaml (retention,
      # deletion timings; docs/operations/data-lifecycle.md).
      auth_enabled: false

      server:
        http_listen_port: 3100
        grpc_listen_port: 9096
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

      storage_config:
        tsdb_shipper:
          active_index_directory: /loki/tsdb-index
          cache_location: /loki/tsdb-cache

      # Retention and deletion (roadmap 8b): the compactor applies limits_config.retention_period
      # (and per-project retention_stream entries from runtime.yaml) and processes delete
      # requests (POST /loki/api/v1/delete, sent by rum-api's delete-by-user / -project).
      compactor:
        working_directory: /loki/compactor
        compaction_interval: $${OUO_LOKI_COMPACTION_INTERVAL:-10m}
        retention_enabled: true
        # Chunks marked for deletion are removed after this delay.
        retention_delete_delay: $${OUO_LOKI_RETENTION_DELETE_DELAY:-2h}
        delete_request_store: filesystem
        # Grace period during which a delete request can be cancelled before the compactor
        # acts on it.
        delete_request_cancel_period: $${OUO_LOKI_DELETE_CANCEL_PERIOD:-24h}

      # Per-project overrides (retention_stream on the ouo_project_id label), reloaded every
      # 10 s without a restart.
      runtime_config:
        file: /etc/loki/runtime.yaml
        period: 10s

      pattern_ingester:
        enabled: true

      ruler:
        storage:
          type: local
          local:
            directory: /loki/rules

      limits_config:
        # Structured metadata is required for OTLP ingestion: every attribute that is
        # not promoted to a label lands there (session.id, user.id, trace_id, ...).
        allow_structured_metadata: true
        volume_enabled: true
        reject_old_samples: true
        reject_old_samples_max_age: 168h
        ingestion_rate_mb: 32
        ingestion_burst_size_mb: 64
        max_label_names_per_series: 30
        # Retention of every stream (OUO_RETENTION_LOGS, at least 24h); runtime.yaml can set a
        # shorter or longer one per project. Delete requests remove lines from chunks.
        retention_period: $${OUO_RETENTION_LOGS:-720h}
        deletion_mode: filter-and-delete
        # Label promotion for OTLP (ADR-0001): only service_name, event_name,
        # ouo_platform and ouo_project_id (one value per project, for per-project
        # retention_stream and deletes) become stream labels; session.id stays
        # structured metadata so cardinality stays low. Loki rewrites "." to "_".
        otlp_config:
          resource_attributes:
            # Loki's default list also promotes service.instance.id, k8s.*, cloud.* which
            # would explode cardinality for browser SDKs; replace it with a fixed set.
            ignore_defaults: true
            attributes_config:
              - action: index_label
                attributes:
                  - service.name
                  - service.namespace
                  - deployment.environment.name
                  - ouo.platform
                  - ouo.project.id
          log_attributes:
            - action: index_label
              attributes:
                - event.name
                - ouo.platform

      analytics:
        reporting_enabled: false
  loki-runtime:
    # deploy/compose/loki/runtime.yaml at grafana-v0.5.0
    content: |
      # Loki runtime overrides, reloaded every 10 s (runtime_config in config.yaml): edit and
      # save, no restart. Per-project log retention goes here as retention_stream entries on
      # the ouo_project_id stream label; the default is limits_config.retention_period
      # (OUO_RETENTION_LOGS). Loki's single tenant is "fake" (auth_enabled: false).
      # docs/operations/data-lifecycle.md, section Per-project retention.
      #
      # overrides:
      #   fake:
      #     retention_stream:
      #       - selector: '{ouo_project_id="ttltest"}'
      #         priority: 1
      #         period: 24h          # at least 24h
      overrides: {}
  tempo:
    # deploy/compose/tempo/config.yaml at grafana-v0.5.0
    content: |
      # Tempo 3.x single binary, local storage, OTLP receiver, metrics generator -> Mimir.
      # Started with -config.expand-env=true (trace retention from compose.yaml).
      # Only keys that exist in 3.0.x are used; see project/kb/collector-lgtm.md.
      # Grafana >= 11 streams search/trace results over gRPC on the HTTP port (h2c).
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
              http:
                endpoint: 0.0.0.0:4318

      # Tempo 3.0 removed the 2.x `ingester` and `compactor` top-level blocks
      # (block-builder / live-store replace them); defaults are fine locally.

      # Trace retention (roadmap 8b): blocks older than block_retention are deleted by the
      # backend scheduler's retention job (hourly) run on the backend worker. Both carry the
      # compaction settings in 3.0; keep them equal. Tempo has no delete API: single traces
      # are removed with `tempo-cli redact` (docs/operations/data-lifecycle.md).
      backend_scheduler:
        provider:
          compaction:
            compaction:
              block_retention: $${OUO_RETENTION_TRACES:-336h}

      backend_worker:
        compaction:
          block_retention: $${OUO_RETENTION_TRACES:-336h}

      querier:
        frontend_worker:
          frontend_address: 127.0.0.1:9095

      query_frontend:
        search:
          duration_slo: 5s
          throughput_bytes_slo: 1.073741824e+09
        trace_by_id:
          duration_slo: 5s

      metrics_generator:
        registry:
          external_labels:
            source: tempo
        storage:
          path: /var/tempo/generator/wal
          remote_write:
            - url: http://mimir:9009/api/v1/push
              send_exemplars: true

      storage:
        trace:
          backend: local
          wal:
            path: /var/tempo/wal
          local:
            path: /var/tempo/blocks

      overrides:
        defaults:
          metrics_generator:
            processors: [service-graphs, span-metrics]
  mimir:
    # deploy/compose/mimir/config.yaml at grafana-v0.5.0
    content: |
      # Mimir monolithic mode, filesystem storage, OTLP push at /otlp/v1/metrics.
      # Started with -config.expand-env=true (metric retention from compose.yaml).
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
          kvstore:
            store: memberlist

      distributor:
        ring:
          instance_addr: 127.0.0.1
          kvstore:
            store: memberlist

      ingester:
        ring:
          instance_addr: 127.0.0.1
          replication_factor: 1
          kvstore:
            store: memberlist

      store_gateway:
        sharding_ring:
          instance_addr: 127.0.0.1
          replication_factor: 1
          kvstore:
            store: memberlist

      ruler_storage:
        storage_prefix: rules

      alertmanager_storage:
        storage_prefix: alertmanager

      memberlist:
        bind_addr: [127.0.0.1]
        join_members: []

      limits:
        # Accept metrics without OTel-style unit/type suffix mangling and keep resource attrs.
        otel_metric_suffixes_enabled: false
        max_global_series_per_user: 1000000
        ingestion_rate: 100000
        ingestion_burst_size: 500000
        out_of_order_time_window: 5m
        # Metric retention (roadmap 8b): the compactor deletes blocks older than this. 0 keeps
        # everything.
        compactor_blocks_retention_period: $${OUO_RETENTION_METRICS:-2160h}

      usage_stats:
        enabled: false
  rum-api:
    # deploy/compose/rum-api/config.yaml at rum-api-v0.5.0
    content: |
      # rum-api configuration for the local stack, mounted at /etc/rum-api/config.yaml and
      # started with -config.file=/etc/rum-api/config.yaml -config.expand-env=true (like Loki
      # and Tempo). Every key and its environment override: services/rum-api/config.example.yaml.
      # Environment variables set in compose.yaml win over this file (GRAFANA_URL does, so the
      # deep links follow OUO_GRAFANA_PORT and deploy/vm/compose.tls.yaml's public domain).

      server:
        http_listen_address: ":8080"

      # Secrets come from the container environment (compose.yaml), never from this file.
      auth:
        ingest_token: "$${OUO_INGEST_TOKEN}"
        read_token: "$${OUO_READ_TOKEN}"
        admin_token: "$${OUO_ADMIN_TOKEN}"

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
        # filesystem: deploy/data/rum-api/replays on the host (bind mount, like Loki and Tempo
        # keep their local filesystem storage). compose.s3.yaml switches this to s3
        # (STORAGE_BACKEND=s3) against the MinIO below.
        backend: filesystem
        filesystem:
          dir: /data
        s3:
          endpoint: minio:9000
          bucket: $${OUO_RUM_API_S3_BUCKET:-ouo-replays}
          region: us-east-1
          access_key_id: "$${S3_ACCESS_KEY_ID}"
          secret_access_key: "$${S3_SECRET_ACCESS_KEY}"
          insecure: true          # plain HTTP inside the compose network
          force_path_style: true  # MinIO

      # Replay retention and the sweeper: REPLAY_RETENTION / LOG_RETENTION / REPLAY_SWEEP_INTERVAL
      # from compose.yaml (OUO_RETENTION_REPLAYS, OUO_RETENTION_LOGS) override these.
      retention:
        replays: 720h
        logs: 720h
        sweep_interval: 1h

      # Per-project replay retention and server-side sampling caps (restart rum-api after an
      # edit). Keep a project's log retention in loki/runtime.yaml in step.
      projects: {}
      #  ttltest:
      #    retention: { replays: 24h }
      #    sampling: { session_rate: 1, replay_rate: 0.25 }
  grafana-datasources:
    # deploy/compose/grafana/provisioning/datasources/datasources.yaml at grafana-v0.5.0
    content: |
      apiVersion: 1

      deleteDatasources:
        - name: Loki
          orgId: 1
        - name: Tempo
          orgId: 1
        - name: Mimir
          orgId: 1

      datasources:
        - name: Loki
          uid: loki
          type: loki
          access: proxy
          url: http://loki:3100
          editable: false
          jsonData:
            maxLines: 1000
            derivedFields:
              # OTLP log records carry the trace id as structured metadata `trace_id`.
              - name: TraceID
                datasourceUid: tempo
                matcherType: label
                matcherRegex: trace_id
                url: "$$$${__value.raw}"
                urlDisplayLabel: View trace

        - name: Tempo
          uid: tempo
          type: tempo
          access: proxy
          url: http://tempo:3200
          editable: false
          jsonData:
            streamingEnabled:
              search: true
            nodeGraph:
              enabled: true
            serviceMap:
              datasourceUid: mimir
            tracesToMetrics:
              datasourceUid: mimir
              spanStartTimeShift: "-5m"
              spanEndTimeShift: "5m"
            lokiSearch:
              datasourceUid: loki
            tracesToLogsV2:
              datasourceUid: loki
              spanStartTimeShift: "-30m"
              spanEndTimeShift: "30m"
              filterByTraceID: false
              filterBySpanID: false
              customQuery: true
              # `$${__span.tags[...]}` resolves both span attributes (session.id) and resource
              # attributes (service.name): Grafana merges process tags into __span.tags and the
              # field path goes through lodash `property`, so bracket keys with dots work.
              # session.id is structured metadata in Loki, so it is a `|` filter, never a
              # stream selector. `$$$$` escapes the provisioner's own $${ENV} expansion.
              tags:
                - key: service.name
                  value: service_name
              query: '{service_name="$$$${__span.tags["service.name"]}"} | session_id="$$$${__span.tags["session.id"]}"'

        - name: Mimir
          uid: mimir
          type: prometheus
          access: proxy
          url: http://mimir:9009/prometheus
          editable: false
          jsonData:
            httpMethod: POST
            prometheusType: Mimir
            prometheusVersion: "2.9.1"
            timeInterval: 15s
            exemplarTraceIdDestination:
              - name: trace_id
                datasourceUid: tempo
  grafana-plugin-app:
    # deploy/compose/grafana/provisioning/plugins/ouo11y-rum-app.yaml at grafana-v0.5.0
    content: |
      # Enables the ouo11y RUM app plugin (plugins/ouo11y-rum-app, loaded unsigned from
      # /var/lib/grafana/plugins/ouo11y-rum-app) and points its "rum" route at the
      # in-network rum-api. The browser never talks to rum-api directly: the plugin
      # calls /api/plugin-proxy/ouo11y-rum-app/rum/v1/... and Grafana forwards to rumApiUrl,
      # adding `Authorization: Bearer <readToken>` from secureJsonData (ADR-0007 section 6).
      #
      # $${OUO_READ_TOKEN} is expanded by the Grafana provisioner from the container's
      # environment (compose passes it through; default rt_dev_0000000000000000, a
      # development value). It must equal rum-api's OUO_READ_TOKEN. Secure fields are
      # write-only: the settings API reports `secureJsonFields: {readToken: true}`.
      #
      # $${OUO_FEATURE_TOGGLES_ENABLE} turns plugin feature toggles on, comma separated, like
      # Grafana's GF_FEATURE_TOGGLES_ENABLE (empty: all off). The list is in
      # plugins/ouo11y-rum-app/README.md, e.g. OUO_FEATURE_TOGGLES_ENABLE=sessionTimelinePanel.
      apiVersion: 1

      apps:
        - type: ouo11y-rum-app
          org_id: 1
          disabled: false
          jsonData:
            rumApiUrl: http://rum-api:8080
            featureToggles: "$${OUO_FEATURE_TOGGLES_ENABLE}"
          secureJsonData:
            readToken: $${OUO_READ_TOKEN}
```

</details>

### 4b. Log in to ghcr.io

The ouo images are private for now. You need read access to the `ouo11y` packages and a
**classic** GitHub token with only the `read:packages` scope. Put the token in your shell
(`export GHCR_TOKEN=...`), never in a file, then:

```bash
echo $GHCR_TOKEN | docker login ghcr.io -u <your-github-user> --password-stdin
```

### 4c. Check the ports

The stack publishes 3000 (Grafana), 3100, 3200, 9009, 8080, and the collector's 4318
(OTLP), 4319 (replay) and 4320. This prints nothing when they are all free:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3100|3200|4318|4319|4320|8080|9009) '
```

If something is listed (often another collector on 4318-4320), do not stop it: move this
stack instead. Create `stack/.env`:

```bash
code ~/Desktop/tiny-shop/stack/.env
```

with:

```
OUO_OTLP_HTTP_PORT=14318
OUO_REPLAY_PORT=14319
OUO_SENTRY_PORT=14320
OUO_OTLP_GRPC_PORT=14317
OUO_COLLECTOR_HEALTH_PORT=14133
```

Compose reads `.env` on its own. Remember the new collector ports: steps 5 and 6 tell you
where they go. Another port listed (3000, 8080, ...)? Its variable is `OUO_GRAFANA_PORT`,
`OUO_RUM_API_PORT`, ... (all of them: the `${OUO_..._PORT:-...}` lines in `compose.yaml`).

### 4d. Start it

```bash
cd ~/Desktop/tiny-shop/stack
```

```bash
docker compose up -d
```

```bash
docker compose ps -a
```

`grafana` and `rum-api` become `healthy`; `loki`, `tempo`, `mimir` and `otel-collector` are
`Up`; `grafana-plugin` is `Exited (0)`, which is right: it only copies the ouo plugin into
Grafana and stops.

Open http://localhost:3000 and log in with **admin / testing567**. **More apps -> ouo11y
RUM** is there and still empty.

## Step 5. Instrument the backend

Stop the API with Ctrl+C in its terminal tab, then:

```bash
cd ~/Desktop/tiny-shop/backend
```

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/sdk-trace @opentelemetry/exporter-trace-otlp-http @opentelemetry/instrumentation-http @opentelemetry/instrumentation-express @opentelemetry/baggage-span-processor @opentelemetry/resources @opentelemetry/semantic-conventions
```

What each package is for: `api` is what your code calls (`trace.getTracer`); `sdk-node`
runs the SDK; `sdk-trace` has the span processors; `exporter-trace-otlp-http` sends spans
to the collector; the two `instrumentation-*` packages create the HTTP server and Express
spans for you; `baggage-span-processor` copies the browser's session id onto your spans
(step 6); `resources` and `semantic-conventions` name the service.

### 5a. Initialise the SDK

Create `backend/instrumentation.js`:

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
    [ATTR_SERVICE_NAME]: "tiny-shop-backend",
    [ATTR_SERVICE_VERSION]: "1.0.0",
    "deployment.environment.name": "local",
  }),
  spanProcessors: [
    // The browser SDK sends `baggage: session.id=...,user.id=...`; copy it onto every span so
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

Three things to know about it:

- **The credential.** The collector accepts nothing without
  `Authorization: Basic base64("<project id>:<project token>")`. The quickstart ships the
  `demo` project; check the value with `printf 'demo:pt_dev_demo_0000000000000000' | base64`.
- **The endpoint.** `http://localhost:4318` unless you moved the collector in step 4c; then
  start the API with `OUO_OTLP_ENDPOINT=http://localhost:14318` (shown below).
- **OpenTelemetry JS 3.0.** `BatchSpanProcessor` comes from `@opentelemetry/sdk-trace` and takes
  `{ exporter }`. Snippets written for 2.x use `sdk-trace-base` and `new BatchSpanProcessor(exporter)`;
  that version starts fine and crashes at the first export.

### 5b. Add manual spans

Replace `backend/server.js` with:

```js
// The API. HTTP server spans come from the auto-instrumentation; the spans below are manual.
const express = require("express");
const cors = require("cors");
const { trace, SpanStatusCode } = require("@opentelemetry/api");

const tracer = trace.getTracer("tiny-shop-backend");
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

`startActiveSpan` makes the new span the current one while the callback runs, so the spans
started inside it become its children, and all of them become children of the HTTP span the
auto-instrumentation opened for the request. Always `end()` a span you started.

### 5c. Run it with the SDK loaded first

The SDK has to load **before** Express, so the instrumentation can patch it. Save that as the
start script:

```bash
npm pkg set scripts.start="node --require ./instrumentation.js server.js"
```

```bash
npm start
```

It prints `[otel] tracing to http://localhost:4318/v1/traces`. Collector on 14318 (step 4c)?
Stop it and start it this way instead:

```bash
OUO_OTLP_ENDPOINT=http://localhost:14318 npm start
```

Send some traffic from another tab:

```bash
curl -X POST -H 'content-type: application/json' -d '{"items":[1,2]}' localhost:5001/api/checkout
```

```bash
curl localhost:5001/api/fail
```

### 5d. See the backend traces in Grafana

Wait up to a minute (Tempo's search catches up; open a trace by id and it is there sooner), then in Grafana: **Explore**, data source
**Tempo**, **TraceQL** tab:

```
{ resource.service.name = "tiny-shop-backend" }
```

Open the `POST /api/checkout` trace: `POST /api/checkout` -> the Express middleware spans ->
`checkout` -> `validate cart` and `charge card` (with its `payment accepted` event). The
`GET /api/fail` trace is red, with the exception recorded on it.

## Step 6. Instrument the web app

Stop Vite with Ctrl+C in its terminal tab, then:

```bash
npm install @ouo11y/browser@0.2.1
```

### 6a. Initialise the SDK

Create `frontend/src/rum.js`:

```js
// ouo browser SDK init: sessions, errors, fetch tracing, Web Vitals and replay.
import { initRUM } from "@ouo11y/browser";

// The tiny-shop API (backend/). Moved it? VITE_API_URL in .env.local.
export const API = import.meta.env.VITE_API_URL || "http://localhost:5001";

export const rum = initRUM({
  // The ouo collector. Moved ports? Set VITE_OUO_ENDPOINT and VITE_OUO_REPLAY_ENDPOINT in .env.local
  // (the replay URL is derived only when the endpoint uses port 4318).
  endpoint: import.meta.env.VITE_OUO_ENDPOINT || "http://localhost:4318",
  replayEndpoint: import.meta.env.VITE_OUO_REPLAY_ENDPOINT || undefined,
  projectId: "demo",
  projectToken: "pt_dev_demo_0000000000000000", // public by design, ships in the bundle
  service: { name: "tiny-shop-frontend", version: "1.0.0", environment: "local" },
  // Calls to the API get `traceparent` + `baggage`, so its spans join the browser's trace.
  // Use a RegExp: OpenTelemetry compares a string entry with the whole request URL.
  tracing: { propagateTo: [new RegExp(`^${API}/`)] },
  replay: { enabled: true, maskAllInputs: true },
  debug: true,
});
```

- **The package is `@ouo11y/browser`.** Importing `@ouo/browser` (its old name) fails with
  "could not be resolved".
- **`propagateTo`** lists the URLs that get the `traceparent` and `baggage` headers. That is what
  joins the API's spans to the browser's trace and carries `session.id` to the backend. Use a
  RegExp: OpenTelemetry compares a plain string with the **whole** request URL, so
  `"http://localhost:5001"` matches no call at all and the backend quietly starts its own trace.
- **The project token** is public by design: it ships in every page, like any RUM key.

Collector moved to 14318 in step 4c? Create `frontend/.env.local`; the replay URL is only
derived on its own when the endpoint is on 4318:

```
VITE_OUO_ENDPOINT=http://localhost:14318
VITE_OUO_REPLAY_ENDPOINT=http://localhost:14319
```

### 6b. Load it before React

Replace `frontend/src/main.jsx` with:

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

### 6c. Use it in the app

Replace `frontend/src/App.jsx` with:

```jsx
import { useEffect, useState } from "react";
import { API, rum } from "./rum";

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
    rum.addEvent("cart.added", { "product.id": p.id, "product.name": p.name });
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

Compared with step 3: the API URL now comes from `rum.js` (the same value `propagateTo` uses),
and **Add** records a custom `cart.added` event.

### 6d. Run it

```bash
npm run dev
```

Reload http://localhost:5173 and open DevTools -> Console:
`[ouo] @ouo11y/browser@0.2.1 initialised {...}`. In the Network tab, each call to the API now
has an `OPTIONS` preflight before it: the browser is asking the API to accept `traceparent`
and `baggage`, and `cors()` in `server.js` says yes.

## Step 7. See the full picture

Click **Add** twice, **Checkout**, **Call broken API**, then **Throw error**. Wait up to a
minute.

**One trace across both apps.** Explore -> Tempo -> TraceQL:

```
{ resource.service.name = "tiny-shop-backend" && name = "charge card" }
```

Open the newest trace. Its root is now the browser:

```
tiny-shop-frontend  POST
└─ tiny-shop-backend  POST /api/checkout
   ├─ middleware - corsMiddleware, middleware - jsonParser, request handler - /api/checkout
   └─ checkout
      ├─ validate cart
      └─ charge card
```

Click any backend span: `session.id` and `user.id` are on it, copied from the browser's
`baggage` by the `BaggageSpanProcessor`.

**Browser events.** Explore -> Loki:

```
{service_name="tiny-shop-frontend"}
```

`session.start`, `navigation`, `cart.added`, `http.request.failed` (the 500), `exception`
(the thrown error) and `web_vital` records, each with `session_id`.

**The session.** More apps -> ouo11y RUM -> Sessions: your session is `crashed` (the uncaught
error), with its traces and a replay of what you clicked.

## Step 8. Clean up

Stop the API and Vite with Ctrl+C. Stop the stack, keeping its data:

```bash
cd ~/Desktop/tiny-shop/stack
```

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
| `denied` when pulling `ghcr.io/ouo11y/...` | not logged in to ghcr.io, or no read access yet: step 4b |
| Vite: `@ouo/browser ... could not be resolved` | the package is `@ouo11y/browser` |
| `Cannot read properties of undefined (reading 'export')` in the API | OpenTelemetry 2.x code: `new BatchSpanProcessor({ exporter })` from `@opentelemetry/sdk-trace` |
| The backend trace starts at `POST /api/checkout`, without the browser span | `propagateTo` does not match the API URL (use the RegExp), or the page was not reloaded after editing `rum.js` |
| No `OPTIONS` before the API calls | same as above: no trace headers are being added |
| CORS error on `/v1/traces` or `/v1/replay/chunks` in the console | the page is not on `localhost` / `127.0.0.1` (the collector's allowed origins), or the replay URL is wrong after moving ports (`VITE_OUO_REPLAY_ENDPOINT`) |
| `401` from the collector | the `Authorization` header is missing or wrong |
| Nothing in Tempo yet | wait up to a minute: new traces reach search later than trace-by-id |
