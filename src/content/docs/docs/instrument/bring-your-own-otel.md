---
title: Bring your own OpenTelemetry
description: Use ouo11y with no ouo11y code in your app. The exact contract, and a worked example.
sidebar: { order: 2 }
---

ouo11y reads OpenTelemetry. If your browser app sends the signals below, you get the same sessions, health percentages, timelines, traces and replays as with our SDK, with nothing but upstream open-source packages in your bundle: the OpenTelemetry JS SDK, [rrweb](https://github.com/rrweb-io/rrweb) and [web-vitals](https://github.com/GoogleChrome/web-vitals).

## The contract

This is the whole contract. Our SDK does exactly this.

| What | How |
|---|---|
| **Where** | OTLP/HTTP to the collector: `:4318/v1/traces` and `:4318/v1/logs`. Every request carries `Authorization: Basic base64("<project id>:<project token>")`. |
| **Who** | Resource attributes `service.name`, `service.version`, `deployment.environment.name`, and `ouo.platform = "web"`. |
| **Which session** | `session.id` and `user.id` on **every** span and log record, as attributes, not resource attributes (the session can change while the page lives). Also in the `baggage` header to your API. |
| **What happened** | OTel log records whose `event.name` is `session.start`, `session.end`, `exception`, `http.request.failed`, `navigation` or `web_vital`. Any other name is shown as a custom event. |
| **Replay** | rrweb events in chunks `{ session_id, seq, started_at, ended_at, events }`, `POST` to `:4319/v1/replay/chunks` with the same credential and the `x-ouo-session-id` and `x-ouo-seq` headers. |

From these, ouo11y builds the session (healthy, errored or crashed), its timeline, its traces and its replay. An `exception` with `ouo.exception.fatal = true` makes the session `crashed`; a non-fatal one or an `http.request.failed` makes it `errored`.

## Event attributes

| `event.name` | Attributes besides `session.id` and `user.id` |
|---|---|
| `session.start` | `session.previous_id` when it replaced an expired session |
| `session.end` | `ouo.session.end_reason`, `ouo.session.duration_ms` |
| `exception` | `exception.type`, `exception.message`, `exception.stacktrace`, `ouo.exception.fatal`, `ouo.exception.handled` |
| `http.request.failed` | `http.request.method`, `url.full`, `http.response.status_code` |
| `navigation` | `url.path`, `ouo.navigation.from` |
| `web_vital` | `ouo.web_vital.name`, `ouo.web_vital.value`, `ouo.web_vital.rating` |

Every `ouo.`-prefixed name here is waiting for an OpenTelemetry convention: see [Semantic conventions](/docs/concepts/semantic-conventions/).

## A session id in 20 lines

The session is the only state you keep yourself. A UUID in `localStorage`, renewed after 30 minutes of inactivity or 4 hours in total, and shared by every tab of the origin:

```js
const KEY = "app.session";
const INACTIVITY_MS = 30 * 60 * 1000;
const MAX_MS = 4 * 60 * 60 * 1000;

export function getSession(now = Date.now()) {
  let s = JSON.parse(localStorage.getItem(KEY) ?? "null");
  if (!s || now - s.lastActivity >= INACTIVITY_MS || now - s.startedAt >= MAX_MS) {
    s = { id: crypto.randomUUID(), startedAt: now, lastActivity: now, previousId: s?.id };
    // emit session.end for the old one and session.start for this one here
  }
  s.lastActivity = now;
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}
```

Then a `SpanProcessor` whose `onStart` sets `session.id` and `user.id` on every span, and a propagator that adds them to `baggage` at inject time (the browser has no async context, so baggage set with `context.with()` is gone by the time `fetch` sends).

## The worked example: Tiny Shop OTel

A React shop and an Express API, instrumented by hand, with a guide that builds every file from an empty folder in about 45 minutes. It lives in the ouo11y repository under `examples/quickstarts/tiny-shop-otel`:

- `build-it-yourself-guide.md`: the step-by-step guide.
- `result/frontend/src/telemetry/`: the finished browser telemetry, about 400 lines in six files (`config.js`, `session.js`, `otel.js`, `events.js`, `replay.js`, `index.js`).
- `result/stack/`: the ouo11y stack, one folder per service.

## Things that bite

- **OpenTelemetry JS 3.0 in the browser**: `@opentelemetry/sdk-trace-web` is deprecated. The `TracerProvider` and the `StackContextManager` are in `@opentelemetry/sdk-trace`, and there is no `provider.register()`: set the context manager, propagator and providers on the API globals.
- **`@opentelemetry/instrumentation-fetch` is deprecated** in its README, though npm does not flag it. Use `@opentelemetry/browser-instrumentation/experimental/fetch`.
- **`propagateTraceHeaderCorsUrls` strings must equal the whole URL.** Use a RegExp.
- **Event names are the contract.** OTel's own browser instrumentations emit `browser.navigation` and `browser.web_vital`, which ouo11y shows as custom events today. See [Semantic conventions](/docs/concepts/semantic-conventions/) for where this is going.
- **LCP and FCP need a visible page.** web-vitals reports nothing for a page loaded in a background tab.
