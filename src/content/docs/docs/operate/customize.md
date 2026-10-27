---
title: Everything is customizable
description: No vendor should tell you how to observe your system. Every layer of ouo11y is yours to change.
---

No vendor should tell you how to observe your own system. Every layer of ouo11y is a standard, replaceable part with defaults you can change.

| Layer | What you can change |
|---|---|
| **Instrumentation** | Our SDK, plain OpenTelemetry, or both in different apps. Every SDK behavior is an option: session timeouts, sampling, replay masking and blocking, what gets traced. |
| **Collector** | It is a normal OpenTelemetry Collector config. Add processors (sampling, redaction with OTTL, attribute enrichment), add exporters (send a copy anywhere else), or build your own distribution. |
| **Storage** | Loki, Tempo and Mimir, configured by you: retention, object storage, tenancy. Replay goes to the filesystem or any S3-compatible store. |
| **Dashboards** | Everything is queryable in Explore with LogQL, TraceQL and PromQL. Build your own panels next to ours, or ignore ours. |
| **Session rules** | Inactivity, maximum duration and background timeouts are options in the SDK. |
| **Deployment** | Docker Compose on a laptop, Docker on a single VM, or Helm on Kubernetes. Bring your own Grafana or LGTM stack. |
| **Privacy** | Inputs are masked in replay by default; add `ouo-mask` and `ouo-block` classes or selectors. Redact attributes in the collector before anything is stored. |

## Tips

- **Send a copy elsewhere.** Add a second exporter to the collector pipeline. Your telemetry is OTLP; any OTLP backend takes it.
- **Drop what you do not need at the edge.** A `filter` processor in the collector costs less than storing and ignoring.
- **Redact once, centrally.** An OTTL `replace_pattern` in a `transform` processor covers every app, including ones you do not control the code of.
