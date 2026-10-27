---
title: Sessions and health
description: How a session starts, rotates and ends, and how it is classified healthy, errored or crashed.
sidebar: { order: 1 }
---

A **session** is a bounded period of one user using one app instance on one device, identified by `session.id` (a UUID made on the client). Every span and log record in the session carries it.

## Start

- **Web**: on init, the persisted session in `localStorage` is resumed if it was active in the last 30 minutes and is younger than 4 hours. Otherwise a new one starts with `session.start`, and `session.previous_id` points at the expired one. Tabs of one origin share the session.
- **Mobile**: every cold start begins a new session. Coming back from the background after more than 30 seconds does too.

## End

| Reason | When |
|---|---|
| `inactivity` | no activity for 30 minutes |
| `max_duration` | older than 4 hours |
| `background` | mobile app in the background for more than 30 seconds |
| `crash` | a fatal error on mobile (a web uncaught error marks the session crashed but does not end it) |
| `terminated` | the mobile process ended without a crash |
| `user_change` | another identified user logged in, or the user logged out |
| `manual` | the app called `endSession()` |

The server never depends on `session.end` arriving: a session with no signal for 30 minutes is treated as ended.

All timeouts are options. Your product, your definition of a session.

## Health

Each session is exactly one of:

- **crashed**: at least one fatal exception (`ouo.exception.fatal = true`);
- **errored**: no crash, but at least one exception or failed request;
- **healthy**: neither.

The Grafana app shows the percentage of each per platform and app version (`service.version`), so a bad release shows up minutes after you ship it.
