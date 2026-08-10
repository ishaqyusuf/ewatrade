import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  MembershipStatus,
  PrescriptionCommerceStoreStatus,
  PrescriptionStoreAuditEventType,
  PrescriptionStoreRoleStatus,
  PrescriptionStoreRoleType,
} from "../../generated/prisma/enums"
import { recordPrescriptionSensitiveAccess } from "./prescription-compliance"
import { evaluateServiceCommercePolicyBatchInTransaction } from "./service-commerce-policy"

export type PrescriptionStoreRoleInput = "attendant" | "pharmacist"

export type PrescriptionCommerceErrorCode =
  | "PRESCRIPTION_NOT_ACTIVE"
  | "PRESCRIPTION_NOT_READY"
  | "PRESCRIPTION_ROLE_NOT_FOUND"
  | "PRESCRIPTION_ROLE_REQUIRED"
  | "PRESCRIPTION_SETTINGS_INVALID"
  | "PRESCRIPTION_USER_NOT_FOUND"
  | "STORE_NOT_FOUND"

export class PrescriptionCommerceError extends Error {
  readonly code: PrescriptionCommerceErrorCode

  constructor(code: PrescriptionCommerceErrorCode, message: string) {
    super(message)
    this.name = "PrescriptionCommerceError"
    this.code = code
  }
}

export type PrescriptionReadinessRequirement =
  | "attendant"
  | "contact_policy"
  | "fulfilment_mode"
  | "operating_hours"
  | "service_policy"
  | "verified_pharmacist"

export type PrescriptionStoreReadinessInput = {
  activeAttendantCount: number
  contactPolicyConfigured: boolean
  deliveryEnabled: boolean
  operatingHoursConfigured: boolean
  pickupEnabled: boolean
  servicePolicyConfigured: boolean
  verifiedPharmacistCount: number
}

export function evaluatePrescriptionStoreReadiness(
  input: PrescriptionStoreReadinessInput,
) {
  const missing: PrescriptionReadinessRequirement[] = []

  if (!input.operatingHoursConfigured) missing.push("operating_hours")
  if (!input.servicePolicyConfigured) missing.push("service_policy")
  if (!input.contactPolicyConfigured) missing.push("contact_policy")
  if (!input.pickupEnabled && !input.deliveryEnabled) {
    missing.push("fulfilment_mode")
  }
  if (input.activeAttendantCount < 1) missing.push("attendant")
  if (input.verifiedPharmacistCount < 1) {
    missing.push("verified_pharmacist")
  }

  return { missing, ready: missing.length === 0 }
}

export function validatePrescriptionRoleAssignment(input: {
  credentialReference?: string
  credentialVerified: boolean
  role: PrescriptionStoreRoleInput
}) {
  if (input.role === "attendant") {
    return { credentialReference: null, credentialVerifiedAt: null }
  }

  const credentialReference = input.credentialReference?.trim()
  if (!credentialReference) {
    throw new Error("Pharmacist assignment requires a credential reference.")
  }
  if (!input.credentialVerified) {
    throw new Error("Pharmacist credential must be verified before assignment.")
  }

  return {
    credentialReference,
    credentialVerifiedAt: new Date(),
  }
}

export type PrescriptionOperatingHours = Array<{
  closesAt?: string
  day:
    | "friday"
    | "monday"
    | "saturday"
    | "sunday"
    | "thursday"
    | "tuesday"
    | "wednesday"
  isClosed: boolean
  opensAt?: string
}>

export type UpdatePrescriptionStoreSettingsInput = {
  actorUserId: string
  consentVersion: string
  contactPolicy: string
  deliveryEnabled: boolean
  operatingHours: PrescriptionOperatingHours
  pickupEnabled: boolean
  servicePolicy: string
  storeId: string
  tenantId: string
}

