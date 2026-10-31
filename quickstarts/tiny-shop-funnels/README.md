# Tiny Shop Funnels: where shoppers drop between landing and paying

Quickstart 5 of the series. A small shop (an Express API and a React app with five pages) whose
page views and custom events make a funnel: home, a product page, add to cart, checkout, order
paid. A script drives about 50 real browser sessions through it with realistic drop-off; you
build the funnel in Grafana, read the conversion and the time between steps, and open the replay
of a session that gave up. Everything is in this folder: its own app, its own API, its own stack
and the session generator.

**To build it yourself** from an empty folder, one step at a time, follow
[build-it-yourself-guide.md](build-it-yourself-guide.md). The rest of this page runs the finished
`result/` as is.

> **Released images.** Funnels are newer than the released rum-api and Grafana images
> (`ghcr.io/ouo11y/rum-api:0.4.0`, `ghcr.io/ouo11y/grafana:0.4.0`, tagged before funnels merged), so this stack **builds both
> from this repository** (`stack/50-rum-api`, `stack/60-grafana`). Once a release with funnels is
> tagged, replace each `build:` block with `image: ghcr.io/ouo11y/rum-api:<version>` and
> `image: ghcr.io/ouo11y/grafana:<version>` and delete `60-grafana/Dockerfile`.

## What's new in this quickstart

| Bite | Where in the code | Where to see it |
|---|---|---|
| **Page steps**: every route change is a `navigation` event with `url.path` | `usePath` / `history.pushState` in [`frontend/src/App.jsx`](result/frontend/src/App.jsx) | step kind **Page** |
| **Event steps**: `rum.addEvent("add_to_cart")`, `rum.addEvent("order_paid")` | `addToCart`, `pay` in `App.jsx` | step kind **Event** |
| **A funnel report**: conversion, drop-off, median and p75 time per step | rum-api `POST /v1/funnels/query` | More apps -> ouo11y RUM -> **Funnels** |
| **From a drop-off to a replay** | rum-api `GET /v1/funnels/dropped` | click a hatched drop-off |
| **50 varied sessions** with a known answer | [`generate-sessions/generate.mjs`](result/generate-sessions/generate.mjs) | its last lines: the hand count |

<details>
<summary><b>What's running</b></summary>

| Service | Folder | Port on your machine | Job |
|---|---|---|---|
| ouo-collector | `stack/10-collector` | 4318 (OTLP), 4319 (replay) | the only ingest; checks the project credential, routes each signal |
| Tempo | `stack/20-tempo` | 3200 (loopback) | traces |
| Loki | `stack/30-loki` | 3100 (loopback) | page views and custom events: the funnel steps |
| rum-api (built here) | `stack/50-rum-api` | none | sessions, funnels and the replay store |
| Grafana + ouo11y RUM app (built here) | `stack/60-grafana` | 3000 | the UI, admin / testing567 |
| the API | `backend/` | 5001 | Express, OpenTelemetry Node SDK |
| the web app | `frontend/` | 5173 | React, `@ouo11y/browser` 0.2.1 |
| the session generator | `generate-sessions/` | none | Playwright, headless Chromium |

</details>

<details>
<summary><b>How the data flows</b></summary>

```
generate-sessions (50 headless browsers) ──drives──► web app (frontend/, @ouo11y/browser)
   navigation {url.path}, add_to_cart, order_paid ──► :4318     replay ──► :4319
                                     ▼
                       ouo-collector (10-collector)
            traces ──► Tempo     events ──► Loki     replay ──► rum-api
                                     │
  rum-api, POST /v1/funnels/query: one Loki query per step kind (pages, events),
  joined per session.id in memory, strict step order, counted per session
                                     ▼
       Grafana (60-grafana): More apps -> ouo11y RUM -> Funnels
           bars + drop-off -> sessions that dropped -> session page + replay
```

</details>

<details>
<summary><b>Each file explained</b></summary>

