---
title: Principles
description: The rules ouo11y is built by. If we break one, it is a bug.
sidebar: { order: 1 }
---

These are not marketing. They decide what we build and what we refuse to build. If ouo11y breaks one of them, open an issue and we treat it as a bug.

## 1. Open source

The code you embed in your apps (the browser, React Native and iOS SDKs), the Grafana plugin, the collector distribution, the Helm chart and the deploy files are Apache-2.0. The session service, rum-api, is AGPL-3.0. You can read every line that touches your data, run it yourself, and fork it.

## 2. OpenTelemetry compliant

Every signal is OTLP. Spans are spans, events are OTel log records with `event.name`, metrics are OTel metrics. Attribute names follow OpenTelemetry semantic conventions wherever a convention exists. There is no proprietary wire format and no private agent. If you stop using ouo11y, your instrumentation keeps working against any OTLP backend, and your data is already in open formats in Loki, Tempo and Mimir.

## 3. End-to-end, unified observability

One dashboard for the whole story. A user's tap, the request it sent, the backend spans it caused, the log lines along the way and the replay of what the user saw sit on one timeline, joined by W3C Trace Context and a shared `session.id`. You should not need four tools and a spreadsheet to answer "what happened to this person?".

## 4. No vendor should tell you how to observe your system

Your system, your rules. Hence everything is customizable: the collector pipeline (sampling, redaction, routing, extra exporters), where data is stored and for how long, the dashboards, the session rules, the replay masking. We ship defaults that work, and we never hide a knob. See [Customize](/docs/operate/customize/).

## 5. We do not push you to use our SDK

`@ouo11y/browser` and `@ouo11y/react-native` are shortcuts, not requirements. ouo11y reads OpenTelemetry, so an app instrumented with the plain OTel JS SDK, rrweb and web-vitals gets the same sessions, traces and replays. We document the exact contract and keep a working example of it: [Bring your own OpenTelemetry](/docs/instrument/bring-your-own-otel/).

## 6. `ouo.*` is temporary

Where OpenTelemetry has no convention yet (whether a session ended because of inactivity, whether an exception was fatal), we use an attribute prefixed `ouo.`. Each one is a placeholder. When OpenTelemetry defines the attribute, or tells us how to do it the OTel way, we move to the OTel name, emit both during a migration window, and announce it. The list and the status of each is in [Semantic conventions](/docs/concepts/semantic-conventions/).
