const HOOK_LIFECYCLE = Object.freeze({
  UserPromptSubmit: "working",
  PostToolUse: "working",
  PermissionRequest: "needs_input",
  Stop: "stopped",
});

const ACTIVE_LIFECYCLE_PRIORITY = Object.freeze(["needs_input", "working"]);
export const DEFAULT_HOOK_SESSION_STALE_MS = 6 * 60 * 60 * 1_000;

export function normalizeCodexHookEvent(payload) {
  if (!payload || typeof payload !== "object") return null;
  const lifecycle = HOOK_LIFECYCLE[payload.hook_event_name];
  if (!lifecycle) return null;
  if (typeof payload.session_id !== "string" || payload.session_id.length === 0) return null;
  return {
    lifecycle,
    sessionId: payload.session_id,
    turnId: typeof payload.turn_id === "string" ? payload.turn_id : null,
  };
}

export function createHookLifecycleAggregator({
  now = Date.now,
  staleAfterMs = DEFAULT_HOOK_SESSION_STALE_MS,
  onLifecycleChange = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const sessions = new Map();
  let expiryTimer = null;
  let currentLifecycle = "stopped";

  function removeStale(timestamp) {
    for (const [sessionId, state] of sessions) {
      if (timestamp - state.updatedAt >= staleAfterMs) sessions.delete(sessionId);
    }
  }

  function deriveLifecycle() {
    const active = [...sessions.values()].map((state) => state.lifecycle);
    return ACTIVE_LIFECYCLE_PRIORITY.find((candidate) => active.includes(candidate))
      ?? "stopped";
  }

  function scheduleExpiry() {
    if (expiryTimer !== null) clearTimer(expiryTimer);
    expiryTimer = null;
    if (sessions.size === 0) return;
    const oldest = Math.min(...[...sessions.values()].map((state) => state.updatedAt));
    const delay = Math.max(1, oldest + staleAfterMs - now());
    expiryTimer = setTimer(() => {
      expiryTimer = null;
      removeStale(now());
      const lifecycle = deriveLifecycle();
      if (lifecycle !== currentLifecycle) {
        currentLifecycle = lifecycle;
        onLifecycleChange(lifecycle);
      }
      scheduleExpiry();
    }, delay);
  }

  function aggregate(event) {
    if (!event || typeof event.sessionId !== "string") {
      throw new TypeError("A normalized hook event with sessionId is required");
    }
    const timestamp = now();
    removeStale(timestamp);
    sessions.set(event.sessionId, { lifecycle: event.lifecycle, updatedAt: timestamp });
    const lifecycle = deriveLifecycle();
    if (event.lifecycle === "stopped") sessions.delete(event.sessionId);
    currentLifecycle = lifecycle;
    scheduleExpiry();
    return lifecycle;
  }

  aggregate.dispose = () => {
    if (expiryTimer !== null) clearTimer(expiryTimer);
    expiryTimer = null;
    sessions.clear();
  };
  return aggregate;
}

export function createJsonLineDecoder({ onRecord, onError = () => {} }) {
  if (typeof onRecord !== "function") throw new TypeError("onRecord(record) is required");
  const decoder = new TextDecoder();
  let buffer = "";

  function parse(line) {
    if (line.trim().length === 0) return;
    try {
      onRecord(JSON.parse(line));
    } catch (error) {
      onError(new SyntaxError(`Invalid hook JSONL: ${error.message}`));
    }
  }

  function write(chunk) {
    buffer += typeof chunk === "string"
      ? chunk
      : decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) parse(line.replace(/\r$/, ""));
  }

  function end() {
    buffer += decoder.decode();
    if (buffer.length > 0) parse(buffer.replace(/\r$/, ""));
    buffer = "";
  }

  return { write, end };
}
