/// <reference lib="webworker" />
import { createCharacterEngine } from "./wasm-character";
import { createWorkerRuntime } from "./worker-runtime";
import { RenderError } from "./protocol";

const scope = self as DedicatedWorkerGlobalScope;
const runtime = createWorkerRuntime({
  async createEngine(memoryBudgetBytes) {
    try {
      const response = await fetch("/wasm/asciimorph_engine.wasm");
      if (!response.ok)
        throw new Error(`WASM download failed (${response.status})`);
      return await createCharacterEngine(await response.arrayBuffer(), {
        memoryBudgetBytes,
      });
    } catch (cause) {
      if (cause instanceof RenderError) throw cause;
      throw new RenderError(
        "CapabilityUnavailable",
        cause instanceof Error ? cause.message : "WASM unavailable",
      );
    }
  },
  postMessage(message, transfer = []) {
    scope.postMessage(message, transfer);
  },
});
scope.addEventListener("message", (event) => runtime.receive(event.data));
