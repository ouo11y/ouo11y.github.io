---
title: "RUM without our SDK: what ouo11y actually needs from a browser"
description: Five lines of contract. Everything else is plain OpenTelemetry, rrweb and web-vitals.
date: 2026-10-28
tags: [opentelemetry, browser, how-to]
---

We build an SDK, and we tell you that you do not need it. That is not a contradiction: it is the point of building on OpenTelemetry.

ouo11y reads OTLP. It does not check who wrote the span. So the honest question is not "how do I install ouo11y?" but "what does ouo11y need to see?". The answer fits in five lines:

1. **Where**: OTLP/HTTP to the collector, with a project credential as HTTP Basic auth.
2. **Who**: `service.name`, `service.version`, `deployment.environment.name` on the resource.
3. **Which session**: `session.id` and `user.id` on every span and log record, and in `baggage` to your API.
4. **What happened**: log records with `event.name` = `session.start`, `session.end`, `exception`, `http.request.failed`, `navigation`, `web_vital`.
5. **Replay**: rrweb events in ordered chunks to the replay endpoint.

That is the whole contract, and it is all [in the docs](/docs/instrument/bring-your-own-otel/#the-contract).

## What it costs to do it yourself

We did it, from an empty folder, for our Tiny Shop example: a React shop and an Express API, instrumented by hand. The browser side is about 400 lines in six files. The one that matters most is 20 lines: a session id in `localStorage` that expires after 30 minutes idle or 4 hours total.

Two traps cost us the most time:

- **Baggage disappears.** The browser has no async context, so baggage set with `context.with()` is gone when `fetch` actually sends. Add `session.id` to baggage in the propagator, at inject time.
- **String URLs in `propagateTraceHeaderCorsUrls` must match the whole URL.** `"http://localhost:8081"` matches no API call. Use a RegExp.

## What the SDK adds on top

Retries and an offline queue, replay recorded by one tab at a time, sampling, rage and dead clicks, click spans that parent the requests they cause. Most of it is a few lines each; the long tail of edge cases is why `@ouo11y/browser` has about as many lines of tests as of code.

So: start with the SDK if you want it working today. Start with plain OpenTelemetry if you want zero vendor code in your bundle. Either way you get the same sessions in Grafana, and you can switch later without touching the server.
