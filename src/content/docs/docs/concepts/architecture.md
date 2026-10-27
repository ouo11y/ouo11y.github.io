---
title: Architecture
description: Apps send OTLP to an OpenTelemetry Collector, which writes to Loki, Tempo and Mimir; rum-api builds sessions; Grafana shows it all.
sidebar: { order: 3 }
---

```
web / mobile app ──OTLP + replay──┐
                                  ▼
your backend ────OTLP──────► OpenTelemetry Collector ──► Loki    (events, logs)
                                  │                  ──► Tempo   (traces)
                                  │                  ──► Mimir   (metrics)
                                  └─ replay chunks ──► rum-api ──► object storage
                                                           ▲
                                     Grafana + ouo11y app ─┘  sessions, health, replay
```

- **The collector is the edge.** Everything enters through an OpenTelemetry Collector: OTLP on `:4318`, replay chunks on `:4319`, each request with a project credential. The ouo11y distribution adds a replay receiver, a rate limiter and a Sentry SDK bridge; you can build your own with the OpenTelemetry Collector Builder.
- **Storage is the LGTM stack.** Loki, Tempo and Mimir hold the data in open formats. You may already run them.
- **rum-api** folds the signals of one `session.id` into a session record (status, counts, traces, replay) and stores replay chunks. It is internal; nothing outside reaches it.
- **Grafana** with the ouo11y app plugin shows health, the sessions list and a session's timeline, traces and replay, next to every other dashboard you have.