const defaultPrescriptionStoreSettings = {
  consentVersion: null,
  contactPolicy: null,
  deliveryEnabled: false,
  operatingHours: null,
  pickupEnabled: true,
  servicePolicy: null,
  status: "disabled" as const,
}

function mapRole(role: PrescriptionStoreRoleType): PrescriptionStoreRoleInput {
  return role === PrescriptionStoreRoleType.PHARMACIST
    ? "pharmacist"
    : "attendant"
}

function mapRoleInput(role: PrescriptionStoreRoleInput) {
  return role === "pharmacist"
    ? PrescriptionStoreRoleType.PHARMACIST
    : PrescriptionStoreRoleType.ATTENDANT
}

function normalizeRequiredPolicy(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) {
    throw new PrescriptionCommerceError(
      "PRESCRIPTION_SETTINGS_INVALID",
      `${label} is required.`,
    )
  }
  return normalized
}

function serializeSettings(
  settings: {
    activatedAt: Date | null
    consentVersion: string | null
    contactPolicy: string | null
    deactivatedAt: Date | null
    deliveryEnabled: boolean
    operatingHours: Prisma.JsonValue | null
    pickupEnabled: boolean
    servicePolicy: string | null
    status: PrescriptionCommerceStoreStatus
    storeId: string
    updatedAt: Date
  } | null,
  storeId: string,
) {
  if (!settings) {
    return {
      ...defaultPrescriptionStoreSettings,
      activatedAt: null,
      deactivatedAt: null,
      storeId,
      updatedAt: null,
    }
  }

  return {
    activatedAt: settings.activatedAt,
    consentVersion: settings.consentVersion,
    contactPolicy: settings.contactPolicy,
    deactivatedAt: settings.deactivatedAt,
    deliveryEnabled: settings.deliveryEnabled,
    operatingHours: settings.operatingHours,
    pickupEnabled: settings.pickupEnabled,
    servicePolicy: settings.servicePolicy,
    status:
      settings.status === PrescriptionCommerceStoreStatus.ACTIVE
        ? ("active" as const)
        : settings.status === PrescriptionCommerceStoreStatus.SUSPENDED
          ? ("suspended" as const)
          : ("disabled" as const),
    storeId: settings.storeId,
    updatedAt: settings.updatedAt,
  }
}

async function requireStore(
  db: PrismaClient | Prisma.TransactionClient,
  input: { storeId: string; tenantId: string },
) {
  const store = await db.store.findFirst({
    select: { id: true, name: true },
    where: { id: input.storeId, tenantId: input.tenantId },
  })
  if (!store) {
    throw new PrescriptionCommerceError("STORE_NOT_FOUND", "Store not found.")
  }
  return store
}

async function ensureSettings(
  db: Prisma.TransactionClient,
  input: { storeId: string; tenantId: string },
) {
  return db.prescriptionStoreSettings.upsert({
    create: { storeId: input.storeId, tenantId: input.tenantId },
    update: {},
    where: { storeId: input.storeId },
  })
}

function evaluateStoredReadiness(input: {
  roles: Array<{
    credentialReference: string | null
    credentialVerifiedAt: Date | null
    role: PrescriptionStoreRoleType
    status: PrescriptionStoreRoleStatus
  }>
  settings: {
    contactPolicy: string | null
    deliveryEnabled: boolean
    operatingHours: Prisma.JsonValue | null
    pickupEnabled: boolean
    servicePolicy: string | null
  } | null
}) {
  const activeRoles = input.roles.filter(
    (role) => role.status === PrescriptionStoreRoleStatus.ACTIVE,
  )
  return evaluatePrescriptionStoreReadiness({
    activeAttendantCount: activeRoles.filter(
      (role) => role.role === PrescriptionStoreRoleType.ATTENDANT,
    ).length,
    contactPolicyConfigured: Boolean(input.settings?.contactPolicy?.trim()),
    deliveryEnabled: input.settings?.deliveryEnabled ?? false,
    operatingHoursConfigured:
      Array.isArray(input.settings?.operatingHours) &&
      input.settings.operatingHours.length > 0,
    pickupEnabled: input.settings?.pickupEnabled ?? false,
    servicePolicyConfigured: Boolean(input.settings?.servicePolicy?.trim()),
    verifiedPharmacistCount: activeRoles.filter(
      (role) =>
        role.role === PrescriptionStoreRoleType.PHARMACIST &&
        Boolean(role.credentialReference) &&
        Boolean(role.credentialVerifiedAt),
    ).length,
  })
}

