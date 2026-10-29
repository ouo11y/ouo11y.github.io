import { startBrowserSdk } from '@opentelemetry/browser-sdk';
import {
  createDefaultSessionIdGenerator,
  createLocalStorageSessionStore,
  createSessionLogRecordProcessor,
  createSessionManager,
  createSessionSpanProcessor,
} from '@opentelemetry/browser-sdk/session';
import { ErrorsInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/errors';
import { FetchInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/fetch';
import { NavigationTimingInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/navigation-timing';
import { UserActionInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/user-action';
import { WebVitalsInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/web-vitals';

const COLLECTOR = 'http://localhost:14318';

// A session id in localStorage, stamped as session.id on every span and log record.
const sessionManager = createSessionManager({
  sessionIdGenerator: createDefaultSessionIdGenerator(),
  sessionStore: createLocalStorageSessionStore(),
  inactivityTimeout: 30 * 60, // seconds
  maxDuration: 4 * 60 * 60, // seconds
});
await sessionManager.start();

export const sdk = startBrowserSdk({
  serviceName: 'otel-browser-oct-2026',
  serviceVersion: '1.0.0',
  // Session processors run first, so the export processor sees session.id.
  // With processors set, give each signal its full export URL.
  logs: {
    processors: [createSessionLogRecordProcessor(sessionManager)],
    exportConfig: { url: `${COLLECTOR}/v1/logs` },
  },
  traces: {
    processors: [createSessionSpanProcessor(sessionManager)],
    exportConfig: { url: `${COLLECTOR}/v1/traces` },
  },
  instrumentations: [
    new FetchInstrumentation(),
    new ErrorsInstrumentation(),
    new UserActionInstrumentation(),
    new NavigationTimingInstrumentation(),
    new WebVitalsInstrumentation({ reportAllChanges: true }),
  ],
});
