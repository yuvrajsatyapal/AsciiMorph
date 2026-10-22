export interface MacrotaskScheduler {
  schedule(callback: () => void): () => void;
  dispose(): void;
}
/** Each callback has a unique token so a cancelled posted turn cannot run a successor. */
export function createMessageChannelScheduler(): MacrotaskScheduler {
  const channel = new MessageChannel(),
    callbacks = new Map<number, () => void>();
  let next = 1,
    disposed = false;
  channel.port1.onmessage = (event: MessageEvent<number>) => {
    const callback = callbacks.get(event.data);
    callbacks.delete(event.data);
    if (!disposed) callback?.();
  };
  return {
    schedule(callback) {
      if (disposed) return () => {};
      const id = next++;
      callbacks.set(id, callback);
      channel.port2.postMessage(id);
      return () => {
        callbacks.delete(id);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      callbacks.clear();
      channel.port1.onmessage = null;
      channel.port1.close();
      channel.port2.close();
    },
  };
}
/** Deterministic timer adapter for injected runtimes/tests. Production workers inject channels. */
export function createTimerScheduler(): MacrotaskScheduler {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let disposed = false;
  return {
    schedule(callback) {
      if (disposed) return () => {};
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!disposed) callback();
      }, 0);
      timers.add(timer);
      return () => {
        clearTimeout(timer);
        timers.delete(timer);
      };
    },
    dispose() {
      disposed = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}
