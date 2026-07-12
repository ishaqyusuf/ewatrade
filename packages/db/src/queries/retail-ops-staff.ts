import { createHash, randomBytes } from "node:crypto"

import {
  type MembershipRole,
  type MembershipStatus,
  Prisma,
  type PrismaClient,
} from "../generated/prisma/client"
import {
  RetailOpsStaffInviteTokenStatus as DurableRetailOpsStaffInviteTokenStatus,
  RetailOpsStaffLifecycleEventType as DurableRetailOpsStaffLifecycleEventType,
} from "../generated/prisma/enums"
import { assertRetailOpsEntitlementAvailable } from "./retail-ops-subscriptions"

export type RetailOpsStaffInviteRole = "cashier" | "operator" | "manager"
export type RetailOpsStaffListRoleFilter =
  | "admin"
  | "all"
  | "cashier"
  | "manager"
  | "operator"
  | "owner"
export type RetailOpsStaffListStatusFilter =
  | "active"
  | "all"
  | "invited"
  | "suspended"

export type InviteRetailOpsStaffInput = {
  actorUserId: string
  email: string
  externalId?: string
  name?: string
  role: RetailOpsStaffInviteRole
  storeId: string
  tenantId: string
}

export type RetailOpsStaffLifecycleStatus = "active" | "suspended"

export type UpdateRetailOpsStaffStatusInput = {
  actorUserId: string
  staffUserId: string
  status: RetailOpsStaffLifecycleStatus
  tenantId: string
}

export type CompleteRetailOpsStaffOnboardingInput = {
  displayName?: string
  name?: string
  tenantSlug?: string
  userId: string
}

export type ListRetailOpsStaffInput = {
  limit?: number
  role?: RetailOpsStaffListRoleFilter
  search?: string
  status?: RetailOpsStaffListStatusFilter
  tenantId: string
}

export type InvitedRetailOpsStaff = {
  invite: {
    acceptanceToken: string | null
    id: string
    invitedAt: Date | null
    invitedByUserId: string | null
    role: string
    status: string
  }
  staff: {
    displayName: string | null
    email: string
    id: string
    name: string
  }
  notification: {
    shouldSend: boolean
  }
  storeId: string
  tenantId: string
}

export type RetailOpsStaffMember = {
  acceptedAt: Date | null
  createdAt: Date
  id: string
  invitedAt: Date | null
  invitedByUserId: string | null
  role: string
  status: string
  updatedAt: Date
  user: {
    avatarUrl: string | null
    displayName: string
    email: string
    id: string
    image: string | null
    name: string
  }
}

export type UpdatedRetailOpsStaffStatus = {
  acceptedAt: Date | null
  id: string
  previousStatus: string
  role: string
  status: string
  updatedAt: Date
  updatedByUserId: string
  user: {
    displayName: string
    email: string
    id: string
    name: string
  }
}

export type CompletedRetailOpsStaffOnboarding = {
  acceptedAt: Date | null
  id: string
  previousStatus: string
  role: string
  status: string
  tenant: {
    id: string
    name: string
    slug: string
  }
  updatedAt: Date
  user: {
    displayName: string
    email: string
    id: string
    name: string
  }
}

export type ResolvedRetailOpsStaffInvite = {
  email: string
  expiresAt: Date
  inviteTokenId: string
  membershipId: string | null
  role: string
  status: string
  tenant: {
    id: string
    name: string
    slug: string
  }
}

type RetailOpsStaffErrorCode =
  | "STAFF_INVITE_EXPIRED"
  | "STAFF_INVITE_INVALID"
  | "STAFF_ALREADY_ACTIVE"
  | "STAFF_NOT_FOUND"
  | "STAFF_SELF_UPDATE_FORBIDDEN"
  | "STAFF_STATUS_NOT_ALLOWED"
  | "STAFF_STATUS_UNCHANGED"
  | "TENANT_NOT_FOUND"

type JsonRecord = Record<string, unknown>

type RetailOpsStaffInviteMetadata = {
  externalId: string
  result: unknown
}

export class RetailOpsStaffError extends Error {
  code: RetailOpsStaffErrorCode

