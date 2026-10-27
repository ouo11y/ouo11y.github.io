// Where the telemetry goes and who this app is. Moved ports? Override in .env.local.

// The tiny-shop API (backend/).
export const API = import.meta.env.VITE_API_URL || "http://localhost:5001";

// The ouo collector: OTLP/HTTP for spans and logs, and the replay receiver for rrweb chunks.
export const OTLP_ENDPOINT = import.meta.env.VITE_OTLP_ENDPOINT || "http://localhost:4318";
export const REPLAY_ENDPOINT = import.meta.env.VITE_REPLAY_ENDPOINT || "http://localhost:4319";

// Every request to the collector carries the project credential:
// Basic base64("<project id>:<project token>"). The token is public by design: it ships in the bundle.
export const AUTHORIZATION = `Basic ${btoa("demo:pt_dev_demo_0000000000000000")}`;

export const SERVICE = {
  name: "tiny-shop-otel-frontend",
  version: "1.0.0",
  environment: "local",
};
