---
title: Semantic conventions and ouo.*
description: Every ouo.* name, why it exists, and when it becomes an OpenTelemetry name.
sidebar: { order: 2 }
---

ouo11y uses OpenTelemetry semantic conventions wherever one exists. Where none exists yet, the name is prefixed `ouo.`. You will see that prefix across our code and in your data.

**`ouo.` is a placeholder, not a brand.** Our policy:

1. **OTel first.** Before adding an `ouo.` name we look for an OpenTelemetry convention, stable or in development. If one fits, we use it.
2. **Switch when OTel decides.** When OpenTelemetry defines a convention for something we prefix, or tells us how to do it the OTel way, we move to it.
3. **No silent breaks.** During a migration window we emit both names, the Grafana app reads both, and the change is in the changelog and in [Announcements](/announcements/).
4. **Upstream, not around.** Where we need something OTel lacks, we would rather help define it upstream than keep a private name forever.

## Already OpenTelemetry

`session.id`, `session.previous_id`, `user.id`, `device.id`, `service.name`, `service.version`, `deployment.environment.name`, `exception.type`, `exception.message`, `exception.stacktrace`, `http.request.method`, `http.response.status_code`, `url.full`, `url.path`, `app.screen.name`, `event.name`.

## Waiting for OpenTelemetry

| ouo11y name today | What it means | OpenTelemetry status |
|---|---|---|
| `web_vital` event, `ouo.web_vital.name` / `.value` / `.rating` | a Core Web Vital measurement | OTel's browser instrumentation emits `browser.web_vital`; in development. We move when it is stable. |
| `navigation` event, `ouo.navigation.from` | a page or route change | OTel's browser instrumentation emits `browser.navigation`; in development. |
| `ouo.exception.fatal` | the exception crashed the app | no convention yet |
| `ouo.exception.handled` | the app caught it and reported it | no convention yet |
| `ouo.session.end_reason`, `ouo.session.duration_ms`, `ouo.session.started_at` | why and when a session ended | no convention yet |
| `ouo.platform` | `web` or `mobile` | no single convention yet |
| `ouo.user.anonymous` | the user id is generated, not a real login | no convention yet |
| `ouo.rage_click`, `ouo.dead_click`, `ouo.long_task`, `ouo.long_animation_frame` events | interaction problems | no convention yet |

The `ouo` short name also stays where it is not telemetry: collector components (`ouoreplay`, `ouosentry`, `ouoratelimit`), `OUO_*` environment variables, the Helm chart.

Spot a convention we missed? Tell us on GitHub; it is a bug.
