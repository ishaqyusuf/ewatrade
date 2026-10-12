import { createHash } from "node:crypto"
import { z } from "zod"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"

const id = z.string().trim().min(1).max(160)
const filters = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  role: z
    .enum([
      "OWNER",
      "ADMIN",
      "MANAGER",
      "CASHIER",
      "OPERATOR",
      "SUPPORT",
      "MEMBER",
    ])
    .optional(),
  status: z.enum(["ACTIVE", "INVITED", "SUSPENDED", "REMOVED"]).optional(),
  assignmentStoreId: id.optional(),
})
export const staffDirectoryPageInput = filters
  .extend({
    cursor: z.string().min(1).max(1024).optional(),
    limit: z.number().int().min(1).max(100).default(25),
  })
  .strict()
export const staffDirectoryMemberInput = z.object({ membershipId: id }).strict()
type Scope = { tenantId: string; actorUserId: string }
export type StaffDirectoryPageInput = z.infer<typeof staffDirectoryPageInput> &
  Scope

export class StaffDirectoryError extends Error {
  constructor(
    public readonly code: "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST",
    message: string,
  ) {
    super(message)
    this.name = "StaffDirectoryError"
  }
}

export async function assertStaffDirectoryAuthority(
  tx: Prisma.TransactionClient,
  input: Scope,
) {
  const actor = await tx.membership.findFirst({
    where: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      status: "ACTIVE",
      tenant: { isActive: true },
    },
    select: { role: true, staffAccessMode: true },
  })
  if (
    !actor ||
    !(
      actor.role === "OWNER" ||
      actor.role === "ADMIN" ||
      (actor.role === "MANAGER" && actor.staffAccessMode === "LEGACY")
    )
  )
    throw new StaffDirectoryError(
      "FORBIDDEN",
      "Current business staff-management access is required.",
    )
}

const memberSelect = {
  id: true,
  tenantId: true,
  userId: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  invitedAt: true,
  acceptedAt: true,
  user: { select: { id: true, name: true, displayName: true, email: true } },
  retailOpsStaffProfile: {
    select: { tenantId: true, userId: true, displayName: true },
  },
} satisfies Prisma.MembershipSelect
type Member = Prisma.MembershipGetPayload<{ select: typeof memberSelect }>

function projectMember(member: Member) {
  const profile = member.retailOpsStaffProfile
  const validProfile =
    profile?.tenantId === member.tenantId && profile.userId === member.userId
  return {
    membershipId: member.id,
    userId: member.userId,
    name:
      (validProfile && profile.displayName) ||
      member.user.displayName ||
      member.user.name,
    email: member.user.email,
    role: member.role,
    status: member.status,
    invitedAt: member.invitedAt,
    acceptedAt: member.acceptedAt,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
    profileCoverage: validProfile
      ? ("available" as const)
      : ("unavailable" as const),
  }
}

function filterKey(input: StaffDirectoryPageInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        tenantId: input.tenantId,
        search: input.search ?? null,
        role: input.role ?? null,
        status: input.status ?? null,
        assignmentStoreId: input.assignmentStoreId ?? null,
      }),
    )
    .digest("hex")
}
const cursorSchema = z.object({ id, filterKey: z.string().length(64) }).strict()
function decodeCursor(cursor: string | undefined, expectedKey: string) {
  if (!cursor) return undefined
  try {
    const value = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    )
    if (value.filterKey !== expectedKey)
      throw Error("Changed directory filters")
    return value.id
  } catch {
    throw new StaffDirectoryError(
      "BAD_REQUEST",
      "Continue with the original staff directory filters and cursor.",
    )
  }
}

