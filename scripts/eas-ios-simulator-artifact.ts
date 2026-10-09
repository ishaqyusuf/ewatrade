/** Metadata must bind the requested source to this project's isolated Simulator profile. */
export function isReviewedIosPreviewSimulatorArtifact(
  build: {
    id?: string
    status?: string
    platform?: string
    buildProfile?: string
    channel?: string
    distribution?: string
    gitCommitHash?: string | null
    isForIosSimulator?: boolean
    project?: { id?: string; ownerAccount?: { name?: string } }
  },
  expected: { id: string; commit: string },
) {
  return (
    /^[a-f0-9]{40}$/.test(expected.commit) &&
    build.id === expected.id &&
    build.status === "FINISHED" &&
    build.platform === "IOS" &&
    build.isForIosSimulator === true &&
    build.buildProfile === "preview-simulator" &&
    build.channel === "preview" &&
    build.distribution === "INTERNAL" &&
    build.gitCommitHash === expected.commit &&
    build.project?.id === "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b" &&
    build.project.ownerAccount?.name === "cipron-startups"
  )
}