  constructor(code: RetailOpsStaffErrorCode, message: string) {
    super(message)
    this.name = "RetailOpsStaffError"
    this.code = code
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function normalizeExternalId(externalId: string | undefined) {
  const trimmed = externalId?.trim()

  return trimmed || undefined
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  return value as JsonRecord
}

function getStringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

function getNullableStringField(value: unknown) {
  return typeof value === "string" ? value : null
}

function getDateField(value: unknown) {
  const rawValue = getStringField(value)

  if (!rawValue) return null

  const date = new Date(rawValue)

  return Number.isNaN(date.getTime()) ? null : date
}

function getRetailOpsMetadata(metadata: unknown) {
  return asRecord(asRecord(metadata).retailOps)
}

function getStaffInvites(metadata: unknown): RetailOpsStaffInviteMetadata[] {
  const staffInvites = getRetailOpsMetadata(metadata).staffInvites

  if (!Array.isArray(staffInvites)) return []

  return staffInvites.flatMap((invite) => {
    const record = asRecord(invite)
    const externalId = getStringField(record.externalId)

    return externalId
      ? [
          {
            externalId,
            result: record.result,
          },
        ]
      : []
  })
}

function withStaffInvite(
  metadata: unknown,
  invite: RetailOpsStaffInviteMetadata,
) {
  const currentMetadata = asRecord(metadata)
  const retailOps = getRetailOpsMetadata(metadata)
  const staffInvites = getStaffInvites(metadata).filter(
    (currentInvite) => currentInvite.externalId !== invite.externalId,
  )

  return {
    ...currentMetadata,
    retailOps: {
      ...retailOps,
      staffInvites: [invite, ...staffInvites].slice(0, 250),
    },
  } as Prisma.InputJsonValue
}

function serializeInvitedStaffResult(result: InvitedRetailOpsStaff) {
  return {
    ...result,
    invite: {
      ...result.invite,
      acceptanceToken: null,
      invitedAt: result.invite.invitedAt?.toISOString() ?? null,
    },
  }
}

function deserializeInvitedStaffResult(
  result: unknown,
): InvitedRetailOpsStaff | null {
  const record = asRecord(result)
  const invite = asRecord(record.invite)
  const staff = asRecord(record.staff)
  const inviteId = getStringField(invite.id)
  const role = getStringField(invite.role)
  const status = getStringField(invite.status)
  const staffEmail = getStringField(staff.email)
  const staffId = getStringField(staff.id)
  const staffName = getStringField(staff.name)
  const storeId = getStringField(record.storeId)
  const tenantId = getStringField(record.tenantId)

  if (
    !inviteId ||
    !role ||
    !status ||
    !staffEmail ||
    !staffId ||
    !staffName ||
    !storeId ||
    !tenantId
  ) {
    return null
  }

  return {
    invite: {
      acceptanceToken: null,
      id: inviteId,
      invitedAt: getDateField(invite.invitedAt),
      invitedByUserId: getNullableStringField(invite.invitedByUserId),
      role,
      status,
    },
    notification: {
      shouldSend: false,
    },
    staff: {
      displayName: getNullableStringField(staff.displayName),
      email: staffEmail,
      id: staffId,
      name: staffName,
    },
    storeId,
    tenantId,
  }
}

function findStaffInviteReplay(metadata: unknown, externalId: string) {
  const invite = getStaffInvites(metadata).find(
    (currentInvite) => currentInvite.externalId === externalId,
  )

  return invite ? deserializeInvitedStaffResult(invite.result) : null
}

function normalizeName(name: string | undefined) {
  const trimmed = name?.trim().replace(/\s+/g, " ")

  return trimmed || undefined
}

function getFallbackName(email: string) {
  return (
    email
      .split("@")[0]
      ?.replace(/[._-]+/g, " ")
      .trim() || email
  )
}

function getDisplayName(user: {
  displayName: string | null
  email: string
  name: string
}) {
  return user.displayName || user.name || user.email
}

function mapStaffRole(role: RetailOpsStaffInviteRole): MembershipRole {
  if (role === "manager") return "MANAGER"
  if (role === "operator") return "OPERATOR"

  return "CASHIER"
}

function mapStaffListRole(
  role: RetailOpsStaffListRoleFilter | undefined,
): MembershipRole[] {
  if (role === "owner") return ["OWNER"]
  if (role === "admin") return ["ADMIN"]
  if (role === "manager") return ["MANAGER"]
  if (role === "cashier") return ["CASHIER"]
  if (role === "operator") return ["OPERATOR"]

  return ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"]
}

function mapStaffListStatus(
  status: RetailOpsStaffListStatusFilter | undefined,
): MembershipStatus[] {
  if (status === "active") return ["ACTIVE"]
  if (status === "invited") return ["INVITED"]
  if (status === "suspended") return ["SUSPENDED"]

  return ["ACTIVE", "INVITED", "SUSPENDED"]
}

function mapStaffLifecycleStatus(
  status: RetailOpsStaffLifecycleStatus,
): MembershipStatus {
  return status === "active" ? "ACTIVE" : "SUSPENDED"
}

function isMutableStaffRole(role: MembershipRole) {
  return ["CASHIER", "MANAGER", "OPERATOR"].includes(role)
}

function matchesStaffSearch(
  user: {
    displayName: string | null
    email: string
    name: string
  },
  search?: string,
) {
  const normalizedSearch = search?.trim().toLowerCase()

  if (!normalizedSearch) return true

  return [user.displayName, user.name, user.email]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalizedSearch)
}

function isCountedStaffMembership(input: {
  role: MembershipRole
  status: MembershipStatus
}) {
  return (
    ["CASHIER", "MANAGER", "OPERATOR"].includes(input.role) &&
    ["ACTIVE", "INVITED", "SUSPENDED"].includes(input.status)
  )
}

function isDurableStaffProfileTableUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  )
}

