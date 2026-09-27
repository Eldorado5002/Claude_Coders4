// Vitest stand-in for vite-plugin-pwa's virtual module (it only exists inside a real Vite build).
export function useRegisterSW() {
  const noop = () => {}
  return {
    needRefresh: [false, noop] as const,
    offlineReady: [false, noop] as const,
    updateServiceWorker: async () => {},
  }
}
