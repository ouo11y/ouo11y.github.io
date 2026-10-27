// RUM events as OpenTelemetry log records. ouo reads them by event.name
// (session.start, exception, http.request.failed, navigation, web_vital); any other name is a
// custom event on the session timeline. The body is a one-line summary for the Loki log line;
// ouo itself reads only the attributes.
import { logs, SeverityNumber } from "@opentelemetry/api";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import { setFailedFetchHandler } from "./otel.js";
import { deviceId, getSession, onSessionChange } from "./session.js";

const logger = logs.getLogger("tiny-shop-rum");

export function emit(name, attributes = {}, { severity = "INFO", session = getSession(), body = name } = {}) {
  logger.emit({
    eventName: name,
    severityNumber: SeverityNumber[severity],
    severityText: severity,
    body,
    attributes: { "event.name": name, "session.id": session.id, "user.id": session.userId, ...attributes },
  });
}

// A custom event, e.g. addEvent("cart.added", { "product.id": 1 }).
export function addEvent(name, attributes = {}) {
  emit(name, attributes, { body: `${name} ${JSON.stringify(attributes)}` });
}

// session.start and session.end, with the ids of the session they are about.
onSessionChange((type, session, detail) => {
  if (type === "start") {
    emit(
      "session.start",
      {
        "ouo.session.started_at": session.startedAt,
        "device.id": deviceId,
        ...(detail ? { "session.previous_id": detail.id } : {}),
      },
      { session, body: `session.start ${session.id}` },
    );
  } else {
    emit(
      "session.end",
      {
        "ouo.session.end_reason": detail,
        "ouo.session.duration_ms": session.lastActivity - session.startedAt,
        "device.id": deviceId,
      },
      { session, body: `session.end ${session.id} (${detail})` },
    );
  }
});

// Uncaught errors and unhandled rejections. fatal = true marks the session "crashed"; the
// page keeps running, so the session goes on.
export function captureErrors() {
  const report = (error) => {
    const err = error instanceof Error ? error : new Error(String(error));
    emit(
      "exception",
      {
        "exception.type": err.name,
        "exception.message": err.message,
        "exception.stacktrace": err.stack ?? "",
        "ouo.exception.fatal": true,
        "ouo.exception.handled": false,
      },
      { severity: "ERROR", body: `${err.name}: ${err.message}` },
    );
  };
  addEventListener("error", (event) => report(event.error ?? event.message));
  addEventListener("unhandledrejection", (event) => report(event.reason));
}

// A 4xx or 5xx answer marks the session "errored". The fetch span has the details.
setFailedFetchHandler((method, url, status) => {
  emit(
    "http.request.failed",
    { "http.request.method": method, "url.full": url, "http.response.status_code": status },
    { severity: "WARN", body: `${method} ${url} ${status}` },
  );
});

// Page views: the first load and every client-side route change.
export function trackNavigation() {
  let from = document.referrer ? new URL(document.referrer).pathname : "";
  const report = () => {
    if (location.pathname === from) return;
    emit(
      "navigation",
      { "url.path": location.pathname, "ouo.navigation.from": from },
      { body: `navigation ${from || "(entry)"} -> ${location.pathname}` },
    );
    from = location.pathname;
  };
  report();
  const pushState = history.pushState;
  history.pushState = function (...args) {
    pushState.apply(this, args);
    report();
  };
  addEventListener("popstate", report);
}

// Core Web Vitals from Google's web-vitals library. Most are final only when the page is hidden.
export function trackWebVitals() {
  // CLS has no unit; the others are milliseconds.
  const shown = (metric) => (metric.name === "CLS" ? metric.value.toFixed(3) : `${Math.round(metric.value)} ms`);
  const report = (metric) =>
    emit(
      "web_vital",
      {
        "ouo.web_vital.name": metric.name,
        "ouo.web_vital.value": metric.value,
        "ouo.web_vital.rating": metric.rating,
      },
      { body: `${metric.name} ${shown(metric)} ${metric.rating}` },
    );
  onCLS(report);
  onFCP(report);
  onINP(report);
  onLCP(report);
  onTTFB(report);
}