function createDurableInviteToken() {
  return randomBytes(32).toString("base64url")
}

function getDurableInviteTokenHash(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex")
}

async function upsertDurableRetailOpsStaffProfile(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    acceptedAt: Date | null
    defaultStoreId?: string | null
    displayName: string
    invitedAt: Date | null
    membershipId: string
    role: MembershipRole
    status: MembershipStatus
    suspendedAt?: Date | null
    tenantId: string
    userId: string
  },
) {
  const suspendedAt =
    input.suspendedAt ?? (input.status === "SUSPENDED" ? new Date() : null)

  return db.retailOpsStaffProfile.upsert({
    where: {
      tenantId_userId: {
        tenantId: input.tenantId,
        userId: input.userId,
      },
    },
    create: {
      acceptedAt: input.acceptedAt,
      defaultStoreId: input.defaultStoreId ?? null,
      displayName: input.displayName,
      invitedAt: input.invitedAt,
      membershipId: input.membershipId,
      metadata: {
        retailOps: {
          source: "retail_ops_staff_repository",
        },
      } as Prisma.InputJsonValue,
      roleSnapshot: input.role,
      statusSnapshot: input.status,
      suspendedAt,
      tenantId: input.tenantId,
      userId: input.userId,
    },
    update: {
      acceptedAt: input.acceptedAt,
      ...(input.defaultStoreId ? { defaultStoreId: input.defaultStoreId } : {}),
      displayName: input.displayName,
      invitedAt: input.invitedAt,
      membershipId: input.membershipId,
      roleSnapshot: input.role,
      statusSnapshot: input.status,
      suspendedAt,
    },
    select: {
      id: true,
    },
  })
}

async function writeDurableRetailOpsStaffLifecycleEvent(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    actorUserId: string | null
    fromRole?: MembershipRole | null
    fromStatus?: MembershipStatus | null
    happenedAt: Date
    membershipId: string
    metadata?: Prisma.InputJsonValue
    staffProfileId: string
    staffUserId: string
    tenantId: string
    toRole?: MembershipRole | null
    toStatus?: MembershipStatus | null
    type:
      | typeof DurableRetailOpsStaffLifecycleEventType.INVITE_REFRESHED
      | typeof DurableRetailOpsStaffLifecycleEventType.INVITED
      | typeof DurableRetailOpsStaffLifecycleEventType.ONBOARDING_COMPLETED
      | typeof DurableRetailOpsStaffLifecycleEventType.REACTIVATED
      | typeof DurableRetailOpsStaffLifecycleEventType.SUSPENDED
  },
) {
  await db.retailOpsStaffLifecycleEvent.create({
    data: {
      actorUserId: input.actorUserId,
      fromRole: input.fromRole ?? null,
      fromStatus: input.fromStatus ?? null,
      happenedAt: input.happenedAt,
      membershipId: input.membershipId,
      metadata: input.metadata ?? Prisma.JsonNull,
      staffProfileId: input.staffProfileId,
      staffUserId: input.staffUserId,
      tenantId: input.tenantId,
      toRole: input.toRole ?? null,
      toStatus: input.toStatus ?? null,
      type: input.type,
    },
    select: {
      id: true,
    },
  })
}

async function writeDurableRetailOpsStaffInvite(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    email: string
    externalId?: string
    invitedAt: Date
    invitedByUserId: string
    invitedUserId: string
    membershipId: string
    previousRole: MembershipRole | null
    previousStatus: MembershipStatus | null
    role: MembershipRole
    staffDisplayName: string
    storeId: string
    tenantId: string
  },
): Promise<string | null> {
  try {
    const acceptanceToken = createDurableInviteToken()
    const tokenHash = getDurableInviteTokenHash(acceptanceToken)
    const profile = await upsertDurableRetailOpsStaffProfile(db, {
      acceptedAt: null,
      defaultStoreId: input.storeId,
      displayName: input.staffDisplayName,
      invitedAt: input.invitedAt,
      membershipId: input.membershipId,
      role: input.role,
      status: "INVITED",
      tenantId: input.tenantId,
      userId: input.invitedUserId,
    })

    await db.retailOpsStaffInviteToken.updateMany({
      where: {
        membershipId: input.membershipId,
        status: DurableRetailOpsStaffInviteTokenStatus.ACTIVE,
        tenantId: input.tenantId,
      },
      data: {
        revokedAt: input.invitedAt,
        revokedByUserId: input.invitedByUserId,
        status: DurableRetailOpsStaffInviteTokenStatus.REVOKED,
      },
    })

    await db.retailOpsStaffInviteToken.create({
      data: {
        email: input.email,
        expiresAt: new Date(
          input.invitedAt.getTime() + 1000 * 60 * 60 * 24 * 14,
        ),
        externalId: input.externalId ?? null,
        invitedByUserId: input.invitedByUserId,
        invitedUserId: input.invitedUserId,
        membershipId: input.membershipId,
        metadata: {
          retailOps: {
            source: "retail_ops_staff_invite",
          },
        } as Prisma.InputJsonValue,
        role: input.role,
        status: DurableRetailOpsStaffInviteTokenStatus.ACTIVE,
        tenantId: input.tenantId,
        tokenHash,
      },
      select: {
        id: true,
      },
    })

    await writeDurableRetailOpsStaffLifecycleEvent(db, {
      actorUserId: input.invitedByUserId,
      fromRole: input.previousRole,
      fromStatus: input.previousStatus,
      happenedAt: input.invitedAt,
      membershipId: input.membershipId,
      metadata: {
        retailOps: {
          externalId: input.externalId ?? null,
          source: "retail_ops_staff_invite",
        },
      } as Prisma.InputJsonValue,
      staffProfileId: profile.id,
      staffUserId: input.invitedUserId,
      tenantId: input.tenantId,
      toRole: input.role,
      toStatus: "INVITED",
      type: input.previousStatus
        ? DurableRetailOpsStaffLifecycleEventType.INVITE_REFRESHED
        : DurableRetailOpsStaffLifecycleEventType.INVITED,
    })

    return acceptanceToken
  } catch (error) {
    if (isDurableStaffProfileTableUnavailable(error)) return null

    throw error
  }
}