export async function getPrescriptionStoreSetup(
  db: PrismaClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  const store = await requireStore(db, input)
  const [settings, roles, memberships, auditEvents] = await Promise.all([
    db.prescriptionStoreSettings.findUnique({
      where: { storeId: store.id },
    }),
    db.prescriptionStoreRole.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      where: { storeId: store.id, tenantId: input.tenantId },
    }),
    db.membership.findMany({
      include: {
        user: {
          select: { displayName: true, email: true, id: true, name: true },
        },
      },
      orderBy: { createdAt: "asc" },
      where: {
        status: MembershipStatus.ACTIVE,
        tenantId: input.tenantId,
      },
    }),
    db.prescriptionStoreAuditEvent.findMany({
      orderBy: { effectiveAt: "desc" },
      take: 50,
      where: { storeId: store.id, tenantId: input.tenantId },
    }),
  ])
  const membersById = new Map(
    memberships.map((membership) => [membership.userId, membership]),
  )
  const readiness = evaluateStoredReadiness({ roles, settings })
  if (roles.some((role) => role.credentialReference)) {
    await recordPrescriptionSensitiveAccess(db, {
      accessTypes: ["credential"],
      actorUserId: input.actorUserId,
      reason: "prescription_store_setup",
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
  }

  return {
    auditEvents: auditEvents.map((event) => ({
      actorUserId: event.actorUserId,
      effectiveAt: event.effectiveAt,
      id: event.id,
      subjectUserId: event.subjectUserId,
      type: event.type.toLowerCase(),
    })),
    eligibleMembers: memberships.map((membership) => ({
      email: membership.user.email,
      id: membership.user.id,
      name:
        membership.user.displayName ??
        membership.user.name ??
        membership.user.email,
      tenantRole: membership.role.toLowerCase(),
    })),
    readiness,
    roles: roles.map((role) => {
      const member = membersById.get(role.userId)
      return {
        credentialReference: role.credentialReference,
        credentialVerifiedAt: role.credentialVerifiedAt,
        id: role.id,
        role: mapRole(role.role),
        status: role.status.toLowerCase(),
        user: {
          email: member?.user.email ?? null,
          id: role.userId,
          name:
            member?.user.displayName ??
            member?.user.name ??
            member?.user.email ??
            "Former team member",
        },
      }
    }),
    settings: serializeSettings(settings, store.id),
    store,
  }
}

export async function getPrescriptionQueueContext(
  db: PrismaClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  const store = await requireStore(db, input)
  const [settings, roles, activeBreakGlass] = await Promise.all([
    db.prescriptionStoreSettings.findUnique({ where: { storeId: store.id } }),
    db.prescriptionStoreRole.findMany({
      where: {
        status: PrescriptionStoreRoleStatus.ACTIVE,
        storeId: store.id,
        tenantId: input.tenantId,
      },
    }),
    db.prescriptionIncidentControl.findFirst({
      select: { expiresAt: true, id: true, reason: true },
      where: {
        activatedByUserId: input.actorUserId,
        expiresAt: { gt: new Date() },
        status: "ACTIVE",
        storeId: store.id,
        tenantId: input.tenantId,
        type: "BREAK_GLASS",
      },
    }),
  ])
  const userIds = [...new Set(roles.map((role) => role.userId))]
  const memberships = await db.membership.findMany({
    include: {
      user: {
        select: { displayName: true, email: true, id: true, name: true },
      },
    },
    where: {
      status: MembershipStatus.ACTIVE,
      tenantId: input.tenantId,
      userId: { in: userIds },
    },
  })
  const memberByUserId = new Map(
    memberships.map((membership) => [membership.userId, membership]),
  )
  return {
    activeBreakGlass,
    assignees: userIds.map((userId) => {
      const membership = memberByUserId.get(userId)
      return {
        id: userId,
        name:
          membership?.user.displayName ??
          membership?.user.name ??
          membership?.user.email ??
          "Former team member",
        roles: roles
          .filter((role) => role.userId === userId)
          .map((role) => mapRole(role.role)),
      }
    }),
    readiness: evaluateStoredReadiness({ roles, settings }),
    status: settings?.status.toLowerCase() ?? "disabled",
  }
}

export async function updatePrescriptionStoreSettings(
  db: PrismaClient,
  input: UpdatePrescriptionStoreSettingsInput,
) {
  await requireStore(db, input)
  const servicePolicy = normalizeRequiredPolicy(
    input.servicePolicy,
    "Service policy",
  )
  const contactPolicy = normalizeRequiredPolicy(
    input.contactPolicy,
    "Customer contact policy",
  )
  const consentVersion = normalizeRequiredPolicy(
    input.consentVersion,
    "Consent version",
  )
  if (input.operatingHours.length < 1) {
    throw new PrescriptionCommerceError(
      "PRESCRIPTION_SETTINGS_INVALID",
      "At least one operating-hours entry is required.",
    )
  }
  if (!input.pickupEnabled && !input.deliveryEnabled) {
    throw new PrescriptionCommerceError(
      "PRESCRIPTION_SETTINGS_INVALID",
      "Enable pickup, delivery, or both.",
    )
  }

  await db.$transaction(async (tx) => {
    const settings = await tx.prescriptionStoreSettings.upsert({
      create: {
        consentVersion,
        contactPolicy,
        deliveryEnabled: input.deliveryEnabled,
        operatingHours: input.operatingHours,
        pickupEnabled: input.pickupEnabled,
        servicePolicy,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      update: {
        consentVersion,
        contactPolicy,
        deliveryEnabled: input.deliveryEnabled,
        operatingHours: input.operatingHours,
        pickupEnabled: input.pickupEnabled,
        servicePolicy,
      },
      where: { storeId: input.storeId },
    })
    await tx.prescriptionStoreAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        payload: {
          consentVersion,
          deliveryEnabled: input.deliveryEnabled,
          pickupEnabled: input.pickupEnabled,
        },
        settingsId: settings.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: PrescriptionStoreAuditEventType.SETTINGS_UPDATED,
      },
    })
  })

  return getPrescriptionStoreSetup(db, input)
}

