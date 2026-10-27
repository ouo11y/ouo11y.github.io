---
title: Your backend
description: Any service with an OpenTelemetry SDK joins the browser's traces. There is no ouo11y backend SDK.
sidebar: { order: 3 }
---

There is no ouo11y backend SDK, and there will not be one. Instrument your services with the OpenTelemetry SDK for their language and export OTLP to the same collector.

Two things join the backend to the user's session:

1. **W3C Trace Context.** The browser's fetch span sends `traceparent` to the URLs you allow (`tracing.propagateTo` in our SDK, `propagateTraceHeaderCorsUrls` in plain OTel). Your server span becomes its child, so one trace runs from the click to the database.
2. **Baggage.** The browser sends `session.id` and `user.id` in the `baggage` header. Copy them onto your spans (a span processor that reads baggage) and you can search backend traces by session.

Your API must allow the `traceparent` and `baggage` request headers in CORS for cross-origin calls.

Example, Node, from the Tiny Shop OTel example (OpenTelemetry JS 3.0):

```js
// instrumentation.js, loaded with node --require ./instrumentation.js
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { BatchSpanProcessor } = require("@opentelemetry/sdk-trace");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http");
const { ExpressInstrumentation } = require("@opentelemetry/instrumentation-express");
const { BaggageSpanProcessor, ALLOW_ALL_BAGGAGE_KEYS } = require("@opentelemetry/baggage-span-processor");
const { resourceFromAttributes } = require("@opentelemetry/resources");

const exporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces",
  // the project credential, like the browser: Basic base64("demo:pt_dev_demo_0000000000000000")
  headers: { Authorization: "Basic ZGVtbzpwdF9kZXZfZGVtb18wMDAwMDAwMDAwMDAwMDAw" },
});

new NodeSDK({
  resource: resourceFromAttributes({ "service.name": "shop-api", "service.version": "1.0.0" }),
  spanProcessors: [
    new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS), // session.id and user.id from the browser
    new BatchSpanProcessor({ exporter }),
  ],
  instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
}).start();
```

Any language works the same way: set `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20<base64>`, and add a baggage span processor if your SDK has one.

Then in Grafana, **Explore → Tempo** with `{ resource.service.name = "shop-api" }`: the root of each trace is the browser's span.
