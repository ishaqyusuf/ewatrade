import { createHash, randomBytes } from "node:crypto"

import {
  type ServiceCommercePublicEntryAction,
  getServiceCommerceEntryPointPublishBlockers,
  recommendServiceCommerceChannelDefaults,
} from "@ewatrade/service-commerce"
import { readBusinessOnboardingFactsFromStoreMetadata } from "@ewatrade/utils"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { MembershipRole, MembershipStatus } from "../../generated/prisma/enums"
import { getServiceCommerceWorkspaceAccess } from "./service-commerce-access"
import { revalidateCustomerActionCapabilityInTransaction } from "./service-commerce-actions/projection"
import { evaluateServiceCommercePolicyBatchInTransaction } from "./service-commerce-policy"
import type { DbClient } from "./types"

type CustomerChannelsClient = DbClient

const TEAM_ASSIGNMENT_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const

export class CustomerChannelsError extends Error {
  constructor(
    readonly code: "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "PUBLISH_BLOCKED",
    message: string,
  ) {
    super(message)
    this.name = "CustomerChannelsError"
  }
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function publicToken() {
  return randomBytes(32).toString("base64url")
}

async function assertTenantManager(
  db: CustomerChannelsClient,
  input: { actorUserId: string; tenantId: string },
) {
  const membership = await db.membership.findFirst({
    select: { id: true, role: true },
    where: {
      status: MembershipStatus.ACTIVE,
      tenantId: input.tenantId,
      userId: input.actorUserId,
    },
  })
  if (
    membership?.role !== MembershipRole.OWNER &&
    membership?.role !== MembershipRole.ADMIN
  ) {
    throw new CustomerChannelsError(
      "FORBIDDEN",
      "Owner or administrator access is required to manage customer channels.",
    )
  }
  return membership
}

async function assertStoreManager(
  db: CustomerChannelsClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  const [membership, store] = await Promise.all([
    assertTenantManager(db, input),
    db.store.findFirst({
      select: { id: true, metadata: true, name: true },
      where: { id: input.storeId, tenantId: input.tenantId },
    }),
  ])
  if (!store) {
    throw new CustomerChannelsError("NOT_FOUND", "Store not found.")
  }
  return { membership, store }
}

function connectionLifecycle(status: string) {
  if (status === "ACTIVE") return "active" as const
  if (status === "SUSPENDED") return "suspended" as const
  if (status === "REVOKED") return "revoked" as const
  return "pending" as const
}

function connectionReadiness(connection: {
  businessVerified: boolean
  numberVerified: boolean
  outboundVerified: boolean
  status: string
  webhookSubscribed: boolean
}) {
  if (connection.status === "ACTIVE") return "ready" as const
  if (connection.status === "SUSPENDED" || connection.status === "REVOKED") {
    return "blocked" as const
  }
  if (
    connection.businessVerified &&
    connection.numberVerified &&
    connection.webhookSubscribed &&
    connection.outboundVerified
  ) {
    return "test_required" as const
  }
  return connection.status === "TESTING"
    ? ("test_required" as const)
    : ("configuration_required" as const)
}

function mapAssignmentStatus(status: string) {
  if (status === "ACTIVE") return "active" as const
  if (status === "SUSPENDED") return "suspended" as const
  return "removed" as const
}

export async function getCustomerChannelWorkspace(
  db: PrismaClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  const { store } = await assertStoreManager(db, input)
  const [connections, assignments, teamOptions, stores, entryPoint, access] =
    await Promise.all([
      db.whatsAppConnection.findMany({
        include: {
          bindings: {
            include: { store: { select: { id: true, name: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { updatedAt: "desc" },
        where: { tenantId: input.tenantId },
      }),
      db.serviceCommerceStoreTeamAssignment.findMany({
        include: {
          membership: {
            select: {
              status: true,
              user: {
                select: { displayName: true, id: true, name: true },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
        where: {
          capability: "ATTENDANT",
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      }),
      db.membership.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          user: { select: { displayName: true, id: true, name: true } },
        },
        where: {
          acceptedAt: { not: null },
          status: MembershipStatus.ACTIVE,
          tenantId: input.tenantId,
        },
      }),
      db.store.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
        where: { status: "ACTIVE", tenantId: input.tenantId },
      }),
      db.customerEntryPoint.findFirst({
        select: {
          id: true,
          publicToken: true,
          revision: true,
          status: true,
        },
        where: { storeId: input.storeId, tenantId: input.tenantId },
      }),
      getServiceCommerceWorkspaceAccess(db, input),
    ])

  const onboarding = readBusinessOnboardingFactsFromStoreMetadata(
    store.metadata,
  )

  return {
    access: access.access,
    connections: connections.map((connection) => ({
      billingOwner: connection.billingOwner,
      businessDisplayName: connection.businessDisplayName,
      displayNumber: connection.displayNumber,
      id: connection.id,
      lastTestFailureCode: connection.lastTestFailureCode,
      lastTestedAt: connection.lastTestedAt,
      lifecycle: connectionLifecycle(connection.status),
      provider: "whatsapp" as const,
      readiness: connectionReadiness(connection),
      storeAssignments: connection.bindings.map((binding) => ({
        id: binding.store.id,
        name: binding.store.name,
        status: mapAssignmentStatus(binding.status),
      })),
    })),
    entryPoint: entryPoint
      ? {
          entryToken: entryPoint.publicToken,
          id: entryPoint.id,
          revision: entryPoint.revision,
          status:
            entryPoint.status === "PUBLISHED"
              ? ("published" as const)
              : entryPoint.status === "REVOKED"
                ? ("revoked" as const)
                : ("unpublished" as const),
        }
      : null,
    readiness: {
      web: access.readiness.capabilities.web,
      whatsapp: access.readiness.capabilities.whatsapp,
    },
    recommendation: onboarding
      ? recommendServiceCommerceChannelDefaults({
          ...onboarding,
          storeCount: stores.length,
        })
      : null,
    storeId: input.storeId,
    stores,
    team: assignments.map((assignment) => ({
      id: assignment.id,
      membershipId: assignment.membershipId,
      name:
        assignment.membership.user.displayName ||
        assignment.membership.user.name ||
        "Team member",
      revision: assignment.revision,
      status:
        assignment.membership.status === MembershipStatus.ACTIVE
          ? mapAssignmentStatus(assignment.status)
          : ("suspended" as const),
      userId: assignment.membership.user.id,
    })),
    teamOptions: teamOptions.map((membership) => ({
      membershipId: membership.id,
      name:
        membership.user.displayName || membership.user.name || "Team member",
      role: membership.role.toLowerCase(),
      userId: membership.user.id,
    })),
  }
}

export async function assignCustomerChannelAttendant(
  db: PrismaClient,
  input: {
    actorUserId: string
    membershipId: string
    reason: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    await assertStoreManager(tx, input)
    const membership = await tx.membership.findFirst({
      select: { id: true },
      where: {
        acceptedAt: { not: null },
        id: input.membershipId,
        status: MembershipStatus.ACTIVE,
        tenantId: input.tenantId,
      },
    })
    if (!membership) {
      throw new CustomerChannelsError(
        "NOT_FOUND",
        "Select an accepted active team member.",
      )
    }
    const assignment = await tx.serviceCommerceStoreTeamAssignment.upsert({
      create: {
        assignedByUserId: input.actorUserId,
        capability: "ATTENDANT",
        membershipId: membership.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      update: {
        assignedByUserId: input.actorUserId,
        revision: { increment: 1 },
        revokedAt: null,
        revokedByUserId: null,
        status: "ACTIVE",
        suspendedAt: null,
        suspendedByUserId: null,
      },
      where: {
        storeId_membershipId_capability: {
          capability: "ATTENDANT",
          membershipId: membership.id,
          storeId: input.storeId,
        },
      },
    })
    await tx.serviceCommerceStoreTeamAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        assignmentId: assignment.id,
        assignmentRevision: assignment.revision,
        reason: input.reason.trim(),
        storeId: input.storeId,
        subjectMembershipId: membership.id,
        tenantId: input.tenantId,
        type: "ASSIGNED",
      },
    })
    return { assignmentId: assignment.id, revision: assignment.revision }
  }, TEAM_ASSIGNMENT_TRANSACTION_OPTIONS)
}

export async function revokeCustomerChannelAttendant(
  db: PrismaClient,
  input: {
    actorUserId: string
    assignmentId: string
    expectedRevision: number
    reason: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    await assertStoreManager(tx, input)
    const assignment = await tx.serviceCommerceStoreTeamAssignment.findFirst({
      select: { id: true, membershipId: true, revision: true, status: true },
      where: {
        capability: "ATTENDANT",
        id: input.assignmentId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!assignment) {
      throw new CustomerChannelsError("NOT_FOUND", "Attendant not found.")
    }
    const updated = await tx.serviceCommerceStoreTeamAssignment.updateMany({
      data: {
        revision: { increment: 1 },
        revokedAt: new Date(),
        revokedByUserId: input.actorUserId,
        status: "REVOKED",
      },
      where: {
        id: assignment.id,
        revision: input.expectedRevision,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (updated.count !== 1) {
      throw new CustomerChannelsError(
        "CONFLICT",
        "The attendant assignment changed before this request completed.",
      )
    }
    await tx.serviceCommerceStoreTeamAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        assignmentId: assignment.id,
        assignmentRevision: input.expectedRevision + 1,
        reason: input.reason.trim(),
        storeId: input.storeId,
        subjectMembershipId: assignment.membershipId,
        tenantId: input.tenantId,
        type: "REVOKED",
      },
    })
    return { assignmentId: assignment.id, revision: input.expectedRevision + 1 }
  }, TEAM_ASSIGNMENT_TRANSACTION_OPTIONS)
}

export async function saveCustomerChannelStoreBindings(
  db: PrismaClient,
  input: {
    actorUserId: string
    connectionId: string
    storeIds: string[]
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    await assertTenantManager(tx, input)
    const connection = await tx.whatsAppConnection.findFirst({
      select: { id: true },
      where: { id: input.connectionId, tenantId: input.tenantId },
    })
    if (!connection) {
      throw new CustomerChannelsError("NOT_FOUND", "Connection not found.")
    }
    const storeIds = [...new Set(input.storeIds)]
    if (storeIds.length === 0) {
      throw new CustomerChannelsError(
        "CONFLICT",
        "Assign at least one Store before testing a connection.",
      )
    }
    const [stores, existingBindings] = await Promise.all([
      tx.store.findMany({
        select: { id: true },
        where: { id: { in: storeIds }, tenantId: input.tenantId },
      }),
      tx.whatsAppStoreBinding.findMany({
        select: { status: true, storeId: true },
        where: {
          connectionId: connection.id,
          storeId: { in: storeIds },
          tenantId: input.tenantId,
        },
      }),
    ])
    if (stores.length !== storeIds.length) {
      throw new CustomerChannelsError(
        "NOT_FOUND",
        "One or more Stores are unavailable.",
      )
    }
    await tx.whatsAppStoreBinding.updateMany({
      data: { status: "SUSPENDED", suspendedAt: new Date() },
      where: {
        connectionId: connection.id,
        storeId: { notIn: storeIds },
        tenantId: input.tenantId,
      },
    })
    const existingStatusByStore = new Map(
      existingBindings.map((binding) => [binding.storeId, binding.status]),
    )
    for (const storeId of storeIds) {
      const remainsActive = existingStatusByStore.get(storeId) === "ACTIVE"
      await tx.whatsAppStoreBinding.upsert({
        create: {
          boundByUserId: input.actorUserId,
          connectionId: connection.id,
          status: "PENDING",
          storeId,
          tenantId: input.tenantId,
        },
        update: {
          boundByUserId: input.actorUserId,
          status: remainsActive ? undefined : "PENDING",
          suspendedAt: null,
        },
        where: {
          connectionId_storeId: { connectionId: connection.id, storeId },
        },
      })
    }
    await tx.whatsAppConnectionAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        connectionId: connection.id,
        payload: { assignedStoreCount: storeIds.length },
        tenantId: input.tenantId,
        type: "store_bindings_configured",
      },
    })
    return { connectionId: connection.id, storeIds }
  })
}

