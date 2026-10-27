// Session replay: rrweb records the page, and the events go to ouo in chunks
// (docs/adr/0003-replay-model.md): { session_id, seq, started_at, ended_at, events },
// POST /v1/replay/chunks on the collector's replay port, every 5 s or at 256 KB.
import { record } from "rrweb";
import { AUTHORIZATION, REPLAY_ENDPOINT } from "./config.js";
import { getSession, nextReplaySeq, onSessionChange } from "./session.js";

const FLUSH_INTERVAL_MS = 5000;
const MAX_CHUNK_BYTES = 256 * 1024;
const KEEPALIVE_MAX_BYTES = 60 * 1024; // browsers cap keepalive request bodies at 64 KiB in total

let buffer = [];
let bufferBytes = 0;
let chunk = null; // { session_id, seq, started_at } of the events in the buffer
let timer = null;

function push(event) {
  if (buffer.length === 0) {
    // The chunk belongs to the session that was current when its first event happened.
    chunk = { session_id: getSession().id, seq: nextReplaySeq(), started_at: event.timestamp };
    timer = setTimeout(flushReplay, FLUSH_INTERVAL_MS);
  }
  buffer.push(event);
  bufferBytes += JSON.stringify(event).length;
  if (bufferBytes >= MAX_CHUNK_BYTES) flushReplay();
}

// Sends the buffered events as one chunk. pageHidden: the page may be gone after this.
export function flushReplay(pageHidden = false) {
  if (buffer.length === 0) return;
  clearTimeout(timer);
  const body = JSON.stringify({ ...chunk, ended_at: buffer[buffer.length - 1].timestamp, events: buffer });
  const headers = {
    "content-type": "application/json",
    Authorization: AUTHORIZATION,
    "x-ouo-session-id": chunk.session_id,
    "x-ouo-seq": String(chunk.seq),
  };
  buffer = [];
  bufferBytes = 0;
  fetch(`${REPLAY_ENDPOINT}/v1/replay/chunks`, {
    method: "POST",
    headers,
    body,
    // keepalive lets the request outlive the page, but only for small bodies.
    keepalive: pageHidden && body.length < KEEPALIVE_MAX_BYTES,
  }).catch((err) => console.warn("[replay] chunk upload failed", err));
}

export function startReplay() {
  record({
    emit: push,
    maskAllInputs: true, // what users type never leaves the browser
    blockClass: "ouo-block", // elements with this class are recorded as an empty box
    maskTextClass: "ouo-mask", // text inside elements with this class is masked
    checkoutEveryNms: 5 * 60 * 1000, // a full snapshot every 5 minutes keeps seeking fast
  });
  // A new session needs its own full snapshot: send the old session's events first.
  onSessionChange((type, session, previous) => {
    if (type !== "start" || !previous) return;
    flushReplay(document.visibilityState === "hidden");
    record.takeFullSnapshot();
  });
}
