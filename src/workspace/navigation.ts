type Guard = () => Promise<void>;
const guards = new Set<Guard>();
export function registerNavigationGuard(guard: Guard) {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}
export async function prepareNavigation() {
  for (const guard of guards) await guard();
}
