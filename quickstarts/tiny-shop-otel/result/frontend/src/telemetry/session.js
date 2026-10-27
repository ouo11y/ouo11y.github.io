// The RUM session: one id for one visit, shared by every tab of the origin through localStorage.
// Same rules as ouo's SDKs (docs/specs/session-lifecycle.md): a session ends after 30 minutes
// without activity or after 4 hours, and the next signal starts a new one.
const SESSION_KEY = "tiny-shop.session";
const DEVICE_KEY = "tiny-shop.device";
const INACTIVITY_MS = 30 * 60 * 1000;
const MAX_DURATION_MS = 4 * 60 * 60 * 1000;

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked (private mode, quota): the session lives as long as the page.
  }
}

// device.id: random, one per browser profile, kept across sessions. Never a fingerprint.
export const deviceId = read(DEVICE_KEY) ?? crypto.randomUUID();
write(DEVICE_KEY, deviceId);

const listeners = [];
let current = null;
let lastWrite = 0;

// fn("start", session, previousSession | null) and fn("end", session, reason).
export function onSessionChange(fn) {
  listeners.push(fn);
}

function endReason(session, now) {
  if (now - session.lastActivity >= INACTIVITY_MS) return "inactivity";
  if (now - session.startedAt >= MAX_DURATION_MS) return "max_duration";
  return null;
}

// The current session. Starts one on first use and replaces an expired one, so call it for
// every signal: the id it returns is always valid.
export function getSession() {
  const now = Date.now();
  current = read(SESSION_KEY) ?? current; // another tab may have touched or replaced it
  if (current && !endReason(current, now)) return current;

  const previous = current;
  current = {
    id: crypto.randomUUID(),
    // Anonymous until the app knows the user; the id stays with the browser across sessions.
    userId: previous?.userId ?? crypto.randomUUID(),
    startedAt: now,
    lastActivity: now,
    replaySeq: 0,
  };
  write(SESSION_KEY, current);
  if (previous) for (const fn of listeners) fn("end", previous, endReason(previous, now));
  for (const fn of listeners) fn("start", current, previous);
  return current;
}

// A click, a key, a scroll or a request: the session is still in use.
export function touch() {
  const session = getSession();
  session.lastActivity = Date.now();
  if (session.lastActivity - lastWrite >= 1000) {
    lastWrite = session.lastActivity;
    write(SESSION_KEY, session);
  }
}

// Replay chunks are numbered per session, and a reload continues the numbering.
export function nextReplaySeq() {
  const session = getSession();
  const seq = session.replaySeq++;
  write(SESSION_KEY, session);
  return seq;
}
