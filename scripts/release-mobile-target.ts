type ExpoChannelConfig = { profile: string; channel: string; branch: string }
type ExpoMobileConfig = {
  targetId: string
  projectId: string
  appPath: string
  platforms: ("android" | "ios")[]
  preview: ExpoChannelConfig
  production: ExpoChannelConfig
}

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