async function writeDurableRetailOpsStaffStatusChange(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    acceptedAt: Date | null
    actorUserId: string
    displayName: string
    happenedAt: Date
    invitedAt: Date | null
    membershipId: string
    previousStatus: MembershipStatus
    role: MembershipRole
    staffUserId: string
    status: MembershipStatus
    tenantId: string
  },
) {
  try {
    const profile = await upsertDurableRetailOpsStaffProfile(db, {
      acceptedAt: input.acceptedAt,
      displayName: input.displayName,
      invitedAt: input.invitedAt,
      membershipId: input.membershipId,
      role: input.role,
      status: input.status,
      suspendedAt: input.status === "SUSPENDED" ? input.happenedAt : null,
      tenantId: input.tenantId,
      userId: input.staffUserId,
    })

    await writeDurableRetailOpsStaffLifecycleEvent(db, {
      actorUserId: input.actorUserId,
      fromStatus: input.previousStatus,
      happenedAt: input.happenedAt,
      membershipId: input.membershipId,
      metadata: {
        retailOps: {
          source: "retail_ops_staff_status_update",
        },
      } as Prisma.InputJsonValue,
      staffProfileId: profile.id,
      staffUserId: input.staffUserId,
      tenantId: input.tenantId,
      toRole: input.role,
      toStatus: input.status,
      type:
        input.status === "ACTIVE"
          ? DurableRetailOpsStaffLifecycleEventType.REACTIVATED
          : DurableRetailOpsStaffLifecycleEventType.SUSPENDED,
    })
  } catch (error) {
    if (isDurableStaffProfileTableUnavailable(error)) return

    throw error
  }
}

async function writeDurableRetailOpsStaffOnboardingComplete(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    acceptedAt: Date | null
    displayName: string
    happenedAt: Date
    invitedAt: Date | null
    membershipId: string
    previousStatus: MembershipStatus
    role: MembershipRole
    staffUserId: string
    status: MembershipStatus
    tenantId: string
  },
) {
  try {
    const profile = await upsertDurableRetailOpsStaffProfile(db, {
      acceptedAt: input.acceptedAt,
      displayName: input.displayName,
      invitedAt: input.invitedAt,
      membershipId: input.membershipId,
      role: input.role,
      status: input.status,
      suspendedAt: null,
      tenantId: input.tenantId,
      userId: input.staffUserId,
    })

    if (input.previousStatus !== "INVITED") return

    await db.retailOpsStaffInviteToken.updateMany({
      where: {
        membershipId: input.membershipId,
        status: DurableRetailOpsStaffInviteTokenStatus.ACTIVE,
        tenantId: input.tenantId,
      },
      data: {
        acceptedAt: input.happenedAt,
        acceptedByUserId: input.staffUserId,
        status: DurableRetailOpsStaffInviteTokenStatus.ACCEPTED,
      },
    })

    await writeDurableRetailOpsStaffLifecycleEvent(db, {
      actorUserId: input.staffUserId,
      fromStatus: input.previousStatus,
      happenedAt: input.happenedAt,
      membershipId: input.membershipId,
      metadata: {
        retailOps: {
          source: "retail_ops_staff_onboarding",
        },
      } as Prisma.InputJsonValue,
      staffProfileId: profile.id,
      staffUserId: input.staffUserId,
      tenantId: input.tenantId,
      toRole: input.role,
      toStatus: input.status,
      type: DurableRetailOpsStaffLifecycleEventType.ONBOARDING_COMPLETED,
    })
  } catch (error) {
    if (isDurableStaffProfileTableUnavailable(error)) return

    throw error
  }
}