export async function assignPrescriptionStoreRole(
  db: PrismaClient,
  input: {
    actorUserId: string
    credentialReference?: string
    credentialVerified: boolean
    role: PrescriptionStoreRoleInput
    storeId: string
    tenantId: string
    userId: string
  },
) {
  await requireStore(db, input)
  const membership = await db.membership.findFirst({
    select: { id: true },
    where: {
      status: MembershipStatus.ACTIVE,
      tenantId: input.tenantId,
      userId: input.userId,
    },
  })
  if (!membership) {
    throw new PrescriptionCommerceError(
      "PRESCRIPTION_USER_NOT_FOUND",
      "Select an active team member.",
    )
  }
  const credential = validatePrescriptionRoleAssignment(input)
  const role = mapRoleInput(input.role)

  await db.$transaction(async (tx) => {
    const settings = await ensureSettings(tx, input)
    await tx.prescriptionStoreRole.upsert({
      create: {
        assignedByUserId: input.actorUserId,
        credentialReference: credential.credentialReference,
        credentialVerifiedAt: credential.credentialVerifiedAt,
        credentialVerifiedByUserId:
          credential.credentialVerifiedAt === null ? null : input.actorUserId,
        role,
        storeId: input.storeId,
        tenantId: input.tenantId,
        userId: input.userId,
      },
      update: {
        assignedByUserId: input.actorUserId,
        credentialReference: credential.credentialReference,
        credentialVerifiedAt: credential.credentialVerifiedAt,
        credentialVerifiedByUserId:
          credential.credentialVerifiedAt === null ? null : input.actorUserId,
        revokedAt: null,
        revokedByUserId: null,
        status: PrescriptionStoreRoleStatus.ACTIVE,
      },
      where: {
        storeId_userId_role: {
          role,
          storeId: input.storeId,
          userId: input.userId,
        },
      },
    })
    await tx.prescriptionStoreAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        payload: { role: input.role },
        settingsId: settings.id,
        storeId: input.storeId,
        subjectUserId: input.userId,
        tenantId: input.tenantId,
        type: PrescriptionStoreAuditEventType.ROLE_ASSIGNED,
      },
    })
  })

  return getPrescriptionStoreSetup(db, input)
}