export async function publishCustomerEntryPoint(
  db: PrismaClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  return db.$transaction(async (tx) => {
    await assertStoreManager(tx, input)
    const [attendantCount, access, existing] = await Promise.all([
      tx.serviceCommerceStoreTeamAssignment.count({
        where: {
          capability: "ATTENDANT",
          membership: { status: MembershipStatus.ACTIVE },
          status: "ACTIVE",
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      }),
      getServiceCommerceWorkspaceAccess(tx, input),
      tx.customerEntryPoint.findFirst({
        select: { id: true, publicToken: true, revision: true, status: true },
        where: { storeId: input.storeId, tenantId: input.tenantId },
      }),
    ])
    const channels = (["web", "whatsapp"] as const).map((channel) => ({
      channel,
      readiness: access.readiness.capabilities[channel].readiness,
    }))
    const blockers = getServiceCommerceEntryPointPublishBlockers({
      attendants:
        attendantCount > 0
          ? [{ membershipId: "server-confirmed", status: "active" }]
          : [],
      channels,
    })
    if (blockers.length > 0) {
      throw new CustomerChannelsError(
        "PUBLISH_BLOCKED",
        `Customer entry point is not ready: ${blockers.join(", ")}.`,
      )
    }
    const nextToken =
      existing && existing.status !== "REVOKED"
        ? existing.publicToken
        : publicToken()
    const entryPoint = await tx.customerEntryPoint.upsert({
      create: {
        createdByUserId: input.actorUserId,
        publicToken: nextToken,
        publicTokenDigest: digest(nextToken),
        publishedAt: new Date(),
        publishedByUserId: input.actorUserId,
        status: "PUBLISHED",
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      update: {
        publicToken: existing?.status === "REVOKED" ? nextToken : undefined,
        publicTokenDigest:
          existing?.status === "REVOKED" ? digest(nextToken) : undefined,
        publishedAt: new Date(),
        publishedByUserId: input.actorUserId,
        revision: { increment: 1 },
        revokedAt: null,
        revokedByUserId: null,
        status: "PUBLISHED",
      },
      where: { storeId: input.storeId },
    })
    await tx.customerEntryPointAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        entryPointId: entryPoint.id,
        entryPointRevision: entryPoint.revision,
        reason: existing
          ? "Republished customer entry point"
          : "Published customer entry point",
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: existing ? "REPUBLISHED" : "PUBLISHED",
      },
    })
    return {
      entryPointId: entryPoint.id,
      publicToken: entryPoint.publicToken,
      revision: entryPoint.revision,
      status: "published" as const,
    }
  })
}

