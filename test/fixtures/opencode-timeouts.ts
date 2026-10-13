// Test-only defaults: explicit zero settings win; bypassed dispatchers time out.
import { createRequire } from "node:module";

const undici = createRequire(import.meta.url)("undici");
const { Agent, fetch } = undici;
undici.Agent = class extends Agent {
  constructor(options = {}) {
    super({ headersTimeout: 100, bodyTimeout: process.env.STUB_MODE === "delay-headers" ? 1000 : 100, ...options });
  }
};
undici.setGlobalDispatcher(new undici.Agent());

// Controls run the real adapter with the same preload, using default clients.
const control = process.env.TEST_OPENCODE_FETCH;
if (control) {
  undici.fetch = (input: URL, options: Record<string, unknown>) => {
    const { dispatcher, ...rest } = options;
    if (control === "global") return globalThis.fetch(input, rest);
    return fetch(input, control === "agent" ? { ...rest, dispatcher: new undici.Agent() } : rest);
  };
}
