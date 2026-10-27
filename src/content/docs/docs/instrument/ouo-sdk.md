---
title: The ouo11y SDK
description: "@ouo11y/browser: sessions, errors, fetch tracing, Web Vitals and rrweb replay over OTLP in five minutes."
sidebar: { order: 1 }
---

`@ouo11y/browser` is an OpenTelemetry-based SDK, Apache-2.0, on npm. It produces exactly the signals described in [the contract](/docs/instrument/bring-your-own-otel/#the-contract), plus extras you would otherwise write yourself.

```bash
npm install @ouo11y/browser
```

```ts
import { initRUM } from "@ouo11y/browser";

const rum = initRUM({
  endpoint: "http://localhost:4318",            // your collector, OTLP/HTTP
  projectId: "demo",
  projectToken: "pt_dev_demo_0000000000000000", // public by design
  service: { name: "web-store", version: "1.4.2", environment: "local" },
  tracing: { propagateTo: [/^https:\/\/api\.example\.com\//] },
  replay: { enabled: true, maskAllInputs: true },
});

rum.setUser({ id: "user-42" });
rum.addEvent("cart.added", { sku: "sku-1", qty: 2 });
```

Call `initRUM` once, as early as possible. The main entry is about 42 KB gzipped; rrweb is a separate chunk downloaded only when replay is on and the session is sampled.

## What you get

- **Sessions** that start, rotate and end by [a written spec](/docs/concepts/sessions/), shared across tabs.
- **Errors**: uncaught errors and rejections, `rum.captureError()`, failed requests.
- **Traces**: fetch and XHR spans with W3C `traceparent` and `baggage` to the URLs you allow, document load, clicks and soft navigations as spans.
- **Web Vitals** and navigation events.
- **Replay** with rrweb: sampling, error-triggered replay, input masking on by default, `ouo-block` and `ouo-mask` classes.
- **Delivery**: gzip, retries with backoff, and an offline store that sends after reconnect.

## Everything is an option

Session timeouts, sampling, replay masking and selectors, rage and dead click detection, long tasks, retries, offline storage: each has an option with a sane default. The full table is in the SDK README in the repository (`sdk/browser/README.md`).

## Leaving the SDK

Because the SDK only emits OpenTelemetry, you can replace it with [plain OpenTelemetry](/docs/instrument/bring-your-own-otel/) later without touching the server side. Nothing in your data is SDK-specific.
