import {
  SERVICE_COMMERCE_CAPABILITIES,
  type ServiceCommerceCapability,
  type ServiceCommercePolicySubject,
  type ServiceCommerceProfileConfiguration,
  type ServiceCommerceProfileSettings,
  deriveServiceCommerceReadiness,
  getServiceCommerceRuntimeActivationBlockers,
  serviceCommerceCapabilitySchema,
  serviceCommerceChangeReasonSchema,
  serviceCommerceProfileSettingsSchema,
} from "@ewatrade/service-commerce"
import { Prisma } from "../../generated/prisma/client"
import {
  MembershipRole,
  MembershipStatus,
  ServiceCommerceCatalogAdoptionMode,
  ServiceCommerceProfileStatus,
  ServiceCommerceStoreAuditEventType,
  StoreStatus,
  WhatsAppBindingStatus,
  WhatsAppConnectionStatus,
} from "../../generated/prisma/enums"
import { evaluateServiceCommercePolicyBatchInTransaction } from "./service-commerce-policy"
import type { DbClient } from "./types"

const configurationDefaults: ServiceCommerceProfileConfiguration = {
  capabilities: {
    booking: false,
    delivery: false,
    intake: false,
    payment: false,
    pickup: false,
    progressive_catalog: false,
    quote: false,
    service_completion: false,
    staff: false,
    web: false,
    whatsapp: false,
  },
  catalogAdoptionMode: "progressive",
  procureToOrderEnabled: false,
  status: "disabled",
}

type PersistedProfile = {
  bookingEnabled: boolean
  catalogAdoptionMode: ServiceCommerceCatalogAdoptionMode
  deliveryEnabled: boolean
  id: string
  intakeEnabled: boolean
  paymentEnabled: boolean
  pickupEnabled: boolean
  policyRestrictedCapabilities: string[]
  procureToOrderEnabled: boolean
  progressiveCatalogEnabled: boolean
  quoteEnabled: boolean
  revision: number
  serviceCompletionEnabled: boolean
  staffEnabled: boolean
  status: ServiceCommerceProfileStatus
  webEnabled: boolean
  whatsappEnabled: boolean
}

export class ServiceCommerceAccessError extends Error {
  constructor(
    readonly code:
      | "ACTIVATION_BLOCKED"
      | "CONFLICT"
      | "FORBIDDEN"
      | "NOT_FOUND",
    message: string,
  ) {
    super(message)
    this.name = "ServiceCommerceAccessError"
  }
}

function mapProfileStatus(status: ServiceCommerceProfileStatus) {
  if (status === ServiceCommerceProfileStatus.ACTIVE) return "active" as const
  if (status === ServiceCommerceProfileStatus.SUSPENDED) {
    return "suspended" as const
  }
  return "disabled" as const
}

function mapCatalogMode(mode: ServiceCommerceCatalogAdoptionMode) {
  return mode === ServiceCommerceCatalogAdoptionMode.INVENTORY_MANAGED
    ? ("inventory_managed" as const)
    : ("progressive" as const)
}

function mapPersistedProfile(
  profile: PersistedProfile | null,
): ServiceCommerceProfileConfiguration {
  if (!profile) return configurationDefaults
  return {
    capabilities: {
      booking: profile.bookingEnabled,
      delivery: profile.deliveryEnabled,
      intake: profile.intakeEnabled,
      payment: profile.paymentEnabled,
      pickup: profile.pickupEnabled,
      progressive_catalog: profile.progressiveCatalogEnabled,
      quote: profile.quoteEnabled,
      service_completion: profile.serviceCompletionEnabled,
      staff: profile.staffEnabled,
      web: profile.webEnabled,
      whatsapp: profile.whatsappEnabled,
    },
    catalogAdoptionMode: mapCatalogMode(profile.catalogAdoptionMode),
    procureToOrderEnabled: profile.procureToOrderEnabled,
    status: mapProfileStatus(profile.status),
  }
}

function toPersistence(settings: ServiceCommerceProfileSettings) {
  return {
    bookingEnabled: settings.capabilities.booking,
    catalogAdoptionMode:
      settings.catalogAdoptionMode === "inventory_managed"
        ? ServiceCommerceCatalogAdoptionMode.INVENTORY_MANAGED
        : ServiceCommerceCatalogAdoptionMode.PROGRESSIVE,
    deliveryEnabled: settings.capabilities.delivery,
    intakeEnabled: settings.capabilities.intake,
    paymentEnabled: settings.capabilities.payment,
    pickupEnabled: settings.capabilities.pickup,
    procureToOrderEnabled: settings.procureToOrderEnabled,
    progressiveCatalogEnabled: settings.capabilities.progressive_catalog,
    quoteEnabled: settings.capabilities.quote,
    serviceCompletionEnabled: settings.capabilities.service_completion,
    staffEnabled: settings.capabilities.staff,
    webEnabled: settings.capabilities.web,
    whatsappEnabled: settings.capabilities.whatsapp,
  }
}

