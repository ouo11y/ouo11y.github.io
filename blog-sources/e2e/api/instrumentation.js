// Loaded before the app with `node --require ./instrumentation.js server.js`.
// Everything else (exporters, endpoint, service name, semconv opt-in) comes from OTEL_* variables.
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

const sdk = new NodeSDK({
  instrumentations: [
    getNodeAutoInstrumentations({
      // Noise for this demo: one span per file read and per DNS lookup.
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      // Express 5 routes through the `router` package; express spans already cover it.
      '@opentelemetry/instrumentation-router': { enabled: false },
      // Do not trace the browser's requests for static files.
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (req) => !req.url.startsWith('/api/'),
      },
    }),
  ],
});
sdk.start();
process.on('SIGTERM', () => sdk.shutdown().finally(() => process.exit(0)));
