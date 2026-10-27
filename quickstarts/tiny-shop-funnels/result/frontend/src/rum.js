// ouo browser SDK init: sessions, page views and custom events (the funnel steps), errors, fetch
// tracing and session replay, so a session that dropped out of the funnel can be watched.
import { initRUM } from "@ouo11y/browser";

// The API (backend/). Moved it? VITE_API_URL in .env.local.
export const API = import.meta.env.VITE_API_URL || "http://localhost:5001";

export const rum = initRUM({
  // The ouo collector, the only thing the page talks to. Spans and events go to 4318, replay
  // chunks to 4319 (derived from `endpoint` when it uses port 4318). Moved ports? Set
  // VITE_OUO_ENDPOINT and VITE_OUO_REPLAY_ENDPOINT in .env.local.
  endpoint: import.meta.env.VITE_OUO_ENDPOINT || "http://localhost:4318",
  replayEndpoint: import.meta.env.VITE_OUO_REPLAY_ENDPOINT || undefined,
  projectId: "demo",
  projectToken: "pt_dev_demo_0000000000000000", // public by design, ships in the bundle
  service: { name: "tiny-shop-funnels-frontend", version: "1.0.0", environment: "local" },
  // Calls to the API get `traceparent` + `baggage`, so its spans join the browser's trace and the
  // replay, the click and the backend error share one trace id.
  tracing: { propagateTo: [new RegExp(`^${API}/`)] },

  // Every session is kept: a funnel counts sessions, so sampling would scale every step down.
  session: { sampleRate: 1 },
  // Replay of every session, inputs masked: open a dropped session from the funnel and watch it.
  replay: { enabled: true, sampleRate: 1, maskAllInputs: true },
  debug: false,
});
