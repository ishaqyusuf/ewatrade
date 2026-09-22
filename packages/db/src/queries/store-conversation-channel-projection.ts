import {
  DEFAULT_STORE_CONVERSATION_WEEKLY_HOURS,
  type StoreConversationChannelBlocker,
  type StoreConversationChannelModeProjection,
  type StoreConversationDesiredMode,
  deriveStoreConversationChannelMode,
  evaluateStoreConversationAvailability,
} from "@ewatrade/service-commerce"

import { evaluateServiceCommercePolicyBatchInTransaction } from "./service-commerce-policy"
import { projectStoredStoreConversationAvailabilityConfiguration } from "./store-conversation-availability"
import { projectStoredStoreConversationDesiredMode } from "./store-conversation-channel-mode"
import type { DbClient } from "./types"

type ChannelFacts = {
  eligibleAttendant: boolean
  pharmacyConfigured: boolean
  pharmacyProfessionalReady: boolean
  pharmacyWebPolicyAllowed: boolean
  pharmacyWhatsAppPolicyAllowed: boolean
  profileReady: boolean
  serviceWebPolicyAllowed: boolean
  serviceWhatsAppPolicyAllowed: boolean
  webEnabled: boolean
  whatsappBindingCount: number
  whatsappConnectionReady: boolean
  whatsappEnabled: boolean
}

function uniqueBlockers(
  blockers: StoreConversationChannelBlocker[],
): StoreConversationChannelBlocker[] {
  return [...new Set(blockers)]
}

export function deriveStoreConversationChannelReadiness(input: {
  availability: { available: boolean }
  desiredMode: StoreConversationDesiredMode
  facts: ChannelFacts
  revision: number
}): StoreConversationChannelModeProjection {
  const chatBlockers: StoreConversationChannelBlocker[] = []
  if (!input.facts.profileReady || !input.facts.webEnabled) {
    chatBlockers.push("chat_not_configured")
  } else if (!input.availability.available) {
    chatBlockers.push("chat_unavailable")
  }

  const whatsappBlockers: StoreConversationChannelBlocker[] = []
  if (!input.facts.profileReady || !input.facts.whatsappEnabled) {
    whatsappBlockers.push("whatsapp_not_configured")
  }
  if (!input.facts.eligibleAttendant) {
    whatsappBlockers.push("whatsapp_unavailable")
  }
  if (
    !input.facts.serviceWhatsAppPolicyAllowed ||
    (input.facts.pharmacyConfigured &&
      !input.facts.pharmacyWhatsAppPolicyAllowed)
  ) {
    whatsappBlockers.push("whatsapp_policy_unavailable")
  }
  if (input.facts.whatsappBindingCount !== 1) {
    whatsappBlockers.push("whatsapp_routing_unavailable")
  } else if (!input.facts.whatsappConnectionReady) {
    whatsappBlockers.push("whatsapp_provider_unavailable")
  }

  const safeChatBlockers = uniqueBlockers(chatBlockers)
  const safeWhatsAppBlockers = uniqueBlockers(whatsappBlockers)
  return deriveStoreConversationChannelMode({
    chat: {
      available: safeChatBlockers.length === 0,
      blockers: safeChatBlockers,
    },
    desiredMode: input.desiredMode,
    revision: input.revision,
    whatsapp: {
      available: safeWhatsAppBlockers.length === 0,
      blockers: safeWhatsAppBlockers,
    },
  })
}

function policyAllows(
  outcomes: Array<{ outcome: string }>,
  indexes: readonly [number, number],
) {
  return indexes.every((index) => outcomes[index]?.outcome === "allowed")
}

function connectionIsReady(connection: {
  businessVerified: boolean
  numberVerified: boolean
  outboundVerified: boolean
  status: string
  templatesReady: boolean
  tenantId: string
  webhookSubscribed: boolean
}) {
  return (
    connection.status === "ACTIVE" &&
    connection.businessVerified &&
    connection.numberVerified &&
    connection.webhookSubscribed &&
    connection.outboundVerified &&
    connection.templatesReady
  )
}