export async function revokeCustomerEntryPoint(
  db: PrismaClient,
  input: {
    actorUserId: string
    entryPointId: string
    expectedRevision: number
    reason: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    await assertStoreManager(tx, input)
    const result = await tx.customerEntryPoint.updateMany({
      data: {
        revision: { increment: 1 },
        revokedAt: new Date(),
        revokedByUserId: input.actorUserId,
        status: "REVOKED",
      },
      where: {
        id: input.entryPointId,
        revision: input.expectedRevision,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (result.count !== 1) {
      throw new CustomerChannelsError(
        "CONFLICT",
        "The entry point changed before this request completed.",
      )
    }
    await tx.customerEntryPointAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        entryPointId: input.entryPointId,
        entryPointRevision: input.expectedRevision + 1,
        reason: input.reason.trim(),
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: "REVOKED",
      },
    })
    return { revision: input.expectedRevision + 1, status: "revoked" as const }
  })
}

function policyAllows(
  outcomes: Array<{ outcome: string }>,
  indexes: readonly [number, number],
) {
  return indexes.every((index) => outcomes[index]?.outcome === "allowed")
}

async function getPublicCustomerEntryPointInTransaction(
  db: CustomerChannelsClient,
  input: { publicToken: string },
) {
  let entryPoint = await db.customerEntryPoint.findFirst({
    select: {
      store: { select: { name: true } },
      storeId: true,
      tenantId: true,
    },
    where: {
      publicTokenDigest: digest(input.publicToken),
      status: "PUBLISHED",
    },
  })
  if (!entryPoint) {
    const actionDelegate = (
      db as CustomerChannelsClient & {
        serviceCommerceCustomerActionCapability?: CustomerChannelsClient["serviceCommerceCustomerActionCapability"]
      }
    ).serviceCommerceCustomerActionCapability
    const action = actionDelegate
      ? await actionDelegate.findFirst({
          where: {
            action: "TALK_TO_STAFF",
            expiresAt: { gt: new Date() },
            status: { in: ["ACTIVE", "CONSUMED"] },
            targetType: "CUSTOMER_ENTRY_POINT",
            tokenDigest: digest(input.publicToken),
          },
        })
      : null
    if (
      action &&
      (await revalidateCustomerActionCapabilityInTransaction(db, action))
    ) {
      entryPoint = await db.customerEntryPoint.findFirst({
        select: {
          store: { select: { name: true } },
          storeId: true,
          tenantId: true,
        },
        where: {
          id: action.targetId,
          status: "PUBLISHED",
          storeId: action.storeId,
          tenantId: action.tenantId,
        },
      })
    }
  }
  if (!entryPoint) {
    throw new CustomerChannelsError(
      "NOT_FOUND",
      "This customer entry point is unavailable.",
    )
  }
  const [profile, bindings, attendant, outcomes] = await Promise.all([
    db.serviceCommerceStoreProfile.findFirst({
      select: {
        intakeEnabled: true,
        status: true,
        webEnabled: true,
        whatsappEnabled: true,
      },
      where: {
        storeId: entryPoint.storeId,
        tenantId: entryPoint.tenantId,
      },
    }),
    db.whatsAppStoreBinding.findMany({
      select: { connection: { select: { status: true } }, status: true },
      where: {
        connection: { tenantId: entryPoint.tenantId },
        storeId: entryPoint.storeId,
        tenantId: entryPoint.tenantId,
      },
    }),
    db.serviceCommerceStoreTeamAssignment.findFirst({
      select: { id: true },
      where: {
        capability: "ATTENDANT",
        membership: {
          acceptedAt: { not: null },
          status: "ACTIVE",
          tenantId: entryPoint.tenantId,
        },
        status: "ACTIVE",
        storeId: entryPoint.storeId,
        tenantId: entryPoint.tenantId,
      },
    }),
    evaluateServiceCommercePolicyBatchInTransaction(db, {
      actorUserId: "public_customer_entry",
      purpose: "customer_entry_point_projection",
      scopes: [
        { channel: "web", subject: "web", vertical: "service" },
        { channel: "web", subject: "intake", vertical: "service" },
        { channel: "web", subject: "web", vertical: "pharmacy" },
        { channel: "web", subject: "intake", vertical: "pharmacy" },
        { channel: "whatsapp", subject: "whatsapp", vertical: "service" },
        { channel: "whatsapp", subject: "intake", vertical: "service" },
        { channel: "whatsapp", subject: "whatsapp", vertical: "pharmacy" },
        { channel: "whatsapp", subject: "intake", vertical: "pharmacy" },
      ],
      storeId: entryPoint.storeId,
      tenantId: entryPoint.tenantId,
    }),
  ])
  const profileReady =
    profile?.status === "ACTIVE" && profile.intakeEnabled && Boolean(attendant)
  const actions: ServiceCommercePublicEntryAction[] = []
  const webVerticals = {
    pharmacy:
      Boolean(profileReady && profile?.webEnabled) &&
      policyAllows(outcomes, [2, 3]),
    service:
      Boolean(profileReady && profile?.webEnabled) &&
      policyAllows(outcomes, [0, 1]),
  }
  const webAllowed = webVerticals.service || webVerticals.pharmacy
  if (webAllowed) {
    actions.push("request_online")
  }
  const activeWhatsAppBindings = bindings.filter(
    (binding) =>
      binding.status === "ACTIVE" && binding.connection.status === "ACTIVE",
  )
  const whatsappAllowed = policyAllows(outcomes, [4, 5])
  if (
    profileReady &&
    profile.whatsappEnabled &&
    activeWhatsAppBindings.length === 1 &&
    whatsappAllowed
  ) {
    actions.push("chat_on_whatsapp")
  }
  const requestKinds = [
    ...(webVerticals.service ? (["product_inquiry"] as const) : []),
    ...(webVerticals.pharmacy ? (["prescription"] as const) : []),
  ]
  return {
    actions,
    requestKinds,
    storeName: entryPoint.store.name,
    webVerticals,
  }
}

