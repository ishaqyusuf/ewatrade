import { prisma } from "@ewatrade/db/client"
import {
  createTenantObjectEraser,
  defaultTenantErasurePorts,
} from "@ewatrade/private-media/tenant-object-erasure"
import { task } from "@trigger.dev/sdk/v3"
import { runTenantPhotoErasureTick } from "../handlers/tenant-photo-erasure"

export const tenantPhotoErasure = task({
  id: "tenant.photo.erasure",
  maxDuration: 600,
  queue: { concurrencyLimit: 1 },
  run: async () => {
    // Explicit per-environment rollout; runs only exist after an operator
    // starts one under an approved Tenant deletion authority.
    if (process.env.TENANT_PHOTO_ERASURE_ENABLED !== "true")
      return { enabled: false }
    const result = await runTenantPhotoErasureTick({
      db: prisma,
      erase: createTenantObjectEraser(defaultTenantErasurePorts()),
      deadline: Date.now() + 480_000,
    })
    return { enabled: true, ...result }
  },
})