| File | What it does |
|---|---|
| `result/frontend/src/rum.js` | `initRUM`: sessions (no sampling, a funnel counts sessions), page views, replay with inputs masked |
| `result/frontend/src/App.jsx` | the shop: `/`, `/products/<id>`, `/cart`, `/checkout`, `/orders/<id>` with `pushState`, and the `add_to_cart`, `checkout_submitted`, `order_paid` events |
| `result/frontend/src/main.jsx` | imports `./rum` before React renders |
| `result/backend/server.js` | the API: products and a checkout that declines card `...0002` |
| `result/backend/instrumentation.js` | OTel Node SDK: traces to the collector with the project credential |
| `result/generate-sessions/generate.mjs` | 50 sessions over 8 personas (bounce, deep link, out of order, browse, cart, abandon, declined, buyer), seeded, then the expected count per step |
| `result/stack/compose.yaml` | only `include:` lines, one per service folder |
| `result/stack/10-collector/` | `compose.yaml`, `config.yaml`, `projects.htpasswd` (the `demo` project) |
| `result/stack/20-tempo/`, `30-loki/` | `compose.yaml` and the store's `config.yaml` |
| `result/stack/50-rum-api/` | `compose.yaml` (built from `services/rum-api`) and `config.yaml` |
| `result/stack/60-grafana/` | `compose.yaml`, `Dockerfile` (builds `plugins/ouo11y-rum-app` from the checkout, passed as the build context `ouo11y`) and `provisioning/` |

</details>

## Run it in five minutes

Needs Node 24, Docker Compose 2.24 or later and a checkout of this repository (the stack builds
rum-api and the plugin from it; from a copy of `result/` outside the checkout, set
`OUO11Y_REPO=<checkout root>` first). Commands have no `$` prompt; each runs from the folder named
above it.

**1. The stack.** The collector image is public, so there is nothing to log in to. From
`result/stack` (the first run builds rum-api and Grafana, two to three minutes):

```bash
docker compose up -d --build
```

**2. The API.** From `result/backend`:

```bash
npm install && npm start
```

**3. The web app.** From `result/frontend`, in a second terminal:

```bash
npm install && npm run dev
```

Click around http://localhost:5173 if you like: home, a product, **Add to cart**, **Cart**, **Go to
checkout**, **Pay** with any card.

**4. Fifty shoppers.** From `result/generate-sessions`, in a third terminal (about a minute):

```bash
npm install && npx playwright install chromium && npm run generate
```

It ends with the count you should find in Grafana:

```
50 sessions sent. Expected funnel page:/ -> page:/products/* -> event:add_to_cart -> page:/checkout -> event:order_paid:
  1. page:/                45 sessions
  2. page:/products/*      37 sessions   dropped 8
  3. event:add_to_cart     28 sessions   dropped 9
  4. page:/checkout        20 sessions   dropped 8
  5. event:order_paid      10 sessions   dropped 10
  (not entered: 5 sessions that never opened /)
```

Your own clicks from step 3 add to it; run it again and every number doubles.

## Build the funnel in Grafana

http://localhost:3000, admin / testing567. More apps -> ouo11y RUM -> **Funnels**, time range
**Last 1 hour**.

1. Step 1: **Page** **is** `/`. The value box suggests every path seen in the range, most
   frequent first.
2. Step 2: **Page** **starts with** `/products/`: any product page counts.
3. **Add step**: **Event** `add_to_cart`. Event names are suggested from the custom events
   (`rum.addEvent`).
4. **Add step**: **Page** **is** `/checkout`.
5. **Add step**: **Event** `order_paid`.
6. **Service**: `tiny-shop-funnels-frontend` (Enter), so other apps in the stack stay out.

