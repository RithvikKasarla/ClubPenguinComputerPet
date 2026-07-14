export const PET_MODES = Object.freeze([
  "idle",
  "running",
  "needs_input",
  "ready",
  "blocked",
]);

const PRIORITY = Object.freeze({
  idle: 0,
  running: 1,
  ready: 2,
  blocked: 3,
  needs_input: 4,
});

const EVENT_MODE = Object.freeze({
  "thread.running": "running",
  "thread.needs_input": "needs_input",
  "thread.ready": "ready",
  "thread.blocked": "blocked",
});

export function createPetState() {
  return {
    mode: "idle",
    threadId: null,
    unread: false,
    updatedAt: 0,
    threads: {},
  };
}

function selectVisibleThread(threads) {
  return Object.entries(threads)
    .filter(([, thread]) => thread.mode !== "idle")
    .sort((left, right) => {
      const priority = PRIORITY[right[1].mode] - PRIORITY[left[1].mode];
      if (priority !== 0) return priority;
      const recency = right[1].updatedAt - left[1].updatedAt;
      if (recency !== 0) return recency;
      return left[0].localeCompare(right[0]);
    })[0] ?? null;
}

function aggregate(threads, fallbackUpdatedAt) {
  const selected = selectVisibleThread(threads);
  if (!selected) {
    return {
      mode: "idle",
      threadId: null,
      unread: false,
      updatedAt: fallbackUpdatedAt,
      threads,
    };
  }

  const [threadId, thread] = selected;
  return {
    mode: thread.mode,
    threadId,
    unread: thread.unread,
    updatedAt: thread.updatedAt,
    threads,
  };
}

export function reducePetState(state, event) {
  if (!state || !event || typeof event !== "object") {
    throw new TypeError("Pet state and event objects are required");
  }
  if (typeof event.threadId !== "string" || event.threadId.length === 0) {
    throw new TypeError("A non-empty threadId is required");
  }
  if (!Number.isFinite(event.at)) throw new TypeError("A finite event timestamp is required");

  const threads = { ...state.threads };
  const previous = threads[event.threadId] ?? {
    mode: "idle",
    unread: false,
    updatedAt: 0,
  };

  if (EVENT_MODE[event.type]) {
    const mode = EVENT_MODE[event.type];
    threads[event.threadId] = {
      mode,
      unread: mode === "ready",
      updatedAt: event.at,
    };
  } else if (event.type === "thread.idle") {
    threads[event.threadId] = previous.unread
      ? { ...previous, mode: "ready", updatedAt: event.at }
      : { mode: "idle", unread: false, updatedAt: event.at };
  } else if (event.type === "thread.acknowledged") {
    threads[event.threadId] = previous.mode === "ready" && previous.unread
      ? { mode: "idle", unread: false, updatedAt: event.at }
      : previous;
  } else if (event.type === "thread.removed") {
    delete threads[event.threadId];
  } else {
    throw new RangeError(`Unknown pet state event: ${event.type}`);
  }

  return aggregate(threads, event.at);
}
