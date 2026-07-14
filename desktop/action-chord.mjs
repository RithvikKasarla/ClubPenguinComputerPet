export function createActionChordController({
  mapping,
  register,
  unregister,
  onAction,
  onChange = () => {},
  timeoutMs = 2_500,
  clock = {
    later: (callback, delay) => setTimeout(callback, delay),
    cancel: (id) => clearTimeout(id),
  },
} = {}) {
  if (!mapping || typeof mapping !== "object") throw new TypeError("mapping is required");
  if (typeof register !== "function") throw new TypeError("register is required");
  if (typeof unregister !== "function") throw new TypeError("unregister is required");
  if (typeof onAction !== "function") throw new TypeError("onAction is required");

  let armed = false;
  let timer = null;
  let registeredKeys = [];

  function disarm() {
    if (timer !== null) clock.cancel(timer);
    timer = null;
    for (const key of registeredKeys) unregister(key);
    registeredKeys = [];
    if (armed) {
      armed = false;
      onChange(false, Object.keys(mapping));
    }
  }

  function arm() {
    disarm();
    armed = true;
    for (const [key, action] of Object.entries(mapping)) {
      const didRegister = register(key, () => {
        disarm();
        onAction(action);
      });
      if (didRegister) registeredKeys.push(key);
    }
    onChange(true, [...registeredKeys]);
    timer = clock.later(disarm, timeoutMs);
    return registeredKeys.length;
  }

  return {
    arm,
    disarm,
    dispose: disarm,
    isArmed: () => armed,
  };
}
