import {
  type ServiceCommerceAction,
  type ServiceCommerceChannelOrigin,
  type ServiceCommerceCustomerActionCandidate,
  type ServiceCommerceReadinessState,
  type ServiceCommerceSourceRef,
  deriveServiceCommerceBookingNextOperations,
  projectServiceCommerceCustomerActions,
} from "@ewatrade/service-commerce"

import {
  CommerceQuoteFulfilmentType,
  CommerceQuoteSourceType,
  CommerceQuoteVersionStatus,
  CustomerEntryPointStatus,
  PaymentStatus,
  ServiceBookingRecordStatus,
} from "../../../generated/prisma/enums"
import { resolveServiceCommerceSourceContext } from "../service-commerce-sources"
import type { DbClient } from "../types"
import {
  ServiceCommerceCustomerActionTargetType,
  customerActionChannelValues,
  customerActionSourceValues,
  customerActionValues,
} from "./shared"

const quoteSourceTypes = {
  commerce_inquiry: CommerceQuoteSourceType.COMMERCE_INQUIRY,
  prescription: CommerceQuoteSourceType.PRESCRIPTION_REQUEST,
  service: CommerceQuoteSourceType.SERVICE_REQUEST,
} satisfies Record<ServiceCommerceSourceRef["kind"], CommerceQuoteSourceType>

function readiness(value: string): ServiceCommerceReadinessState {
  if (value === "available") return "available"
  if (value.includes("policy") || value === "restricted") return "restricted"
  if (value.includes("setup")) return "setup_required"
  return "unavailable"
}

function fulfilmentChoice(value: CommerceQuoteFulfilmentType) {
  if (value === CommerceQuoteFulfilmentType.PICKUP) return "pickup" as const
  if (value === CommerceQuoteFulfilmentType.DELIVERY) return "delivery" as const
  return null
}

type ActionTarget = {
  targetId: string
  targetOptionId?: string
  targetType: ServiceCommerceCustomerActionTargetType
  targetVersion: string
}

export type ProjectedServiceCommerceCustomerAction =
  ServiceCommerceCustomerActionCandidate & ActionTarget

export type CustomerActionCapabilitySnapshot = {
  action: keyof typeof customerActionValues
  channel: keyof typeof customerActionChannelValues
  createdByUserId: string
  sourceId: string
  sourceKind: keyof typeof customerActionSourceValues
  sourceVersion: Date
  storeId: string
  targetId: string
  targetOptionId: string | null
  targetType: ServiceCommerceCustomerActionTargetType
  targetVersion: string
  tenantId: string
}

function sameProjectedAction(
  capability: CustomerActionCapabilitySnapshot,
  action: ProjectedServiceCommerceCustomerAction,
) {
  return (
    customerActionValues[capability.action] === action.action &&
    capability.targetId === action.targetId &&
    capability.targetOptionId === (action.targetOptionId ?? null) &&
    capability.targetType === action.targetType &&
    capability.targetVersion === action.targetVersion
  )
}

function targetForAction(
  action: ServiceCommerceCustomerActionCandidate,
  facts: {
    booking: { id: string; revision: number } | null
    bookingConfig: { id: string; revision: number } | null
    entryPoint: { id: string; revision: number } | null
    quote: {
      id: string
      optionIds: Map<string, string>
      version: number
    } | null
    source: ServiceCommerceSourceRef
    sourceVersion: Date
  },
): ActionTarget | null {
  if (action.action === "request_quote") {
    return {
      targetId: facts.source.id,
      targetType: ServiceCommerceCustomerActionTargetType.SOURCE,
      targetVersion: facts.sourceVersion.toISOString(),
    }
  }
  if (action.action === "talk_to_staff") {
    return facts.entryPoint
      ? {
          targetId: facts.entryPoint.id,
          targetType:
            ServiceCommerceCustomerActionTargetType.CUSTOMER_ENTRY_POINT,
          targetVersion: String(facts.entryPoint.revision),
        }
      : null
  }
  if (action.action === "book") {
    return facts.bookingConfig
      ? {
          targetId: facts.bookingConfig.id,
          targetType: ServiceCommerceCustomerActionTargetType.SOURCE,
          targetVersion: String(facts.bookingConfig.revision),
        }
      : null
  }
  if (action.action === "reschedule" || action.action === "cancel") {
    return facts.booking
      ? {
          targetId: facts.booking.id,
          targetType: ServiceCommerceCustomerActionTargetType.BOOKING,
          targetVersion: String(facts.booking.revision),
        }
      : null
  }
  if (!facts.quote) return null
  if (action.action === "choose_quote_option") {
    const optionId = action.targetKey
      ? facts.quote.optionIds.get(action.targetKey)
      : null
    return optionId
      ? {
          targetId: facts.quote.id,
          targetOptionId: optionId,
          targetType: ServiceCommerceCustomerActionTargetType.QUOTE_OPTION,
          targetVersion: String(facts.quote.version),
        }
      : null
  }
  return {
    targetId: facts.quote.id,
    targetType: ServiceCommerceCustomerActionTargetType.QUOTE_VERSION,
    targetVersion: String(facts.quote.version),
  }
}

