// RUM without the ouo SDK: OpenTelemetry + rrweb + web-vitals. Import this first, before React.
import { captureErrors, trackNavigation, trackWebVitals } from "./events.js";
import { flushTelemetry } from "./otel.js";
import { flushReplay, startReplay } from "./replay.js";
import { getSession, touch } from "./session.js";

getSession(); // resume the session, or start one (session.start)
captureErrors();
trackNavigation();
trackWebVitals();
startReplay();

// User activity keeps the session alive.
for (const type of ["click", "keydown", "scroll", "touchstart"]) {
  addEventListener(type, touch, { capture: true, passive: true });
}

// The tab is hidden: it may be closed next, so send everything now.
addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "hidden") return;
  flushReplay(true);
  flushTelemetry();
});

console.log("[telemetry] session", getSession().id);

export { API } from "./config.js";
export { addEvent } from "./events.js";
