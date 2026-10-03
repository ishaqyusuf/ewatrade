import { verifyCandidateRelease } from "../scripts/release-verify"
import type { ConsumerReleaseContext } from "./toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/consumer"

export async function checkRelease(context: ConsumerReleaseContext) {
  if (context.toolkitRevision !== "fef51031b8964dcd8043ee5d6a7558e482e7055d")
    throw new Error("Release adapter requires the pinned toolkit revision.")
  return verifyCandidateRelease(context)
}
