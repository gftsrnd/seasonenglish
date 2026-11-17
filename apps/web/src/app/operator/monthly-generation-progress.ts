import { useSyncExternalStore } from "react";

type Target = number | "final";
const jobs = new Map<string, Target>();
const listeners = new Set<() => void>();
let revision = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useMonthlyGeneration(frameworkId?: string) {
  return useSyncExternalStore(subscribe, () => frameworkId ? jobs.get(frameworkId) : undefined);
}

export function useMonthlyGenerationRevision() {
  return useSyncExternalStore(subscribe, () => revision);
}

export function beginMonthlyGeneration(frameworkId: string, target: Target) {
  if (jobs.has(frameworkId)) return;
  jobs.set(frameworkId, target);
  listeners.forEach(listener => listener());
  return () => {
    jobs.delete(frameworkId);
    revision += 1;
    listeners.forEach(listener => listener());
  };
}
