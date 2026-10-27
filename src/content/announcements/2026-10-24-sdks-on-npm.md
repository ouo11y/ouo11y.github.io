---
title: "@ouo11y/browser and @ouo11y/react-native are on npm"
description: Both SDKs are published on npmjs.org under the Apache-2.0 licence.
date: 2026-10-24
tags: [release, sdk]
---

The browser and React Native SDKs are public on npm:

```bash
npm install @ouo11y/browser
```

```bash
npm install @ouo11y/react-native
```

`@ouo11y/browser` 0.3.0 is the current browser release. Both are Apache-2.0 and emit nothing but OpenTelemetry: OTLP spans and log records, plus rrweb replay chunks on the web.

Prefer not to add our SDK? You do not have to: [Bring your own OpenTelemetry](/docs/instrument/bring-your-own-otel/).