Or open the finished funnel directly:
[`/a/ouo11y-rum-app/funnels?from=now-1h&to=now&service=tiny-shop-funnels-frontend&step=page:/&step=page:/products/*&step=event:add_to_cart&step=page:/checkout&step=event:order_paid`](http://localhost:3000/a/ouo11y-rum-app/funnels?from=now-1h&to=now&service=tiny-shop-funnels-frontend&step=page:/&step=page:/products/*&step=event:add_to_cart&step=page:/checkout&step=event:order_paid).
The steps live in the URL: copy it to share the funnel.

## Read it

| Under each bar | Meaning | Here |
|---|---|---|
| big % | sessions that reached this step, of those that entered step 1 | 22.2% paid |
| `n sessions · m users` | sessions that reached it, and their distinct users | 45 sessions entered |
| `% of previous step` | the step's own conversion: where is the steepest fall? | 50% of checkouts are paid |
| `median · p75` | time from the previous step, over the sessions that made it | a few seconds each here |
| hatched `−n` | sessions that reached the previous step and stopped | 10 stopped at checkout |

What the generator's personas teach:

- **Deep links do not enter.** 5 sessions land on `/products/2` from an "ad", buy, and never see
  `/`. They are not in this funnel: step 1 is a door. Try a funnel that starts at
  `page:/products/*` and they appear.
- **Order matters.** 3 sessions add to cart first and visit `/` afterwards: they count for step 1
  only. A funnel is strict order within one session; the [spec](../../../docs/specs/funnels.md) has
  the rules.
- **Repeats do not inflate.** Some browsers go home and pick a second product, some add twice:
  each step counts once per session.
- **Checkout is the leak.** Half the sessions that reach `/checkout` do not pay: 6 leave the form,
  4 have card `...0002` declined.

**Completed within** sets the maximum time from step 1 to the last step. Set **5 minutes**: no
change, these sessions are short. A step reached after the window does not count.

## From a drop-off to the replay

1. Click the hatched **−10** above **order_paid**. The table lists the 10 sessions that reached
   `/checkout` and stopped, latest first, with when they entered, how long they took to get stuck
   and their last page.
2. Click **Replay** on a row: the session page opens with the replay, the timeline and the traces.
   A declined one shows `Error: checkout failed: card declined` and the failed `POST
   /api/checkout`; an abandoned one just stops on the form.

## The API underneath

The page calls rum-api through Grafana (the plugin proxy adds the read token). The same query from
the shell, inside the stack's network:

```bash
docker compose exec grafana curl -s -X POST http://rum-api:8080/v1/funnels/query \
  -H 'Authorization: Bearer rt_dev_0000000000000000' -H 'Content-Type: application/json' \
  -d '{"from":"now-1h","filters":{"service":"tiny-shop-funnels-frontend"},"steps":[
       {"kind":"page","value":"/"},{"kind":"page","match":"prefix","value":"/products/"},
       {"kind":"event","value":"add_to_cart"},{"kind":"page","value":"/checkout"},
       {"kind":"event","value":"order_paid"}]}'
```

`GET /v1/funnels/dropped` (the drop-off list) and `GET /v1/funnels/steps` (the suggestions) are in
the [rum-api README](../../../services/rum-api/README.md#funnels).

<details>
<summary><b>rum.js, the whole file</b></summary>

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

<details>
<summary><b>Ports taken?</b></summary>

From `result/stack`:

```bash
OUO_GRAFANA_PORT=13000 OUO_OTLP_HTTP_PORT=14318 OUO_REPLAY_PORT=14319 docker compose up -d --build
```

Then `OUO_OTLP_ENDPOINT=http://localhost:14318 npm start` for the API, in
`frontend/.env.local`:

```
VITE_OUO_ENDPOINT=http://localhost:14318
VITE_OUO_REPLAY_ENDPOINT=http://localhost:14319
```

and `SHOP_URL=http://localhost:<vite port> npm run generate` if the web app moved. The web app
must stay on `localhost` or `127.0.0.1`, the only origins the collector allows.

</details>

## Clean up

From `result/stack`: `docker compose down` (add `-v` to delete the data and the replays), then
stop both `npm` commands with Ctrl+C.

## Things that bite

- **Only events inside the time range count.** A session whose `/` visit is before `from` does not
  enter, even if it pays inside the range. Widen the range rather than shifting it.
- **A step is a path, not a URL.** `url.path` has no query string or host: `/products/2?ref=ad`
  is `/products/2`.
- **Prefix means prefix.** `/products` (no trailing slash) also matches `/products-sale`; use
  `/products/`.
- **Sampling scales a funnel down.** With `session.sampleRate: 0.1` every step shows a tenth;
  conversion percentages stay right, counts do not.
- **Events on the way out.** The last events of a page are sent when it is hidden (pagehide). A
  tab killed by the OS can lose them; the generator leaves each page through `about:blank`.