function mapMembershipRetailOpsStaffMember(membership: {
  acceptedAt: Date | null
  createdAt: Date
  id: string
  invitedAt: Date | null
  invitedById: string | null
  role: MembershipRole
  status: MembershipStatus
  updatedAt: Date
  user: {
    avatarUrl: string | null
    displayName: string | null
    email: string
    id: string
    image: string | null
    name: string
  }
}): RetailOpsStaffMember {
  return {
    acceptedAt: membership.acceptedAt,
    createdAt: membership.createdAt,
    id: membership.id,
    invitedAt: membership.invitedAt,
    invitedByUserId: membership.invitedById,
    role: membership.role,
    status: membership.status,
    updatedAt: membership.updatedAt,
    user: {
      avatarUrl: membership.user.avatarUrl,
      displayName: getDisplayName(membership.user),
      email: membership.user.email,
      id: membership.user.id,
      image: membership.user.image,
      name: membership.user.name,
    },
  }
}

function mapDurableRetailOpsStaffMember(profile: {
  acceptedAt: Date | null
  createdAt: Date
  displayName: string
  id: string
  invitedAt: Date | null
  membership: {
    acceptedAt: Date | null
    createdAt: Date
    id: string
    invitedAt: Date | null
    invitedById: string | null
    role: MembershipRole
    status: MembershipStatus
    updatedAt: Date
  } | null
  membershipId: string | null
  roleSnapshot: MembershipRole
  statusSnapshot: MembershipStatus
  updatedAt: Date
  user: {
    avatarUrl: string | null
    displayName: string | null
    email: string
    id: string
    image: string | null
    name: string
  }
}): RetailOpsStaffMember {
  return {
    acceptedAt: profile.acceptedAt ?? profile.membership?.acceptedAt ?? null,
    createdAt: profile.membership?.createdAt ?? profile.createdAt,
    id: profile.membership?.id ?? profile.membershipId ?? profile.id,
    invitedAt: profile.invitedAt ?? profile.membership?.invitedAt ?? null,
    invitedByUserId: profile.membership?.invitedById ?? null,
    role: profile.roleSnapshot,
    status: profile.statusSnapshot,
    updatedAt: profile.updatedAt,
    user: {
      avatarUrl: profile.user.avatarUrl,
      displayName: profile.displayName || getDisplayName(profile.user),
      email: profile.user.email,
      id: profile.user.id,
      image: profile.user.image,
      name: profile.user.name,
    },
  }
}

function addRetailOpsStaffMember(
  staff: RetailOpsStaffMember[],
  seen: Set<string>,
  member: RetailOpsStaffMember,
  limit: number,
) {
  const keys = [`membership:${member.id}`, `user:${member.user.id}`]

  if (keys.some((key) => seen.has(key))) return

  staff.push(member)
  for (const key of keys) {
    seen.add(key)
  }

  return staff.length >= limit
}

function mergeRetailOpsStaffMembers(input: {
  durableStaff: RetailOpsStaffMember[]
  fallbackStaff: RetailOpsStaffMember[]
  limit: number
}) {
  const staff: RetailOpsStaffMember[] = []
  const seen = new Set<string>()

  for (const member of input.durableStaff) {
    if (addRetailOpsStaffMember(staff, seen, member, input.limit)) return staff
  }

  for (const member of input.fallbackStaff) {
    if (addRetailOpsStaffMember(staff, seen, member, input.limit)) return staff
  }

  return staff
}

async function listDurableRetailOpsStaff(
  db: PrismaClient,
  input: ListRetailOpsStaffInput,
  lookbackLimit: number,
) {
  try {
    const profiles = await db.retailOpsStaffProfile.findMany({
      where: {
        tenantId: input.tenantId,
        roleSnapshot: {
          in: mapStaffListRole(input.role),
        },
        statusSnapshot: {
          in: mapStaffListStatus(input.status),
        },
      },
      orderBy: [
        {
          invitedAt: "desc",
        },
        {
          updatedAt: "desc",
        },
      ],
      take: lookbackLimit,
      select: {
        acceptedAt: true,
        createdAt: true,
        displayName: true,
        id: true,
        invitedAt: true,
        membership: {
          select: {
            acceptedAt: true,
            createdAt: true,
            id: true,
            invitedAt: true,
            invitedById: true,
            role: true,
            status: true,
            updatedAt: true,
          },
        },
        membershipId: true,
        roleSnapshot: true,
        statusSnapshot: true,
        updatedAt: true,
        user: {
          select: {
            avatarUrl: true,
            displayName: true,
            email: true,
            id: true,
            image: true,
            name: true,
          },
        },
      },
    })

    return profiles
      .filter((profile) =>
        matchesStaffSearch(
          {
            displayName: profile.displayName || profile.user.displayName,
            email: profile.user.email,
            name: profile.user.name,
          },
          input.search,
        ),
      )
      .map(mapDurableRetailOpsStaffMember)
  } catch (error) {
    if (isDurableStaffProfileTableUnavailable(error)) return null

    throw error
  }
}

