const CODEX_EVENT_TO_PET_EVENT = Object.freeze({
  "turn.started": "thread.running",
  "turn.completed": "thread.ready",
  "turn.failed": "thread.blocked",
  error: "thread.blocked",
});

export function createCodexExecJsonlAdapter({ now = () => Date.now() } = {}) {
  const decoder = new TextDecoder();
  let buffer = "";
  let currentThreadId = null;
  let lineNumber = 0;

  function normalize(record) {
    if (!record || typeof record !== "object") return [];

    const recordThreadId = record.thread_id ?? record.threadId;
    if (record.type === "thread.started") {
      if (typeof recordThreadId !== "string" || recordThreadId.length === 0) {
        throw new TypeError("Codex thread.started record is missing thread_id");
      }
      currentThreadId = recordThreadId;
      return [];
    }

    let type = CODEX_EVENT_TO_PET_EVENT[record.type];
    if (record.type === "turn.completed" && record.status === "failed") {
      type = "thread.blocked";
    }
    if (!type) return [];

    const threadId = recordThreadId ?? currentThreadId;
    if (typeof threadId !== "string" || threadId.length === 0) {
      throw new RangeError(`Codex ${record.type} record arrived before thread.started`);
    }
    currentThreadId = threadId;
    return [{ type, threadId, at: now() }];
  }

  function parseLine(line) {
    lineNumber += 1;
    if (line.trim().length === 0) return [];
    try {
      return normalize(JSON.parse(line));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new SyntaxError(`Invalid Codex JSONL record on line ${lineNumber}: ${error.message}`);
      }
      throw error;
    }
  }

  function write(chunk) {
    if (typeof chunk === "string") {
      buffer += chunk;
    } else if (chunk instanceof Uint8Array) {
      buffer += decoder.decode(chunk, { stream: true });
    } else {
      throw new TypeError("Codex JSONL chunks must be strings or Uint8Array values");
    }

    const lines = buffer.split("\n");
    buffer = lines.pop();
    return lines.flatMap((line) => parseLine(line.replace(/\r$/, "")));
  }

  function end() {
    buffer += decoder.decode();
    if (buffer.trim().length === 0) return [];
    const finalLine = buffer;
    buffer = "";
    try {
      return parseLine(finalLine.replace(/\r$/, ""));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new SyntaxError(`Incomplete Codex JSONL record after line ${lineNumber - 1}`);
      }
      throw error;
    }
  }

  return { write, end };
}
