import type { OrganisationExperienceView } from "@e4s/contracts";

type Listener = (experience: OrganisationExperienceView) => void;

export function createOrganisationExperienceEvents() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    subscribe(organisationId: string, listener: Listener) {
      const organisationListeners = listeners.get(organisationId) ?? new Set<Listener>();
      organisationListeners.add(listener);
      listeners.set(organisationId, organisationListeners);
      return () => {
        organisationListeners.delete(listener);
        if (organisationListeners.size === 0) listeners.delete(organisationId);
      };
    },
    publish(organisationId: string, experience: OrganisationExperienceView) {
      for (const listener of listeners.get(organisationId) ?? []) listener(experience);
    }
  };
}
