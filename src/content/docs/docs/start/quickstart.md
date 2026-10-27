---
title: Run it locally
description: The whole ouo11y stack (collector, Loki, Tempo, Mimir, rum-api, Grafana) with one compose file.
sidebar: { order: 3 }
---

You need Docker with Compose v2.

:::note[Early access]
The ouo11y container images are private while we are in early access. Email [hello@ouo11y.com](mailto:hello@ouo11y.com) for pull access; we answer quickly.
:::

1. Copy `deploy/compose/quickstart.yaml` from the ouo11y repository into an empty folder as `compose.yaml`. It holds every config inline.
2. Log in to the registry, then start the stack:

   ```bash
   docker compose up -d
   ```

3. Open Grafana at `http://localhost:3000` and go to **More apps → ouo11y RUM**.

What is listening:

| Endpoint | Address |
|---|---|
| Grafana | `http://localhost:3000` |
| OTLP/HTTP (traces, logs, metrics) | `http://localhost:4318` |
| Replay chunks | `http://localhost:4319/v1/replay/chunks` |

Every request to the collector carries a project credential as HTTP Basic auth. The local stack ships a demo project: id `demo`, token `pt_dev_demo_0000000000000000`. Project tokens are public by design (they ship in your web bundle); they only allow writing into one project, under the collector's rate limits.

Ports taken? Put `OUO_GRAFANA_PORT`, `OUO_OTLP_HTTP_PORT`, `OUO_REPLAY_PORT` in a `.env` file next to `compose.yaml`.

Next: send it something, either with [the SDK](/docs/instrument/ouo-sdk/) or with [plain OpenTelemetry](/docs/instrument/bring-your-own-otel/).