/** Caller owns the transaction; pagination/count and authority use that same snapshot. */
export async function listStaffDirectoryPageInTransaction(
  tx: Prisma.TransactionClient,
  input: StaffDirectoryPageInput,
) {
  const parsed = staffDirectoryPageInput.parse({
    search: input.search,
    role: input.role,
    status: input.status,
    assignmentStoreId: input.assignmentStoreId,
    cursor: input.cursor,
    limit: input.limit,
  })
  const scope = { ...input, ...parsed }
  const key = filterKey(scope),
    afterId = decodeCursor(parsed.cursor, key)
  const where: Prisma.MembershipWhereInput = {
    tenantId: input.tenantId,
    role: parsed.role,
    status: parsed.status,
    ...(parsed.assignmentStoreId
      ? {
          staffStoreAssignments: {
            some: {
              tenantId: input.tenantId,
              storeId: parsed.assignmentStoreId,
              status: "ACTIVE",
            },
          },
        }
      : {}),
    ...(parsed.search
      ? {
          OR: [
            {
              user: { name: { contains: parsed.search, mode: "insensitive" } },
            },
            {
              user: {
                displayName: { contains: parsed.search, mode: "insensitive" },
              },
            },
            {
              user: { email: { contains: parsed.search, mode: "insensitive" } },
            },
            {
              retailOpsStaffProfile: {
                tenantId: input.tenantId,
                displayName: { contains: parsed.search, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  }
  await assertStaffDirectoryAuthority(tx, input)
  if (
    parsed.assignmentStoreId &&
    !(await tx.store.findFirst({
      where: {
        id: parsed.assignmentStoreId,
        tenantId: input.tenantId,
        status: "ACTIVE",
      },
      select: { id: true },
    }))
  )
    throw new StaffDirectoryError(
      "NOT_FOUND",
      "Store not found for this business.",
    )
  const [rows, total] = await Promise.all([
    tx.membership.findMany({
      where: afterId ? { AND: [where, { id: { gt: afterId } }] } : where,
      orderBy: { id: "asc" },
      take: parsed.limit + 1,
      select: memberSelect,
    }),
    tx.membership.count({ where }),
  ])
  const data = rows.slice(0, parsed.limit).map(projectMember),
    last = data.at(-1)
  return {
    data,
    total,
    nextCursor:
      rows.length > parsed.limit && last
        ? Buffer.from(
            JSON.stringify({ id: last.membershipId, filterKey: key }),
          ).toString("base64url")
        : null,
    scope: parsed.assignmentStoreId
      ? ("active_store_assignments" as const)
      : ("tenant_memberships" as const),
    assignmentStoreId: parsed.assignmentStoreId ?? null,
    asOf: new Date().toISOString(),
    coverage: {
      directory: "current_memberships" as const,
      profile: data.some((member) => member.profileCoverage === "unavailable")
        ? ("partial" as const)
        : ("available" as const),
      history: "not_read" as const,
    },
  }
}

export async function getStaffDirectoryMemberInTransaction(
  tx: Prisma.TransactionClient,
  input: Scope & z.infer<typeof staffDirectoryMemberInput>,
) {
  const parsed = staffDirectoryMemberInput.parse({
    membershipId: input.membershipId,
  })
  await assertStaffDirectoryAuthority(tx, input)
  const member = await tx.membership.findFirst({
    where: { id: parsed.membershipId, tenantId: input.tenantId },
    select: memberSelect,
  })
  if (!member)
    throw new StaffDirectoryError(
      "NOT_FOUND",
      "Staff membership not found for this business.",
    )
  return {
    ...projectMember(member),
    scope: "tenant_membership" as const,
    historyCoverage: "not_read" as const,
  }
}

export async function listStaffDirectoryPage(
  db: PrismaClient,
  input: StaffDirectoryPageInput,
) {
  return db.$transaction(
    (tx) => listStaffDirectoryPageInTransaction(tx, input),
    {
      isolationLevel: "RepeatableRead",
      maxWait: 10_000,
      timeout: 30_000,
    },
  )
}
export async function getStaffDirectoryMember(
  db: PrismaClient,
  input: Scope & z.infer<typeof staffDirectoryMemberInput>,
) {
  return db.$transaction(
    (tx) => getStaffDirectoryMemberInTransaction(tx, input),
    {
      isolationLevel: "RepeatableRead",
      maxWait: 10_000,
      timeout: 30_000,
    },
  )
}