export async function getPublicCustomerEntryPoint(
  db: PrismaClient,
  input: { publicToken: string },
) {
  return db.$transaction(async (tx) => {
    const { actions, requestKinds, storeName } =
      await getPublicCustomerEntryPointInTransaction(tx, input)
    return { actions, requestKinds, storeName }
  })
}

export async function resolveCustomerEntryPointPrescriptionRedirect(
  db: PrismaClient,
  input: { publicToken: string },
) {
  return db.$transaction(async (tx) => {
    const projection = await getPublicCustomerEntryPointInTransaction(tx, input)
    if (!projection.webVerticals.pharmacy) {
      throw new CustomerChannelsError(
        "NOT_FOUND",
        "Prescription intake is unavailable for this customer entry point.",
      )
    }
    const entryPoint = await tx.customerEntryPoint.findFirst({
      select: { storeId: true, tenantId: true },
      where: {
        publicTokenDigest: digest(input.publicToken),
        status: "PUBLISHED",
      },
    })
    const channel = entryPoint
      ? await tx.prescriptionChannel.findFirst({
          select: { publicToken: true },
          where: {
            status: "ACTIVE",
            storeId: entryPoint.storeId,
            tenantId: entryPoint.tenantId,
            webEnabled: true,
            store: { prescriptionSettings: { status: "ACTIVE" } },
          },
        })
      : null
    if (!channel) {
      throw new CustomerChannelsError(
        "NOT_FOUND",
        "Prescription intake is unavailable for this customer entry point.",
      )
    }
    return channel
  })
}

