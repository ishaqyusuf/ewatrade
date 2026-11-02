import type { PrismaClient } from "@ewatrade/db"
import {
  claimTenantPhotoErasureObject,
  finishTenantPhotoErasureObject,
  listActiveTenantPhotoErasureRuns,
  stepTenantPhotoErasureRun,
} from "@ewatrade/db/tenant-photo-erasure"
import type {
  TenantErasureResult,
  TenantErasureTarget,
} from "@ewatrade/private-media/tenant-object-erasure"

// One hourly run keeps provider calls and DB steps bounded per tick.
const MAX_DELETES = 100
const MAX_STEPS_PER_RUN = 60

type Steps = {
  listActive: typeof listActiveTenantPhotoErasureRuns
  step: typeof stepTenantPhotoErasureRun
  claim: typeof claimTenantPhotoErasureObject
  finish: typeof finishTenantPhotoErasureObject
}

const defaultSteps: Steps = {
  listActive: listActiveTenantPhotoErasureRuns,
  step: stepTenantPhotoErasureRun,
  claim: claimTenantPhotoErasureObject,
  finish: finishTenantPhotoErasureObject,
}

async function advanceRuns(
  db: PrismaClient,
  steps: Steps,
  beforeDeadline: () => boolean,
) {
  let stepped = 0
  for (const run of await steps.listActive(db)) {
    for (
      let index = 0;
      index < MAX_STEPS_PER_RUN && beforeDeadline();
      index++
    ) {
      const result = await steps.step(db, run.id)
      if (!result.progressed) break
      stepped++
    }
  }
  return stepped
}

/**
 * Advance inventory/verification, delete due objects, then advance again so a
 * drained run moves to verification in the same tick. Provider calls never run
 * inside a DB transaction; the eraser returns codes, never provider errors.
 */
export async function runTenantPhotoErasureTick(input: {
  db: PrismaClient
  erase: (target: TenantErasureTarget) => Promise<TenantErasureResult>
  deadline: number
  now?: () => number
  steps?: Steps
}) {
  const steps = input.steps ?? defaultSteps
  const now = input.now ?? Date.now
  const beforeDeadline = () => now() < input.deadline
  let stepped = await advanceRuns(input.db, steps, beforeDeadline)
  let deleted = 0
  let failed = 0
  for (let index = 0; index < MAX_DELETES && beforeDeadline(); index++) {
    const claim = await steps.claim(input.db)
    if (!claim) break
    const result = await input.erase(claim.target)
    const finished = await steps.finish(input.db, claim, result)
    if (finished.state === "DELETED") deleted++
    else failed++
  }
  stepped += await advanceRuns(input.db, steps, beforeDeadline)
  return { stepped, deleted, failed }
}