async function listMembershipRetailOpsStaff(
  db: PrismaClient,
  input: ListRetailOpsStaffInput,
  lookbackLimit: number,
) {
  const memberships = await db.membership.findMany({
    where: {
      tenantId: input.tenantId,
      role: {
        in: mapStaffListRole(input.role),
      },
      status: {
        in: mapStaffListStatus(input.status),
      },
    },
    orderBy: [
      {
        invitedAt: "desc",
      },
      {
        updatedAt: "desc",
      },
    ],
    take: lookbackLimit,
    select: {
      acceptedAt: true,
      createdAt: true,
      id: true,
      invitedAt: true,
      invitedById: true,
      role: true,
      status: true,
      updatedAt: true,
      user: {
        select: {
          avatarUrl: true,
          displayName: true,
          email: true,
          id: true,
          image: true,
          name: true,
        },
      },
    },
  })

  return memberships
    .filter((membership) => matchesStaffSearch(membership.user, input.search))
    .map(mapMembershipRetailOpsStaffMember)
}

export async function listRetailOpsStaff(
  db: PrismaClient,
  input: ListRetailOpsStaffInput,
): Promise<RetailOpsStaffMember[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  const lookbackLimit = Math.max(limit * 3, 100)
  const [durableStaff, fallbackStaff] = await Promise.all([
    listDurableRetailOpsStaff(db, input, lookbackLimit),
    listMembershipRetailOpsStaff(db, input, lookbackLimit),
  ])

  if (!durableStaff) {
    return fallbackStaff.slice(0, limit)
  }

  return mergeRetailOpsStaffMembers({
    durableStaff,
    fallbackStaff,
    limit,
  })
}

export async function inviteRetailOpsStaff(
  db: PrismaClient,
  input: InviteRetailOpsStaffInput,
): Promise<InvitedRetailOpsStaff> {
  const email = normalizeEmail(input.email)
  const externalId = normalizeExternalId(input.externalId)
  const name = normalizeName(input.name)
  const role = mapStaffRole(input.role)
  const invitedAt = new Date()

  return db.$transaction(async (tx) => {
    const tenant = await tx.tenant.findFirst({
      where: {
        id: input.tenantId,
        stores: {
          some: {
            id: input.storeId,
            status: { not: "ARCHIVED" },
          },
        },
      },
      select: {
        id: true,
        metadata: true,
      },
    })

    if (!tenant) {
      throw new RetailOpsStaffError(
        "TENANT_NOT_FOUND",
        "Business not found for this store.",
      )
    }

    const replayedInvite = externalId
      ? findStaffInviteReplay(tenant.metadata, externalId)
      : null

    if (replayedInvite) {
      return replayedInvite
    }

    const existingUser = await tx.user.findUnique({
      where: {
        email,
      },
      select: {
        displayName: true,
        email: true,
        id: true,
        name: true,
      },
    })

    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          email,
          metadata: {
            retailOps: {
              ...(externalId ? { staffInviteExternalId: externalId } : {}),
              invitedByUserId: input.actorUserId,
              source: "retail_ops_staff_invite",
              tenantId: input.tenantId,
            },
          },
          name: name ?? getFallbackName(email),
          ...(name ? { displayName: name } : {}),
        },
        select: {
          displayName: true,
          email: true,
          id: true,
          name: true,
        },
      }))

    const existingMembership = await tx.membership.findUnique({
      where: {
        tenantId_userId: {
          tenantId: input.tenantId,
          userId: user.id,
        },
      },
      select: {
        id: true,
        role: true,
        status: true,
      },
    })

    if (existingMembership?.status === "ACTIVE") {
      throw new RetailOpsStaffError(
        "STAFF_ALREADY_ACTIVE",
        "This person is already active in the business.",
      )
    }

    if (!existingMembership || !isCountedStaffMembership(existingMembership)) {
      await assertRetailOpsEntitlementAvailable(tx, {
        key: "staff",
        tenantId: input.tenantId,
      })
    }

    const membership = existingMembership
      ? await tx.membership.update({
          where: {
            id: existingMembership.id,
          },
          data: {
            acceptedAt: null,
            invitedAt,
            invitedById: input.actorUserId,
            role,
            status: "INVITED",
          },
          select: {
            id: true,
            invitedAt: true,
            invitedById: true,
            role: true,
            status: true,
          },
        })
      : await tx.membership.create({
          data: {
            invitedAt,
            invitedById: input.actorUserId,
            role,
            status: "INVITED",
            tenantId: input.tenantId,
            userId: user.id,
          },
          select: {
            id: true,
            invitedAt: true,
            invitedById: true,
            role: true,
            status: true,
          },
        })

    const acceptanceToken = await writeDurableRetailOpsStaffInvite(tx, {
      email,
      externalId,
      invitedAt: membership.invitedAt ?? invitedAt,
      invitedByUserId: input.actorUserId,
      invitedUserId: user.id,
      membershipId: membership.id,
      previousRole: existingMembership?.role ?? null,
      previousStatus: existingMembership?.status ?? null,
      role: membership.role,
      staffDisplayName: getDisplayName(user),
      storeId: input.storeId,
      tenantId: input.tenantId,
    })

    const invitedStaff = {
      invite: {
        acceptanceToken,
        id: membership.id,
        invitedAt: membership.invitedAt,
        invitedByUserId: membership.invitedById,
        role: membership.role,
        status: membership.status,
      },
      staff: {
        displayName: user.displayName,
        email: user.email,
        id: user.id,
        name: user.name,
      },
      notification: {
        shouldSend: true,
      },
      storeId: input.storeId,
      tenantId: input.tenantId,
    }

    if (externalId) {
      await tx.tenant.update({
        where: {
          id: tenant.id,
        },
        data: {
          metadata: withStaffInvite(tenant.metadata, {
            externalId,
            result: serializeInvitedStaffResult(invitedStaff),
          }),
        },
      })
    }

    return invitedStaff
  })
}

