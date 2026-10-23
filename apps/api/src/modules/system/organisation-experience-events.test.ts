import { describe, expect, it, vi } from "vitest";
import { createOrganisationExperienceEvents } from "./organisation-experience-events.js";

describe("organisation experience events", () => {
  it("pushes updates only to subscribers in the same organisation", () => {
    const events = createOrganisationExperienceEvents();
    const sameOrganisation = vi.fn();
    const otherOrganisation = vi.fn();
    events.subscribe("org-a", sameOrganisation);
    events.subscribe("org-b", otherOrganisation);
    const experience = { theme: "spring", backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume: 22 } } as const;

    events.publish("org-a", experience);

    expect(sameOrganisation).toHaveBeenCalledWith(experience);
    expect(otherOrganisation).not.toHaveBeenCalled();
  });

  it("stops pushing after a subscriber disconnects", () => {
    const events = createOrganisationExperienceEvents();
    const listener = vi.fn();
    const unsubscribe = events.subscribe("org-a", listener);
    unsubscribe();

    events.publish("org-a", { theme: "winter", backgroundMusic: { enabled: false, playlistId: "auto", customUrl: "", volume: 0 } });

    expect(listener).not.toHaveBeenCalled();
  });
});
