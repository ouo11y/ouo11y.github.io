// The browser's OpenTelemetry setup, bundled by esbuild into public/otel.js.
// Plain OpenTelemetry JS: a tracer provider, an OTLP/HTTP exporter, and fetch instrumentation
// that adds a traceparent header to calls to our own API.
import { context, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, StackContextManager, TracerProvider } from '@opentelemetry/sdk-trace';

const provider = new TracerProvider({
  resource: resourceFromAttributes({
    'service.name': 'shop-web',
    'service.namespace': 'shop',
    'deployment.environment.name': 'blog-e2e',
  }),
  spanProcessors: [
    new BatchSpanProcessor(new OTLPTraceExporter({ url: `${window.SHOP.otlp}/v1/traces` }), {
      scheduledDelayMillis: 1000,
    }),
  ],
});
trace.setGlobalTracerProvider(provider);
context.setGlobalContextManager(new StackContextManager().enable());
propagation.setGlobalPropagator(new W3CTraceContextPropagator());

registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation({
      // A RegExp: a string here has to match the whole URL, which no API call does.
      propagateTraceHeaderCorsUrls: [new RegExp(`^${location.origin}/api/`)],
      ignoreUrls: [/\/v1\/traces$/],
    }),
  ],
});

window.otel = { trace, context, tracer: trace.getTracer('shop-web') };