export async function updateRetailOpsStaffStatus(
  db: PrismaClient,
  input: UpdateRetailOpsStaffStatusInput,
): Promise<UpdatedRetailOpsStaffStatus> {
  if (input.actorUserId === input.staffUserId) {
    throw new RetailOpsStaffError(
      "STAFF_SELF_UPDATE_FORBIDDEN",
      "You cannot change your own staff status.",
    )
  }

  const nextStatus = mapStaffLifecycleStatus(input.status)
  const updatedAt = new Date()

  return db.$transaction(async (tx) => {
    const membership = await tx.membership.findUnique({
      where: {
        tenantId_userId: {
          tenantId: input.tenantId,
          userId: input.staffUserId,
        },
      },
      select: {
        acceptedAt: true,
        id: true,
        invitedAt: true,
        role: true,
        status: true,
        user: {
          select: {
            displayName: true,
            email: true,
            id: true,
            name: true,
          },
        },
      },
    })

    if (
      !membership ||
      !isMutableStaffRole(membership.role) ||
      membership.status === "REMOVED"
    ) {
      throw new RetailOpsStaffError(
        "STAFF_NOT_FOUND",
        "Active or suspended Retail Ops staff member not found.",
      )
    }

    if (membership.status === nextStatus) {
      throw new RetailOpsStaffError(
        "STAFF_STATUS_UNCHANGED",
        "This staff member already has that status.",
      )
    }

    if (nextStatus === "ACTIVE" && membership.status !== "SUSPENDED") {
      throw new RetailOpsStaffError(
        "STAFF_STATUS_NOT_ALLOWED",
        "Only suspended staff can be reactivated from this action.",
      )
    }

    if (
      nextStatus === "SUSPENDED" &&
      !["ACTIVE", "INVITED"].includes(membership.status)
    ) {
      throw new RetailOpsStaffError(
        "STAFF_STATUS_NOT_ALLOWED",
        "Only active or invited staff can be suspended from this action.",
      )
    }

    const updatedMembership = await tx.membership.update({
      where: {
        id: membership.id,
      },
      data: {
        acceptedAt:
          nextStatus === "ACTIVE"
            ? (membership.acceptedAt ?? updatedAt)
            : membership.acceptedAt,
        status: nextStatus,
      },
      select: {
        acceptedAt: true,
        id: true,
        role: true,
        status: true,
        updatedAt: true,
        user: {
          select: {
            displayName: true,
            email: true,
            id: true,
            name: true,
          },
        },
      },
    })

    await writeDurableRetailOpsStaffStatusChange(tx, {
      acceptedAt: updatedMembership.acceptedAt,
      actorUserId: input.actorUserId,
      displayName: getDisplayName(updatedMembership.user),
      happenedAt: updatedAt,
      invitedAt: membership.invitedAt,
      membershipId: updatedMembership.id,
      previousStatus: membership.status,
      role: updatedMembership.role,
      staffUserId: updatedMembership.user.id,
      status: updatedMembership.status,
      tenantId: input.tenantId,
    })

    return {
      acceptedAt: updatedMembership.acceptedAt,
      id: updatedMembership.id,
      previousStatus: membership.status,
      role: updatedMembership.role,
      status: updatedMembership.status,
      updatedAt: updatedMembership.updatedAt,
      updatedByUserId: input.actorUserId,
      user: {
        displayName: getDisplayName(updatedMembership.user),
        email: updatedMembership.user.email,
        id: updatedMembership.user.id,
        name: updatedMembership.user.name,
      },
    }
  })
}

