---
title: "Tip: redact once, at the collector, with OTTL"
description: One transform processor covers every app, including the ones whose code you do not own.
date: 2026-10-28
tags: [collector, ottl, privacy, tips]
---

Telemetry leaks personal data in boring ways: an email in a URL query string, a token in an exception message. Fixing it in every app's SDK config means fixing it in every app. Fix it once, at the edge, in the OpenTelemetry Collector.

The OpenTelemetry Transformation Language (OTTL) [reached v1 this week](https://opentelemetry.io/blog/2026/ottl-v1/), which makes this a stable thing to build on.

```yaml
processors:
  transform/redact:
    error_mode: ignore
    trace_statements:
      - replace_pattern(span.attributes["url.full"], "([?&])(email|token)=[^&]*", "$$1$$2=REDACTED")
    log_statements:
      - replace_pattern(log.attributes["url.full"], "([?&])(email|token)=[^&]*", "$$1$$2=REDACTED")
      - replace_pattern(log.attributes["exception.message"], "[\\w.+-]+@[\\w-]+\\.[\\w.]+", "<email>")

service:
  pipelines:
    traces:
      processors: [transform/redact, batch]
    logs:
      processors: [transform/redact, batch]
```

Three things to know:

- **`$$` in collector YAML.** The collector expands `$` as an environment variable, so a regex back-reference `$1` is written `$$1`.
- **Put redaction before `batch`.** Processors run in order; redact first so nothing unredacted is buffered.
- **Test it with `debug`.** Add the `debug` exporter with `verbosity: detailed` to a pipeline while you write the patterns, and remove it after.

In ouo11y this goes into the collector config you already run. Nothing in your apps changes, and it covers every app that sends to that collector, whether it uses our SDK or not.