export async function resolveStoreConversationChannelProjectionInTransaction(
  db: DbClient,
  input: { now?: Date; storeId: string; tenantId: string },
) {
  const now = input.now ?? new Date()
  const store = await db.store.findFirst({
    select: {
      countryCode: true,
      prescriptionChannel: {
        select: { status: true, webEnabled: true },
      },
      prescriptionRoles: {
        select: {
          credentialReference: true,
          credentialVerifiedAt: true,
          role: true,
          status: true,
        },
        where: { role: "PHARMACIST", status: "ACTIVE" },
      },
      prescriptionSettings: { select: { status: true } },
      serviceCommercePolicyDecisions: {
        select: {
          approvalReference: true,
          channel: true,
          effectiveAt: true,
          evidenceReference: true,
          expiresAt: true,
          id: true,
          jurisdictionCode: true,
          outcome: true,
          revision: true,
          revokedAt: true,
          subject: true,
          vertical: true,
        },
      },
      serviceCommerceProfile: {
        select: {
          intakeEnabled: true,
          status: true,
          webEnabled: true,
          whatsappEnabled: true,
        },
      },
      serviceCommerceStoreTeamAssignments: {
        select: { id: true },
        take: 1,
        where: {
          capability: "ATTENDANT",
          membership: {
            acceptedAt: { not: null },
            status: "ACTIVE",
            tenantId: input.tenantId,
          },
          status: "ACTIVE",
          tenantId: input.tenantId,
        },
      },
      serviceRequestForms: {
        select: { id: true },
        take: 1,
        where: {
          AND: [
            { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ],
          offerings: { some: {} },
          status: "ACTIVE",
          tenantId: input.tenantId,
        },
      },
      storeConversationAvailabilityConfiguration: true,
      storeConversationChannelConfiguration: {
        select: { desiredMode: true, revision: true },
      },
      tenant: { select: { timezone: true } },
      whatsappStoreBindings: {
        select: {
          connection: {
            select: {
              businessVerified: true,
              numberVerified: true,
              outboundVerified: true,
              status: true,
              templatesReady: true,
              tenantId: true,
              webhookSubscribed: true,
            },
          },
          status: true,
          tenantId: true,
        },
        where: {
          connection: { tenantId: input.tenantId },
          status: "ACTIVE",
          tenantId: input.tenantId,
        },
      },
    },
    where: {
      id: input.storeId,
      status: "ACTIVE",
      tenantId: input.tenantId,
    },
  })
  if (!store) return null

  // Prisma always returns the selected relations. The fallbacks preserve the
  // older in-memory DbClient contract used by compatibility adapters/tests;
  // production takes the consolidated one-read path above.
  const [legacyProfile, legacyBindings, legacyAttendant] = await Promise.all([
    store.serviceCommerceProfile === undefined
      ? db.serviceCommerceStoreProfile.findFirst({
          where: { storeId: input.storeId, tenantId: input.tenantId },
        })
      : Promise.resolve(null),
    store.whatsappStoreBindings === undefined
      ? db.whatsAppStoreBinding.findMany({
          select: {
            connection: {
              select: {
                businessVerified: true,
                numberVerified: true,
                outboundVerified: true,
                status: true,
                templatesReady: true,
                tenantId: true,
                webhookSubscribed: true,
              },
            },
            status: true,
            tenantId: true,
          },
          where: {
            connection: { tenantId: input.tenantId },
            status: "ACTIVE",
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
      : Promise.resolve([]),
    store.serviceCommerceStoreTeamAssignments === undefined
      ? db.serviceCommerceStoreTeamAssignment.findFirst({
          where: {
            status: "ACTIVE",
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
      : Promise.resolve(null),
  ])
  const profile = store.serviceCommerceProfile ?? legacyProfile
  const bindings = store.whatsappStoreBindings ?? legacyBindings
  const attendant =
    store.serviceCommerceStoreTeamAssignments?.[0] ?? legacyAttendant
  const preloadedPolicy = store.serviceCommercePolicyDecisions
  const outcomes = await evaluateServiceCommercePolicyBatchInTransaction(db, {
    actorUserId: "public_customer_entry",
    ...(preloadedPolicy === undefined
      ? {}
      : {
          preloaded: {
            countryCode: store.countryCode,
            decisions: preloadedPolicy,
          },
        }),
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
    storeId: input.storeId,
    tenantId: input.tenantId,
  })

  const prescriptionRoles = store.prescriptionRoles ?? []
  const profileReady = profile?.status === "ACTIVE" && profile.intakeEnabled
  const pharmacyConfigured =
    store.prescriptionSettings?.status === "ACTIVE" ||
    store.prescriptionChannel?.status === "ACTIVE" ||
    prescriptionRoles.length > 0
  const pharmacyProfessionalReady =
    store.prescriptionSettings?.status === "ACTIVE" &&
    store.prescriptionChannel?.status === "ACTIVE" &&
    store.prescriptionChannel.webEnabled &&
    prescriptionRoles.some(
      (role) =>
        role.status === "ACTIVE" &&
        role.role === "PHARMACIST" &&
        Boolean(role.credentialReference && role.credentialVerifiedAt),
    )
  const webVerticals = {
    pharmacy:
      Boolean(profileReady && profile?.webEnabled) &&
      pharmacyProfessionalReady &&
      policyAllows(outcomes, [2, 3]),
    service:
      Boolean(profileReady && profile?.webEnabled) &&
      policyAllows(outcomes, [0, 1]),
  }
  const availabilitySettings = store.storeConversationAvailabilityConfiguration
    ? projectStoredStoreConversationAvailabilityConfiguration(
        store.storeConversationAvailabilityConfiguration,
      )
    : {
        customerWording: "temporarily_unavailable" as const,
        manualPaused: false,
        pausedAt: null,
        revision: 0,
        timezone: store.tenant?.timezone ?? "Africa/Lagos",
        weeklyHours: DEFAULT_STORE_CONVERSATION_WEEKLY_HOURS,
      }
  const availability = evaluateStoreConversationAvailability({
    chatEnabled: Boolean(profile?.webEnabled),
    customerWording: availabilitySettings.customerWording,
    eligibleAttendant: Boolean(attendant),
    eligibleVerticals: [
      ...(webVerticals.service ? (["service"] as const) : []),
      ...(webVerticals.pharmacy ? (["pharmacy"] as const) : []),
    ],
    manualPaused: availabilitySettings.manualPaused,
    now,
    profileReady,
    timezone: availabilitySettings.timezone,
    weeklyHours: availabilitySettings.weeklyHours,
  })
  const storedMode = store.storeConversationChannelConfiguration
  const activeBinding = bindings.length === 1 ? bindings[0] : undefined
  const desiredMode = storedMode
    ? projectStoredStoreConversationDesiredMode(storedMode.desiredMode)
    : ("ewatrade_chat" as const)
  const channelMode = deriveStoreConversationChannelReadiness({
    availability,
    desiredMode,
    facts: {
      eligibleAttendant: Boolean(attendant),
      pharmacyConfigured,
      pharmacyProfessionalReady,
      pharmacyWebPolicyAllowed: policyAllows(outcomes, [2, 3]),
      pharmacyWhatsAppPolicyAllowed: policyAllows(outcomes, [6, 7]),
      profileReady,
      serviceWebPolicyAllowed: policyAllows(outcomes, [0, 1]),
      serviceWhatsAppPolicyAllowed: policyAllows(outcomes, [4, 5]),
      webEnabled: Boolean(profile?.webEnabled),
      whatsappBindingCount: bindings.length,
      whatsappConnectionReady:
        activeBinding?.tenantId === input.tenantId &&
        activeBinding.connection.tenantId === input.tenantId &&
        connectionIsReady(activeBinding.connection),
      whatsappEnabled: Boolean(profile?.whatsappEnabled),
    },
    revision: storedMode?.revision ?? 0,
  })

  return {
    availability,
    channelMode,
    serviceRequestFormAvailable: (store.serviceRequestForms?.length ?? 0) > 0,
    webVerticals,
  }
}
