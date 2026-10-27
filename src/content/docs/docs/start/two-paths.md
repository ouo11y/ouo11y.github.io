---
title: Two ways in
description: Instrument with the ouo11y SDK, or with plain OpenTelemetry. ouo11y reads both the same way.
sidebar: { order: 2 }
---

ouo11y does not care who produced the telemetry, only that it is OpenTelemetry in the shape described in [the contract](/docs/instrument/bring-your-own-otel/#the-contract). You can pick per app, and change your mind later.

| | ouo11y SDK | Plain OpenTelemetry |
|---|---|---|
| Packages in your app | `@ouo11y/browser` | `@opentelemetry/*`, `rrweb`, `web-vitals` |
| Time to first session | about 5 minutes | about 45 minutes, following the guide |
| Sessions, errors, Web Vitals, fetch traces | built in | you write them, about 400 lines |
| Session replay | built in, sampling and masking options | rrweb, chunked by you |
| Rage clicks, dead clicks, long tasks, offline queue, retries | built in | up to you |
| Code from ouo11y in your bundle | yes, Apache-2.0 | none |
| Result in Grafana | the same | the same |

## Pick the SDK when

- you want RUM working today, with the conventions already right;
- you want the extras (replay sampling on error, offline storage, rage and dead clicks) without writing them.

Start with [The ouo11y SDK](/docs/instrument/ouo-sdk/).

## Pick plain OpenTelemetry when

- your organization only allows upstream OpenTelemetry packages in production bundles;
- you already have OTel in the browser and only want ouo11y's sessions and replay on top;
- you want to understand exactly what goes over the wire.

Start with [Bring your own OpenTelemetry](/docs/instrument/bring-your-own-otel/). The worked example is Tiny Shop OTel: a React shop and an Express API, instrumented by hand, with a step-by-step guide.

## The backend is always plain OpenTelemetry

There is no ouo11y backend SDK, on purpose. Any service instrumented with an OpenTelemetry SDK joins the browser's traces through W3C Trace Context. See [Your backend](/docs/instrument/backend/).