export async function resolveRetailOpsStaffInviteToken(
  db: PrismaClient,
  input: { token: string },
): Promise<ResolvedRetailOpsStaffInvite> {
  const token = input.token.trim()

  if (!token) {
    throw new RetailOpsStaffError(
      "STAFF_INVITE_INVALID",
      "This staff invitation link is not valid.",
    )
  }

  try {
    const invite = await db.retailOpsStaffInviteToken.findUnique({
      where: {
        tokenHash: getDurableInviteTokenHash(token),
      },
      select: {
        email: true,
        expiresAt: true,
        id: true,
        membershipId: true,
        role: true,
        status: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    })

    if (!invite) {
      throw new RetailOpsStaffError(
        "STAFF_INVITE_INVALID",
        "This staff invitation link is not valid.",
      )
    }

    if (
      invite.status !== DurableRetailOpsStaffInviteTokenStatus.ACTIVE ||
      invite.expiresAt.getTime() <= Date.now()
    ) {
      if (
        invite.status === DurableRetailOpsStaffInviteTokenStatus.ACTIVE &&
        invite.expiresAt.getTime() <= Date.now()
      ) {
        await db.retailOpsStaffInviteToken.update({
          where: { id: invite.id },
          data: { status: DurableRetailOpsStaffInviteTokenStatus.EXPIRED },
        })
      }

      throw new RetailOpsStaffError(
        "STAFF_INVITE_EXPIRED",
        "This staff invitation link has expired. Ask the business owner to send a new invite.",
      )
    }

    return {
      email: invite.email,
      expiresAt: invite.expiresAt,
      inviteTokenId: invite.id,
      membershipId: invite.membershipId,
      role: invite.role,
      status: invite.status,
      tenant: invite.tenant,
    }
  } catch (error) {
    if (error instanceof RetailOpsStaffError) throw error
    if (isDurableStaffProfileTableUnavailable(error)) {
      throw new RetailOpsStaffError(
        "STAFF_INVITE_INVALID",
        "Staff invitation links are not available yet. Sign in with your invited email address.",
      )
    }

    throw error
  }
}

export async function completeRetailOpsStaffOnboarding(
  db: PrismaClient,
  input: CompleteRetailOpsStaffOnboardingInput,
): Promise<CompletedRetailOpsStaffOnboarding> {
  const acceptedAt = new Date()
  const displayName = normalizeName(input.displayName)
  const name = normalizeName(input.name)

  return db.$transaction(async (tx) => {
    const memberships = await tx.membership.findMany({
      where: {
        userId: input.userId,
        role: {
          in: ["CASHIER", "MANAGER", "OPERATOR"],
        },
        status: {
          in: ["ACTIVE", "INVITED"],
        },
        ...(input.tenantSlug
          ? {
              tenant: {
                slug: input.tenantSlug,
              },
            }
          : {}),
      },
      orderBy: {
        invitedAt: "asc",
      },
      take: 20,
      select: {
        acceptedAt: true,
        id: true,
        invitedAt: true,
        role: true,
        status: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        user: {
          select: {
            displayName: true,
            email: true,
            id: true,
            name: true,
          },
        },
      },
    })
    const membership =
      memberships.find(
        (currentMembership) => currentMembership.status === "INVITED",
      ) ??
      memberships[0] ??
      null

    if (!membership) {
      throw new RetailOpsStaffError(
        "STAFF_NOT_FOUND",
        "Invited Retail Ops staff membership not found.",
      )
    }

    const nextDisplayName = displayName ?? name ?? membership.user.displayName
    const nextName = name ?? displayName ?? membership.user.name
    const [updatedUser, updatedMembership] = await Promise.all([
      nextDisplayName || nextName
        ? tx.user.update({
            where: {
              id: input.userId,
            },
            data: {
              ...(nextDisplayName ? { displayName: nextDisplayName } : {}),
              ...(nextName ? { name: nextName } : {}),
            },
            select: {
              displayName: true,
              email: true,
              id: true,
              name: true,
            },
          })
        : Promise.resolve(membership.user),
      membership.status === "INVITED"
        ? tx.membership.update({
            where: {
              id: membership.id,
            },
            data: {
              acceptedAt,
              status: "ACTIVE",
            },
            select: {
              acceptedAt: true,
              id: true,
              invitedAt: true,
              role: true,
              status: true,
              updatedAt: true,
            },
          })
        : tx.membership.findUniqueOrThrow({
            where: {
              id: membership.id,
            },
            select: {
              acceptedAt: true,
              id: true,
              invitedAt: true,
              role: true,
              status: true,
              updatedAt: true,
            },
          }),
    ])

    await writeDurableRetailOpsStaffOnboardingComplete(tx, {
      acceptedAt: updatedMembership.acceptedAt,
      displayName: getDisplayName(updatedUser),
      happenedAt: acceptedAt,
      invitedAt: updatedMembership.invitedAt ?? membership.invitedAt,
      membershipId: updatedMembership.id,
      previousStatus: membership.status,
      role: updatedMembership.role,
      staffUserId: updatedUser.id,
      status: updatedMembership.status,
      tenantId: membership.tenant.id,
    })

    return {
      acceptedAt: updatedMembership.acceptedAt,
      id: updatedMembership.id,
      previousStatus: membership.status,
      role: updatedMembership.role,
      status: updatedMembership.status,
      tenant: membership.tenant,
      updatedAt: updatedMembership.updatedAt,
      user: {
        displayName: getDisplayName(updatedUser),
        email: updatedUser.email,
        id: updatedUser.id,
        name: updatedUser.name,
      },
    }
  })
}
