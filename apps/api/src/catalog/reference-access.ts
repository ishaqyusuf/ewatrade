import { canOperatePos, normalizeRole } from "@ewatrade/auth/roles"
import { TRPCError } from "@trpc/server"

export function assertCanReadCatalog(role: string) {
  const normalized = normalizeRole(role)
  if (!normalized || !canOperatePos(normalized))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to view the Catalog.",
    })
}
