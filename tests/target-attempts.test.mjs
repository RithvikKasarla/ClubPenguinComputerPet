import assert from "node:assert/strict";
import { test } from "node:test";

import { createLatestTargetAttemptGate } from "../src/target-attempts.mjs";

test("a delayed failure from target A cannot affect newly selected target B", () => {
  const attempts = createLatestTargetAttemptGate();
  const targetA = attempts.begin();
  const targetB = attempts.begin();

  assert.equal(attempts.isCurrent(targetA), false);
  assert.equal(attempts.isCurrent(targetB), true);
});

test("a superseding desktop command invalidates the selected target callback", () => {
  const attempts = createLatestTargetAttemptGate();
  const target = attempts.begin();
  attempts.invalidate();

  assert.equal(attempts.isCurrent(target), false);
});
