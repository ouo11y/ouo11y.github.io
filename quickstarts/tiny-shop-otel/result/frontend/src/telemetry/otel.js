// OpenTelemetry for the browser: spans and logs to the ouo collector over OTLP/HTTP.
import { context, logs, propagation, trace } from "@opentelemetry/api";
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
// The fetch instrumentation from the opentelemetry-browser repo; @opentelemetry/instrumentation-fetch
// is deprecated in its favour. The package is experimental, hence the path.
import { FetchInstrumentation } from "@opentelemetry/browser-instrumentation/experimental/fetch";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { BatchSpanProcessor, StackContextManager, TracerProvider } from "@opentelemetry/sdk-trace";
import { API, AUTHORIZATION, OTLP_ENDPOINT, REPLAY_ENDPOINT, SERVICE } from "./config.js";
import { deviceId, getSession, touch } from "./session.js";

const headers = { Authorization: AUTHORIZATION };

// Who sent the data. ouo.platform = "web" tells ouo this is a browser app.
const resource = resourceFromAttributes({
  "service.name": SERVICE.name,
  "service.version": SERVICE.version,
  "deployment.environment.name": SERVICE.environment,
  "ouo.platform": "web",
  "device.id": deviceId,
});

// session.id and user.id go on every span, not on the resource: the session can change while
// the page stays open.
class SessionSpanProcessor {
  onStart(span) {
    const session = getSession();
    span.setAttribute("session.id", session.id);
    span.setAttribute("user.id", session.userId);
  }
  onEnd() {}
  forceFlush() {
    return Promise.resolve();
  }
  shutdown() {
    return Promise.resolve();
  }
}

// traceparent joins the API's spans to the browser's trace; baggage carries session.id and
// user.id to the API. The baggage is added at inject time because the browser has no async
// context: baggage set with context.with() is gone by the time fetch sends the request.
class SessionPropagator {
  inner = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  });
  inject(ctx, carrier, setter) {
    const session = getSession();
    const baggage = (propagation.getBaggage(ctx) ?? propagation.createBaggage())
      .setEntry("session.id", { value: session.id })
      .setEntry("user.id", { value: session.userId });
    this.inner.inject(propagation.setBaggage(ctx, baggage), carrier, setter);
  }
  extract(ctx, carrier, getter) {
    return this.inner.extract(ctx, carrier, getter);
  }
  fields() {
    return this.inner.fields();
  }
}

export const tracerProvider = new TracerProvider({
  resource,
  spanProcessors: [
    new SessionSpanProcessor(),
    new BatchSpanProcessor({ exporter: new OTLPTraceExporter({ url: `${OTLP_ENDPOINT}/v1/traces`, headers }) }),
  ],
});

export const loggerProvider = new LoggerProvider({
  resource,
  processors: [
    new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${OTLP_ENDPOINT}/v1/logs`, headers }) }),
  ],
});

context.setGlobalContextManager(new StackContextManager().enable());
propagation.setGlobalPropagator(new SessionPropagator());
trace.setGlobalTracerProvider(tracerProvider);
logs.setGlobalLoggerProvider(loggerProvider);

// Called for every failed fetch; set by events.js (it emits http.request.failed).
let onFailedFetch = () => {};
export function setFailedFetchHandler(fn) {
  onFailedFetch = fn;
}

registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation({
      // Only calls to our API get the trace headers. A RegExp: a plain string must equal the whole URL.
      propagateTraceHeaderCorsUrls: [new RegExp(`^${API}/`)],
      // Never trace the telemetry itself.
      ignoreUrls: [new RegExp(`^${OTLP_ENDPOINT}/`), new RegExp(`^${REPLAY_ENDPOINT}/`)],
      applyCustomAttributesOnSpan(span, request, result) {
        touch();
        if (result.status >= 400) onFailedFetch(request.method ?? "GET", result.url, result.status);
      },
    }),
  ],
});

// Send what is batched now (the page is being hidden and may never come back).
export function flushTelemetry() {
  void tracerProvider.forceFlush();
  void loggerProvider.forceFlush();
}
