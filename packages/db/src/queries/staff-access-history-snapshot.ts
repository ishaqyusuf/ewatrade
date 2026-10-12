import { z } from "zod"
const id = z.string().trim().min(1).max(160)

const role = z.enum([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "CASHIER",
  "OPERATOR",
  "SUPPORT",
  "MEMBER",
])
const snapshotSchema = z.object({
  mode: z.enum(["LEGACY", "SCOPED"]).optional(),
  businessRole: role.optional(),
  membershipStatus: z
    .enum(["ACTIVE", "INVITED", "SUSPENDED", "REMOVED"])
    .optional(),
  catalogEditor: z.boolean().optional(),
  defaultStoreId: id.nullable().optional(),
  assignments: z
    .array(
      z.object({
        storeId: id,
        role: z.enum(["CASHIER", "OPERATOR", "MANAGER"]),
        status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]).optional(),
      }),
    )
    .max(100)
    .optional(),
})
/** Only allowlisted historical fields; private JSON and foreign Store IDs never escape. */
export function projectStaffAccessSnapshot(
  value: unknown,
  stores: ReadonlyMap<string, string>,
) {
  if (value === null || value === undefined)
    return { coverage: "not_recorded" as const }
  const parsed = snapshotSchema.safeParse(value)
  if (!parsed.success || !Object.keys(parsed.data).length)
    return { coverage: "unavailable" as const }
  const input = parsed.data
  const assignments = input.assignments
    ?.filter((a) => stores.has(a.storeId))
    .map((a) => ({
      storeId: a.storeId,
      storeName: stores.get(a.storeId)!,
      role: a.role,
      status: a.status ?? null,
    }))
  const hiddenStores =
    (input.assignments?.length ?? 0) -
    (assignments?.length ?? 0) +
    (input.defaultStoreId && !stores.has(input.defaultStoreId) ? 1 : 0)
  return {
    coverage: hiddenStores ? ("partial" as const) : ("available" as const),
    mode: input.mode ?? null,
    businessRole: input.businessRole ?? null,
    membershipStatus: input.membershipStatus ?? null,
    catalogEditor: input.catalogEditor ?? null,
    defaultStore:
      input.defaultStoreId && stores.has(input.defaultStoreId)
        ? { id: input.defaultStoreId, name: stores.get(input.defaultStoreId)! }
        : null,
    assignments: assignments ?? null,
    hiddenStoreReferences: hiddenStores,
  }
}