export async function resolveCustomerEntryPointIntakeContext(
  db: PrismaClient,
  input: { publicToken: string },
) {
  return db.$transaction(async (tx) => {
    const projection = await getPublicCustomerEntryPointInTransaction(tx, input)
    if (!projection.actions.includes("request_online")) {
      throw new CustomerChannelsError(
        "NOT_FOUND",
        "Online requests are unavailable for this customer entry point.",
      )
    }
    const entryPoint = await tx.customerEntryPoint.findFirst({
      select: { id: true, revision: true, storeId: true, tenantId: true },
      where: {
        publicTokenDigest: digest(input.publicToken),
        status: "PUBLISHED",
      },
    })
    if (!entryPoint) {
      throw new CustomerChannelsError(
        "NOT_FOUND",
        "This customer entry point is unavailable.",
      )
    }
    return { ...entryPoint, webVerticals: projection.webVerticals }
  })
}

export async function resolveCustomerEntryPointWhatsAppRedirect(
  db: PrismaClient,
  input: { publicToken: string },
) {
  return db.$transaction(async (tx) => {
    const projection = await getPublicCustomerEntryPointInTransaction(tx, input)
    if (!projection.actions.includes("chat_on_whatsapp")) {
      throw new CustomerChannelsError(
        "NOT_FOUND",
        "WhatsApp is unavailable for this customer entry point.",
      )
    }
    const entryPoint = await tx.customerEntryPoint.findFirst({
      select: { storeId: true, tenantId: true },
      where: {
        publicTokenDigest: digest(input.publicToken),
        status: "PUBLISHED",
      },
    })
    if (!entryPoint) {
      throw new CustomerChannelsError(
        "NOT_FOUND",
        "This customer entry point is unavailable.",
      )
    }
    const bindings = await tx.whatsAppStoreBinding.findMany({
      select: {
        connection: { select: { displayNumber: true, status: true } },
        status: true,
      },
      where: {
        connection: { status: "ACTIVE", tenantId: entryPoint.tenantId },
        status: "ACTIVE",
        storeId: entryPoint.storeId,
        tenantId: entryPoint.tenantId,
      },
    })
    if (bindings.length !== 1) {
      throw new CustomerChannelsError(
        "NOT_FOUND",
        "WhatsApp routing is unavailable for this customer entry point.",
      )
    }
    return {
      contextToken: input.publicToken,
      displayNumber: bindings[0]?.connection.displayNumber ?? "",
    }
  })
}

// Stable business-neutral exports. Existing WhatsApp query names remain as
// expand-contract compatibility for Prescription callers until contraction.
export {
  completePendingWhatsAppEmbeddedSignupSession as completeCustomerChannelEmbeddedSignup,
  createWhatsAppEmbeddedSignupSession as createCustomerChannelEmbeddedSignupSession,
  getPendingWhatsAppEmbeddedSignupSession as getCustomerChannelEmbeddedSignupSession,
  listWhatsAppConnections as listCustomerChannelConnections,
  recordWhatsAppConnectionTest as recordCustomerChannelConnectionTest,
  setWhatsAppConnectionLifecycle as setCustomerChannelConnectionLifecycle,
  upsertManualWhatsAppConnection as saveCustomerWhatsAppConnectionCandidate,
} from "./whatsapp-connections"
