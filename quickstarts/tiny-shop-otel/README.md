# Tiny Shop OTel: ouo RUM without the ouo SDK

The [Tiny Shop](../tiny-shop/README.md) app, with the web app instrumented by hand: the
OpenTelemetry JS SDK, [rrweb](https://github.com/rrweb-io/rrweb) and
[web-vitals](https://github.com/GoogleChrome/web-vitals), no `@ouo11y/browser`. For teams that
want ouo's sessions, traces and replays but keep their browser instrumentation to standard open
source libraries. ouo sees the same session the SDK would have sent:

```
tiny-shop-otel-frontend  POST                    (fetch span, @opentelemetry/browser-instrumentation)
└─ tiny-shop-otel-backend  POST /api/checkout    (HTTP server span, auto-instrumentation)
   └─ checkout
      ├─ validate cart
      └─ charge card
every span: session.id, user.id                 (SessionSpanProcessor in the browser, baggage in the API)
session: crashed, activity, traces, replay      (OTLP log records + rrweb chunks)
```

| Path | What |
|---|---|
| `result/frontend/src/telemetry/config.js` | collector URLs, the project credential, the service name |
| `result/frontend/src/telemetry/session.js` | the session id in `localStorage`: 30 min inactivity, 4 h max, shared by tabs |
| `result/frontend/src/telemetry/otel.js` | OpenTelemetry: resource, tracer and logger providers, OTLP exporters, fetch instrumentation, `session.id` on every span and in `baggage` |
| `result/frontend/src/telemetry/events.js` | RUM events as log records: `session.start` / `session.end`, `exception`, `http.request.failed`, `navigation`, `web_vital`, custom events |
| `result/frontend/src/telemetry/replay.js` | rrweb recording, cut into chunks and posted to the replay receiver |
| `result/frontend/src/telemetry/index.js` | starts it all, flushes when the page is hidden |
| `result/frontend/src/App.jsx` | the shop: Add (custom event), Checkout, Call broken API (500), Throw error (crash) |
| `result/backend/` | the Tiny Shop API, unchanged apart from its service name |
| `result/stack/` | the ouo stack, one folder per service: collector, Tempo, Loki, Mimir, rum-api, Grafana |

Two ways to use it:

- **Build it yourself (recommended):** [build-it-yourself-guide.md](build-it-yourself-guide.md)
  starts with what ouo needs from a browser (one table), then builds the same files from an empty
  folder, one step at a time. About 45 minutes.
- **Run the finished result:** the steps below.

Needs Node 24 and Docker. Commands have no `$` prompt; each runs from the folder named above it.

## 1. Run the ouo stack

Log in to ghcr.io (the images are private for now:
[fast-tracked 00, "Pull access"](../../fast-tracked/00-stack.md)), then from
`examples/quickstarts/tiny-shop-otel/result/stack`:

```bash
docker compose up -d
```

Grafana is on http://localhost:3000 (admin / testing567), the collector on `:4318` (OTLP) and
`:4319` (replay). Ports taken? See [Ports](#ports) below.

The ouo images are on `latest`, which follows each release; each compose file names the version
and digest this example was tested with (collector 0.4.0, rum-api 0.5.0, grafana 0.5.0), to pin
if you want to stay on them.

## 2. Start the API

From `examples/quickstarts/tiny-shop-otel/result/backend`:

```bash
npm install
```

```bash
npm start
```

It prints `[otel] tracing to http://localhost:4318/v1/traces` and serves on `:5001`.

## 3. Start the web app

From `examples/quickstarts/tiny-shop-otel/result/frontend`, in a second terminal:

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. The DevTools console prints `[telemetry] session <uuid>`. Click
**Add** on a product, then **Checkout**, then **Call broken API** and **Throw error**. Switch to
another tab for a moment: the page sends its Web Vitals and its last replay chunk when it is hidden.

## 4. See it in Grafana

Give Tempo up to a minute after the click before searching.

- **The session:** More apps -> ouo11y RUM -> Sessions. The newest `tiny-shop-otel-frontend`
  session is `crashed`, with 1 failed request, its traces, its activity list and a replay.
- **One trace across both apps:** Explore -> Tempo -> TraceQL
  `{ resource.service.name = "tiny-shop-otel-backend" && name = "charge card" }`: the root is the
  browser's `POST` span, and every span has the session's `session.id`.
- **Browser events:** Explore -> Loki -> `{service_name="tiny-shop-otel-frontend"}`:
  `session.start`, `navigation`, `cart.added`, `http.request.failed`, `exception`, `web_vital`.

## Ports

If the stack runs on other ports (a `result/stack/.env` with `OUO_OTLP_HTTP_PORT=14318`,
`OUO_REPLAY_PORT=14319`, ...), point both apps at them:

```bash
OUO_OTLP_ENDPOINT=http://localhost:14318 npm start
```

and in `frontend/.env.local`:

```
VITE_OTLP_ENDPOINT=http://localhost:14318
VITE_REPLAY_ENDPOINT=http://localhost:14319
```

The API on another port: `PORT=5002 npm start` and `VITE_API_URL=http://localhost:5002` in
`frontend/.env.local`. The web app must stay on a `localhost` or `127.0.0.1` origin, the only ones
the quickstart collector allows (CORS).

## Copy it out of the repo

`result/` works anywhere: copy it out and run the same commands. Neither app installs an ouo
package.

## Things that bite

- **OpenTelemetry JS 3.0 in the browser.** `@opentelemetry/sdk-trace-web` is deprecated: the
  `TracerProvider` and the browser's `StackContextManager` are in `@opentelemetry/sdk-trace`, and
  there is no `provider.register()`; set the context manager, propagator and providers on the API
  globals, as `otel.js` does. The Logs API is in `@opentelemetry/api` (`logs`), not `api-logs`.
- **Baggage has to be added at inject time.** The browser has no async context, so baggage set
  with `context.with()` is gone when `fetch` sends the request; `SessionPropagator` adds the
  session on every inject.
- **`@opentelemetry/instrumentation-fetch` is deprecated** (in its README; npm does not flag it).
  Its replacement is `@opentelemetry/browser-instrumentation/experimental/fetch`, same options.
  That package's other instrumentations emit their own event names, which ouo does not classify.
- **`propagateTraceHeaderCorsUrls` strings must equal the whole URL.** Use a RegExp.
- **Event names are the contract.** ouo classifies `exception`, `http.request.failed`,
  `navigation`, `web_vital`, `session.start` and `session.end` by `event.name`. The OpenTelemetry
  browser instrumentations emit other names (`browser.navigation`, `browser.web_vital`, ...),
  which ouo shows as custom events and does not count in session health.
- **Every request needs the project credential**, the replay chunks too:
  `Authorization: Basic base64("demo:pt_dev_demo_0000000000000000")`. Without it the collector answers 401.
- **rum-api 0.5.0 exports its own telemetry** and needs `OTEL_EXPORTER_OTLP_ENDPOINT` pointing at
  the collector (`stack/50-rum-api/compose.yaml`); without it, it logs a failed connection to
  `localhost:4318` every second.
- **LCP and FCP need a visible page.** web-vitals reports nothing for a page that loaded in a
  background tab.