export async function projectCurrentServiceCommerceCustomerActions(
  db: DbClient,
  input: {
    actorUserId: string
    channel: ServiceCommerceChannelOrigin
    source: ServiceCommerceSourceRef
    storeId: string
    tenantId: string
  },
): Promise<{
  actions: ProjectedServiceCommerceCustomerAction[]
  contact: { email: string | null; optedIn: boolean; phone: string | null }
  sourceVersion: Date
}> {
  const context = await resolveServiceCommerceSourceContext(db, input)
  const quoteSourceType = quoteSourceTypes[context.source.kind]
  const [quote, booking, bookingConfig, entryPoint] = await Promise.all([
    db.commerceQuote.findFirst({
      include: {
        currentVersion: {
          include: {
            acceptedOrder: true,
            optionSelection: true,
            options: { orderBy: { position: "asc" } },
          },
        },
      },
      where: {
        sourceId: context.source.id,
        sourceType: quoteSourceType,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
    db.serviceBooking.findFirst({
      orderBy: { updatedAt: "desc" },
      where: {
        sourceId: context.source.id,
        sourceType: quoteSourceType,
        status: {
          notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"],
        },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
    context.source.kind === "service"
      ? db.serviceBookingOfferingConfig.findFirst({
          orderBy: { updatedAt: "desc" },
          where: {
            offering: {
              serviceRequestLines: {
                some: { requestId: context.source.id },
              },
            },
            status: ServiceBookingRecordStatus.ACTIVE,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
      : Promise.resolve(null),
    db.customerEntryPoint.findFirst({
      where: {
        status: CustomerEntryPointStatus.PUBLISHED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
  ])

  const version = quote?.currentVersion
  const released =
    Boolean(version) &&
    (version?.status === CommerceQuoteVersionStatus.ISSUED ||
      version?.status === CommerceQuoteVersionStatus.ACCEPTED) &&
    !version.revokedAt &&
    (!version.expiresAt || version.expiresAt > new Date())
  const selectedOptionId = version?.optionSelection?.optionId ?? null
  const options = version
    ? version.options.length > 0
      ? version.options.map((option) => ({
          key: option.clientOptionId,
          label: option.label,
          selected:
            selectedOptionId === option.id ||
            (version.options.length === 1 && !selectedOptionId),
          totalMinor: option.totalMinor,
        }))
      : [
          {
            key: "default",
            label: "Current quote",
            selected: true,
            totalMinor: version.totalMinor,
          },
        ]
    : []
  const selectedOption =
    version?.options.find((option) => option.id === selectedOptionId) ??
    (version?.options.length === 1 ? version.options[0] : null)
  const fulfilmentChoices = version
    ? [
        fulfilmentChoice(
          selectedOption?.fulfilmentType ?? version.fulfilmentType,
        ),
      ].filter((choice): choice is "delivery" | "pickup" => choice !== null)
    : []
  const readinessFacts = Object.fromEntries(
    Object.entries(context.sourceReadiness).map(([capability, value]) => [
      capability,
      readiness(value.readiness),
    ]),
  )
  const quoteFacts = version
    ? {
        currencyCode: version.currencyCode,
        fulfilmentChoices,
        options,
        paymentOutstanding:
          version.status === CommerceQuoteVersionStatus.ACCEPTED &&
          version.acceptedOrder?.paymentStatus !== PaymentStatus.PAID,
        released,
      }
    : null
  const bookingFacts = booking
    ? {
        nextOperations: deriveServiceCommerceBookingNextOperations(
          booking.status.toLowerCase() as Parameters<
            typeof deriveServiceCommerceBookingNextOperations
          >[0],
        ).filter(
          (operation): operation is "cancel" | "reschedule" =>
            operation === "cancel" || operation === "reschedule",
        ),
      }
    : bookingConfig
      ? { canCreate: true, nextOperations: [] }
      : null
  const candidates = projectServiceCommerceCustomerActions({
    booking: bookingFacts,
    channel: input.channel,
    quote: quoteFacts,
    readiness: readinessFacts,
    state: context.loaded.state,
  })
  const targetFacts = {
    booking: booking ? { id: booking.id, revision: booking.revision } : null,
    bookingConfig: bookingConfig
      ? { id: bookingConfig.id, revision: bookingConfig.revision }
      : null,
    entryPoint: entryPoint
      ? { id: entryPoint.id, revision: entryPoint.revision }
      : null,
    quote: version
      ? {
          id: version.id,
          optionIds: new Map(
            version.options.map((option) => [option.clientOptionId, option.id]),
          ),
          version: version.version,
        }
      : null,
    source: context.source,
    sourceVersion: context.loaded.updatedAt,
  }
  const actions = candidates.flatMap((candidate) => {
    const target = targetForAction(candidate, targetFacts)
    return target ? [{ ...candidate, ...target }] : []
  })

  return {
    actions,
    contact: {
      email: context.loaded.customerEmail,
      optedIn: context.loaded.contactOptIn,
      phone: context.loaded.customerPhone,
    },
    sourceVersion: context.loaded.updatedAt,
  }
}

export async function revalidateCustomerActionCapabilityInTransaction(
  db: DbClient,
  capability: CustomerActionCapabilitySnapshot,
) {
  const projected = await projectCurrentServiceCommerceCustomerActions(db, {
    actorUserId: capability.createdByUserId,
    channel: customerActionChannelValues[capability.channel],
    source: {
      id: capability.sourceId,
      kind: customerActionSourceValues[capability.sourceKind],
    },
    storeId: capability.storeId,
    tenantId: capability.tenantId,
  })
  if (
    capability.sourceVersion.getTime() !== projected.sourceVersion.getTime()
  ) {
    return undefined
  }
  return projected.actions.find((action) =>
    sameProjectedAction(capability, action),
  )
}