export async function revokePrescriptionStoreRole(
  db: PrismaClient,
  input: {
    actorUserId: string
    roleId: string
    storeId: string
    tenantId: string
  },
) {
  await requireStore(db, input)
  await db.$transaction(async (tx) => {
    const role = await tx.prescriptionStoreRole.findFirst({
      where: {
        id: input.roleId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!role) {
      throw new PrescriptionCommerceError(
        "PRESCRIPTION_ROLE_NOT_FOUND",
        "Prescription role not found.",
      )
    }
    const settings = await ensureSettings(tx, input)
    await tx.prescriptionStoreRole.update({
      data: {
        revokedAt: new Date(),
        revokedByUserId: input.actorUserId,
        status: PrescriptionStoreRoleStatus.REVOKED,
      },
      where: { id: role.id },
    })
    await tx.prescriptionStoreAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        payload: { role: mapRole(role.role) },
        settingsId: settings.id,
        storeId: input.storeId,
        subjectUserId: role.userId,
        tenantId: input.tenantId,
        type: PrescriptionStoreAuditEventType.ROLE_REVOKED,
      },
    })
  })

  return getPrescriptionStoreSetup(db, input)
}

export async function setPrescriptionStoreActivation(
  db: PrismaClient,
  input: {
    active: boolean
    actorUserId: string
    storeId: string
    tenantId: string
  },
) {
  await requireStore(db, input)
  await db.$transaction(async (tx) => {
    const settings = await ensureSettings(tx, input)
    if (input.active) {
      const blockingIncident = await tx.prescriptionIncidentControl.findFirst({
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          status: "ACTIVE",
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: { in: ["FREEZE_PROCESSING", "SUSPEND_COMMERCE"] },
        },
      })
      if (blockingIncident) {
        throw new PrescriptionCommerceError(
          "PRESCRIPTION_NOT_READY",
          "Resolve the active incident control before reactivating Prescription Commerce.",
        )
      }
      const roles = await tx.prescriptionStoreRole.findMany({
        where: { storeId: input.storeId, tenantId: input.tenantId },
      })
      const readiness = evaluateStoredReadiness({ roles, settings })
      if (!readiness.ready) {
        throw new PrescriptionCommerceError(
          "PRESCRIPTION_NOT_READY",
          `Prescription Commerce is not ready: ${readiness.missing.join(", ")}.`,
        )
      }
      const policyScopes = [
        { channel: "web" as const, subject: "web" as const },
        { channel: "staff" as const, subject: "staff" as const },
        { channel: "staff" as const, subject: "intake" as const },
        { channel: "staff" as const, subject: "quote" as const },
        { channel: "web" as const, subject: "intake" as const },
        { channel: "web" as const, subject: "quote" as const },
        { channel: "web" as const, subject: "payment" as const },
        ...(settings.pickupEnabled
          ? [
              { channel: "staff" as const, subject: "pickup" as const },
              { channel: "web" as const, subject: "pickup" as const },
            ]
          : []),
        ...(settings.deliveryEnabled
          ? [
              { channel: "staff" as const, subject: "delivery" as const },
              { channel: "web" as const, subject: "delivery" as const },
            ]
          : []),
      ].map((scope) => ({ ...scope, vertical: "pharmacy" as const }))
      const policy = await evaluateServiceCommercePolicyBatchInTransaction(tx, {
        actorUserId: input.actorUserId,
        purpose: "prescription_store_activation",
        scopes: policyScopes,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      if (policy.some((decision) => decision.outcome !== "allowed")) {
        throw new PrescriptionCommerceError(
          "PRESCRIPTION_NOT_READY",
          "Prescription Commerce policy approval is incomplete for this Store.",
        )
      }
    }

    const changedAt = new Date()
    await tx.prescriptionStoreSettings.update({
      data: input.active
        ? {
            activatedAt: changedAt,
            activatedByUserId: input.actorUserId,
            deactivatedAt: null,
            deactivatedByUserId: null,
            status: PrescriptionCommerceStoreStatus.ACTIVE,
          }
        : {
            deactivatedAt: changedAt,
            deactivatedByUserId: input.actorUserId,
            status: PrescriptionCommerceStoreStatus.DISABLED,
          },
      where: { id: settings.id },
    })
    await tx.prescriptionStoreAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        settingsId: settings.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: input.active
          ? PrescriptionStoreAuditEventType.ACTIVATED
          : PrescriptionStoreAuditEventType.DEACTIVATED,
      },
    })
  })

  return getPrescriptionStoreSetup(db, input)
}

