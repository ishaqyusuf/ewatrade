import { verifyCandidateRelease } from "../scripts/release-verify"
import type { ConsumerReleaseContext } from "./toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/consumer"

export async function checkRelease(context: ConsumerReleaseContext) {
  if (context.toolkitRevision !== "bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7")
    throw new Error("Release adapter requires the pinned toolkit revision.")
  return verifyCandidateRelease(context)
}
