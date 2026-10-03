import type { ExpoMobileConfig } from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/expo"

/** Shared data-only identity; importing native policy must not load the verifier graph. */
export const MOBILE_PROJECT = {
  projectId: "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b",
  owner: "cipron-startups",
  slug: "ewatrade",
} as const
export const MOBILE_TARGET: ExpoMobileConfig = {
  targetId: "mobile",
  projectId: MOBILE_PROJECT.projectId,
  appPath: "apps/mobile",
  platforms: ["android", "ios"],
  preview: { profile: "preview", channel: "preview", branch: "preview" },
  production: {
    profile: "production",
    channel: "production",
    branch: "production",
  },
}
