"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  createStudioRuntime,
  type StudioRuntime,
  type StudioRuntimeOptions,
} from "./runtime";
// Only retirement completions are shared, never sources/projects/controllers.
// A noncancellable decoder keeps its reservation until cleanup settles. New
// mounts remain responsive but cannot admit source allocation before that point.
let retirement: Promise<void> = Promise.resolve();
function reportCleanup(reason: unknown) {
  if (typeof globalThis.reportError === "function")
    globalThis.reportError(reason);
  else console.error("Studio resource cleanup failed", reason);
}
/** Initial options are mount configuration. Controller/service construction is
 * confined to committed effects, including each StrictMode setup. */
export function useStudio(
  options: StudioRuntimeOptions & {
    onCleanupError?: (reason: unknown) => void;
  } = {},
) {
  const [host] = useState(() => {
    let runtime: StudioRuntime | null = null;
    const listeners = new Set<() => void>();
    return {
      get runtime() {
        return runtime;
      },
      replace(value: StudioRuntime | null) {
        runtime = value;
        for (const listener of listeners) listener();
      },
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getSnapshot: () => runtime?.getSnapshot() ?? null,
    };
  });
  const [configuration] = useState(() => options);
  useEffect(() => {
    const runtime = createStudioRuntime({
      ...configuration,
      sourceAdmission: Promise.all([
        retirement,
        configuration.sourceAdmission,
      ]).then(() => {}),
    });
    const unsubscribe = runtime.subscribe(() => host.replace(runtime));
    host.replace(runtime);
    return () => {
      unsubscribe();
      host.replace(null);
      const completion = runtime.dispose();
      // Observe/report failures once; failed cleanup must not poison all future
      // source admission after this owner has released its local reservations.
      retirement = Promise.all([
        retirement,
        completion.catch((reason) => {
          (configuration.onCleanupError ?? reportCleanup)(reason);
        }),
      ]).then(() => {});
    };
  }, [configuration, host]);
  const snapshot = useSyncExternalStore(
    host.subscribe,
    host.getSnapshot,
    () => null,
  );
  return { snapshot, runtime: host.runtime };
}