function snapshot(profile: PersistedProfile) {
  return { revision: profile.revision, ...mapPersistedProfile(profile) }
}

function readPolicyRestrictedCapabilities(
  profile: PersistedProfile | null,
  configuration: ServiceCommerceProfileConfiguration,
): ServiceCommerceCapability[] {
  if (!profile) return []
  const parsed = serviceCommerceCapabilitySchema
    .array()
    .safeParse(profile.policyRestrictedCapabilities)
  if (parsed.success) return [...new Set(parsed.data)]

  return SERVICE_COMMERCE_CAPABILITIES.filter(
    (capability) => configuration.capabilities[capability],
  )
}

type ServiceCommerceReadinessFacts = {
  providerUnavailable: ServiceCommerceCapability[]
  restricted: ServiceCommerceCapability[]
  setupRequired: ServiceCommerceCapability[]
  trackedInventoryReady: boolean
}

async function resolveServiceCommerceReadinessFacts(
  db: DbClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
  configuration: ServiceCommerceProfileConfiguration,
  profile: PersistedProfile | null,
): Promise<ServiceCommerceReadinessFacts> {
  const [trackedInventory, whatsappBindings] = await Promise.all([
    db.stockBalanceSource.findFirst({
      select: { id: true },
      where: { storeId: input.storeId, tenantId: input.tenantId },
    }),
    configuration.capabilities.whatsapp
      ? db.whatsAppStoreBinding.findMany({
          orderBy: { updatedAt: "desc" },
          select: {
            connection: { select: { status: true } },
            id: true,
            status: true,
          },
          where: {
            connection: { tenantId: input.tenantId },
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
      : Promise.resolve([]),
  ])
  const setupRequired: ServiceCommerceCapability[] = []
  const providerUnavailable: ServiceCommerceCapability[] = []
  if (configuration.capabilities.booking) setupRequired.push("booking")
  if (configuration.capabilities.pickup) setupRequired.push("pickup")
  if (configuration.capabilities.delivery) setupRequired.push("delivery")
  if (configuration.capabilities.whatsapp && whatsappBindings.length === 0) {
    setupRequired.push("whatsapp")
  }
  if (
    configuration.capabilities.whatsapp &&
    whatsappBindings.length > 0 &&
    !whatsappBindings.some(
      (binding) =>
        binding.status === WhatsAppBindingStatus.ACTIVE &&
        binding.connection.status === WhatsAppConnectionStatus.ACTIVE,
    )
  ) {
    providerUnavailable.push("whatsapp")
  }

  const configuredChannels = (["staff", "web", "whatsapp"] as const).filter(
    (channel) => configuration.capabilities[channel],
  )
  const policyScopes: Array<{
    capability: ServiceCommerceCapability
    channel: (typeof configuredChannels)[number]
    subject: ServiceCommercePolicySubject
    vertical: "pharmacy" | "service"
  }> = []
  for (const capability of SERVICE_COMMERCE_CAPABILITIES) {
    if (!configuration.capabilities[capability]) continue
    const channels =
      capability === "staff" ||
      capability === "web" ||
      capability === "whatsapp"
        ? [capability]
        : configuredChannels
    for (const channel of channels) {
      for (const vertical of ["service", "pharmacy"] as const) {
        policyScopes.push({
          capability,
          channel,
          subject: capability,
          vertical,
        })
      }
    }
  }
  const policyEvaluations =
    policyScopes.length > 0
      ? await evaluateServiceCommercePolicyBatchInTransaction(db, {
          actorUserId: input.actorUserId,
          purpose: "service_commerce_readiness",
          scopes: policyScopes,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
      : []
  const policyRestricted = SERVICE_COMMERCE_CAPABILITIES.filter(
    (capability) =>
      configuration.capabilities[capability] &&
      policyScopes.some((scope) => scope.capability === capability) &&
      !policyScopes.some(
        (scope, index) =>
          scope.capability === capability &&
          policyEvaluations[index]?.outcome === "allowed",
      ),
  )

  return {
    providerUnavailable,
    restricted: [
      ...new Set([
        ...readPolicyRestrictedCapabilities(profile, configuration),
        ...policyRestricted,
      ]),
    ],
    setupRequired,
    trackedInventoryReady: Boolean(trackedInventory),
  }
}

function deriveStoredReadiness(
  configuration: ServiceCommerceProfileConfiguration,
  facts: ServiceCommerceReadinessFacts,
  storeActive: boolean,
) {
  return deriveServiceCommerceReadiness({
    configuration,
    ...facts,
    storeActive,
  })
}

function deriveStoredActivationBlockers(
  configuration: ServiceCommerceProfileConfiguration,
  facts: ServiceCommerceReadinessFacts,
  storeActive: boolean,
) {
  const activeConfiguration = { ...configuration, status: "active" as const }
  return getServiceCommerceRuntimeActivationBlockers({
    configuration: activeConfiguration,
    readiness: deriveStoredReadiness(activeConfiguration, facts, storeActive),
    storeActive,
  })
}

function roleAccess(role: MembershipRole) {
  const canManage =
    role === MembershipRole.OWNER || role === MembershipRole.ADMIN
  const canOperate =
    canManage ||
    role === MembershipRole.MANAGER ||
    role === MembershipRole.CASHIER ||
    role === MembershipRole.OPERATOR
  return { canManage, canOperate, exceptionalAccess: false }
}

async function resolveActorStore(
  db: DbClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  const [membership, store] = await Promise.all([
    db.membership.findFirst({
      select: { role: true },
      where: {
        status: MembershipStatus.ACTIVE,
        tenantId: input.tenantId,
        userId: input.actorUserId,
      },
    }),
    db.store.findFirst({
      include: { serviceCommerceProfile: true },
      where: { id: input.storeId, tenantId: input.tenantId },
    }),
  ])
  if (!membership) {
    throw new ServiceCommerceAccessError(
      "FORBIDDEN",
      "Service Commerce access is unavailable.",
    )
  }
  if (!store) {
    throw new ServiceCommerceAccessError("NOT_FOUND", "Store not found.")
  }
  return { access: roleAccess(membership.role), store }
}

export async function getServiceCommerceWorkspaceAccess(
  db: DbClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  const { access, store } = await resolveActorStore(db, input)
  const configuration = mapPersistedProfile(store.serviceCommerceProfile)
  const readinessFacts = await resolveServiceCommerceReadinessFacts(
    db,
    input,
    configuration,
    store.serviceCommerceProfile,
  )
  const storeActive = store.status === StoreStatus.ACTIVE
  const readiness = deriveStoredReadiness(
    configuration,
    readinessFacts,
    storeActive,
  )

  return {
    access,
    activationBlockers: deriveStoredActivationBlockers(
      configuration,
      readinessFacts,
      storeActive,
    ),
    billingOwner: "tenant" as const,
    canCreateAssistedRequest:
      access.canOperate &&
      readiness.capabilities.intake.readiness === "available" &&
      (["web", "staff", "whatsapp"] as const).some(
        (capability) =>
          readiness.capabilities[capability].readiness === "available",
      ),
    configuration,
    readiness,
    revision: store.serviceCommerceProfile?.revision ?? 0,
    store: {
      id: store.id,
      name: store.name,
      status: store.status.toLowerCase(),
    },
  }
}

export async function updateServiceCommerceStoreProfile(
  db: DbClient,
  input: {
    actorUserId: string
    expectedRevision: number
    reason: string
    settings: ServiceCommerceProfileSettings
    storeId: string
    tenantId: string
  },
) {
  const parsedReason = serviceCommerceChangeReasonSchema.safeParse(input.reason)
  const parsedSettings = serviceCommerceProfileSettingsSchema.safeParse(
    input.settings,
  )
  if (!parsedReason.success) {
    throw new ServiceCommerceAccessError("CONFLICT", "A reason is required.")
  }
  if (!parsedSettings.success) {
    throw new ServiceCommerceAccessError(
      "CONFLICT",
      "Service Commerce settings are invalid.",
    )
  }
  const reason = parsedReason.data
  const settings = parsedSettings.data

  try {
    await db.$transaction(async (tx) => {
      const { access, store } = await resolveActorStore(tx, input)
      if (!access.canManage) {
        throw new ServiceCommerceAccessError(
          "FORBIDDEN",
          "Only a Tenant owner or admin can configure Service Commerce.",
        )
      }
      const existing = store.serviceCommerceProfile
      if (existing?.status === ServiceCommerceProfileStatus.ACTIVE) {
        const configuration = { ...settings, status: "active" as const }
        const readinessFacts = await resolveServiceCommerceReadinessFacts(
          tx,
          input,
          configuration,
          existing,
        )
        const blockers = deriveStoredActivationBlockers(
          configuration,
          readinessFacts,
          store.status === StoreStatus.ACTIVE,
        )
        if (blockers.length > 0) {
          throw new ServiceCommerceAccessError(
            "ACTIVATION_BLOCKED",
            `Active Service Commerce settings are not ready: ${blockers.join(", ")}.`,
          )
        }
      }
      let profile: PersistedProfile
      let eventType: ServiceCommerceStoreAuditEventType
      if (existing) {
        const updated = await tx.serviceCommerceStoreProfile.updateMany({
          data: { ...toPersistence(settings), revision: { increment: 1 } },
          where: {
            id: existing.id,
            revision: input.expectedRevision,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
        if (updated.count !== 1) {
          throw new ServiceCommerceAccessError(
            "CONFLICT",
            "Service Commerce settings changed. Refresh and try again.",
          )
        }
        profile = await tx.serviceCommerceStoreProfile.findFirstOrThrow({
          where: {
            id: existing.id,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
        eventType = ServiceCommerceStoreAuditEventType.SETTINGS_UPDATED
      } else {
        if (input.expectedRevision !== 0) {
          throw new ServiceCommerceAccessError(
            "CONFLICT",
            "Service Commerce settings changed. Refresh and try again.",
          )
        }
        profile = await tx.serviceCommerceStoreProfile.create({
          data: {
            ...toPersistence(settings),
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
        eventType = ServiceCommerceStoreAuditEventType.PROFILE_CREATED
      }
      await tx.serviceCommerceStoreAuditEvent.create({
        data: {
          actorUserId: input.actorUserId,
          currentSnapshot: snapshot(profile),
          previousSnapshot: existing ? snapshot(existing) : undefined,
          profileId: profile.id,
          reason,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: eventType,
        },
      })
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ServiceCommerceAccessError(
        "CONFLICT",
        "Service Commerce settings changed. Refresh and try again.",
      )
    }
    throw error
  }
  return getServiceCommerceWorkspaceAccess(db, input)
}

export async function setServiceCommerceStoreProfileActivation(
  db: DbClient,
  input: {
    active: boolean
    actorUserId: string
    expectedRevision: number
    reason: string
    storeId: string
    tenantId: string
  },
) {
  const parsedReason = serviceCommerceChangeReasonSchema.safeParse(input.reason)
  if (!parsedReason.success) {
    throw new ServiceCommerceAccessError("CONFLICT", "A reason is required.")
  }
  const reason = parsedReason.data
  await db.$transaction(async (tx) => {
    const { access, store } = await resolveActorStore(tx, input)
    if (!access.canManage) {
      throw new ServiceCommerceAccessError(
        "FORBIDDEN",
        "Only a Tenant owner or admin can activate Service Commerce.",
      )
    }
    const existing = store.serviceCommerceProfile
    if (!existing) {
      throw new ServiceCommerceAccessError(
        "ACTIVATION_BLOCKED",
        "Save Service Commerce settings before activation.",
      )
    }
    if (existing.status === ServiceCommerceProfileStatus.SUSPENDED) {
      throw new ServiceCommerceAccessError(
        "ACTIVATION_BLOCKED",
        "A suspended Service Commerce profile requires policy-authorized resolution.",
      )
    }
    if (input.active) {
      const configuration = mapPersistedProfile(existing)
      const readinessFacts = await resolveServiceCommerceReadinessFacts(
        tx,
        input,
        configuration,
        existing,
      )
      const blockers = deriveStoredActivationBlockers(
        configuration,
        readinessFacts,
        store.status === StoreStatus.ACTIVE,
      )
      if (blockers.length > 0) {
        throw new ServiceCommerceAccessError(
          "ACTIVATION_BLOCKED",
          `Service Commerce is not ready: ${blockers.join(", ")}.`,
        )
      }
    }
    const changedAt = new Date()
    const status = input.active
      ? ServiceCommerceProfileStatus.ACTIVE
      : ServiceCommerceProfileStatus.DISABLED
    const updated = await tx.serviceCommerceStoreProfile.updateMany({
      data: {
        activatedAt: input.active ? changedAt : existing.activatedAt,
        activatedByUserId: input.active
          ? input.actorUserId
          : existing.activatedByUserId,
        deactivatedAt: input.active ? null : changedAt,
        deactivatedByUserId: input.active ? null : input.actorUserId,
        revision: { increment: 1 },
        status,
      },
      where: {
        id: existing.id,
        revision: input.expectedRevision,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (updated.count !== 1) {
      throw new ServiceCommerceAccessError(
        "CONFLICT",
        "Service Commerce settings changed. Refresh and try again.",
      )
    }
    const profile = await tx.serviceCommerceStoreProfile.findFirstOrThrow({
      where: {
        id: existing.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.serviceCommerceStoreAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        currentSnapshot: snapshot(profile),
        previousSnapshot: snapshot(existing),
        profileId: profile.id,
        reason,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: input.active
          ? ServiceCommerceStoreAuditEventType.ACTIVATED
          : ServiceCommerceStoreAuditEventType.DEACTIVATED,
      },
    })
  })
  return getServiceCommerceWorkspaceAccess(db, input)
}