export async function assertActivePrescriptionStore(
  db: PrismaClient | Prisma.TransactionClient,
  input: { storeId: string; tenantId: string },
) {
  const settings = await db.prescriptionStoreSettings.findFirst({
    where: {
      status: PrescriptionCommerceStoreStatus.ACTIVE,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!settings) {
    throw new PrescriptionCommerceError(
      "PRESCRIPTION_NOT_ACTIVE",
      "Prescription Commerce is not active for this Store.",
    )
  }
  return settings
}

export async function assertPrescriptionStoreRole(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    role: PrescriptionStoreRoleInput
    storeId: string
    tenantId: string
    userId: string
  },
) {
  await assertActivePrescriptionStore(db, input)
  const role = await db.prescriptionStoreRole.findFirst({
    where: {
      role: mapRoleInput(input.role),
      status: PrescriptionStoreRoleStatus.ACTIVE,
      storeId: input.storeId,
      tenantId: input.tenantId,
      userId: input.userId,
    },
  })
  if (
    !role ||
    (input.role === "pharmacist" &&
      (!role.credentialReference || !role.credentialVerifiedAt))
  ) {
    throw new PrescriptionCommerceError(
      "PRESCRIPTION_ROLE_REQUIRED",
      `An active Store-scoped ${input.role} role is required.`,
    )
  }
  return role
}

export async function assertAnyPrescriptionStoreRole(
  db: PrismaClient | Prisma.TransactionClient,
  input: { storeId: string; tenantId: string; userId: string },
) {
  await assertActivePrescriptionStore(db, input)
  const role = await db.prescriptionStoreRole.findFirst({
    where: {
      status: PrescriptionStoreRoleStatus.ACTIVE,
      storeId: input.storeId,
      tenantId: input.tenantId,
      userId: input.userId,
    },
  })
  if (!role) {
    throw new PrescriptionCommerceError(
      "PRESCRIPTION_ROLE_REQUIRED",
      "An active Store-scoped prescription role is required.",
    )
  }
  return role
}
