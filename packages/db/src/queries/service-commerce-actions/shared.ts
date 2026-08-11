import type {
  ServiceCommerceAction,
  ServiceCommerceChannelOrigin,
  ServiceCommerceSourceKind,
} from "@ewatrade/service-commerce"

import { Prisma } from "../../../generated/prisma/client"
import {
  ServiceCommerceCustomerActionCapabilityStatus,
  ServiceCommerceCustomerActionChannel,
  ServiceCommerceCustomerActionSourceKind,
  ServiceCommerceCustomerActionTargetType,
  ServiceCommerceCustomerActionType,
  WhatsAppBindingStatus,
  WhatsAppConnectionStatus,
} from "../../../generated/prisma/enums"
import {
  issueOpaqueCapabilityToken,
  opaqueCapabilityTokenDigest,
  stablePayloadHash,
} from "../../utils/opaque-capability"

export const CUSTOMER_ACTION_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const

export type CustomerActionTransaction = Prisma.TransactionClient

export class ServiceCommerceCustomerActionError extends Error {
  constructor(
    readonly code:
      | "ACTION_BLOCKED"
      | "ACTION_CONFLICT"
      | "ACTION_EXPIRED"
      | "ACTION_FORBIDDEN"
      | "ACTION_IDEMPOTENCY_MISMATCH"
      | "ACTION_NOT_FOUND"
      | "ACTION_PROVIDER_UNAVAILABLE",
    message: string,
  ) {
    super(message)
    this.name = "ServiceCommerceCustomerActionError"
  }
}

export const customerActionTypes = {
  book: ServiceCommerceCustomerActionType.BOOK,
  cancel: ServiceCommerceCustomerActionType.CANCEL,
  choose_quote_option: ServiceCommerceCustomerActionType.CHOOSE_QUOTE_OPTION,
  delivery: ServiceCommerceCustomerActionType.DELIVERY,
  pay_now: ServiceCommerceCustomerActionType.PAY_NOW,
  pick_up: ServiceCommerceCustomerActionType.PICK_UP,
  request_quote: ServiceCommerceCustomerActionType.REQUEST_QUOTE,
  reschedule: ServiceCommerceCustomerActionType.RESCHEDULE,
  talk_to_staff: ServiceCommerceCustomerActionType.TALK_TO_STAFF,
  view_quote: ServiceCommerceCustomerActionType.VIEW_QUOTE,
} satisfies Record<ServiceCommerceAction, ServiceCommerceCustomerActionType>

export const customerActionValues = Object.fromEntries(
  Object.entries(customerActionTypes).map(([key, value]) => [value, key]),
) as Record<ServiceCommerceCustomerActionType, ServiceCommerceAction>

export const customerActionSourceKinds = {
  commerce_inquiry: ServiceCommerceCustomerActionSourceKind.COMMERCE_INQUIRY,
  prescription: ServiceCommerceCustomerActionSourceKind.PRESCRIPTION,
  service: ServiceCommerceCustomerActionSourceKind.SERVICE,
} satisfies Record<
  ServiceCommerceSourceKind,
  ServiceCommerceCustomerActionSourceKind
>

export const customerActionSourceValues = Object.fromEntries(
  Object.entries(customerActionSourceKinds).map(([key, value]) => [value, key]),
) as Record<ServiceCommerceCustomerActionSourceKind, ServiceCommerceSourceKind>

export const customerActionChannels = {
  staff: ServiceCommerceCustomerActionChannel.STAFF,
  web: ServiceCommerceCustomerActionChannel.WEB,
  whatsapp: ServiceCommerceCustomerActionChannel.WHATSAPP,
} satisfies Record<
  ServiceCommerceChannelOrigin,
  ServiceCommerceCustomerActionChannel
>

export const customerActionChannelValues = Object.fromEntries(
  Object.entries(customerActionChannels).map(([key, value]) => [value, key]),
) as Record<ServiceCommerceCustomerActionChannel, ServiceCommerceChannelOrigin>

export function customerActionPayloadHash(value: unknown) {
  return stablePayloadHash(value)
}

export function customerActionToken() {
  return issueOpaqueCapabilityToken()
}

export function customerActionTokenDigest(value: string) {
  return opaqueCapabilityTokenDigest(value)
}

export function activeCapabilityWhere(now: Date) {
  return {
    expiresAt: { gt: now },
    status: {
      in: [
        ServiceCommerceCustomerActionCapabilityStatus.ACTIVE,
        ServiceCommerceCustomerActionCapabilityStatus.CONSUMED,
      ],
    },
  } as const
}

function stringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
}

export async function resolveCustomerActionWhatsAppConnectionInTransaction(
  tx: CustomerActionTransaction,
  input: { storeId: string; templateKey: string; tenantId: string },
) {
  const bindings = await tx.whatsAppStoreBinding.findMany({
    include: { connection: true },
    orderBy: { activatedAt: "desc" },
    where: {
      connection: {
        status: WhatsAppConnectionStatus.ACTIVE,
        tenantId: input.tenantId,
      },
      status: WhatsAppBindingStatus.ACTIVE,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (bindings.length !== 1) {
    throw new ServiceCommerceCustomerActionError(
      "ACTION_PROVIDER_UNAVAILABLE",
      "Customer notification requires one current WhatsApp sender.",
    )
  }
  const binding = bindings[0]
  if (!binding) {
    throw new ServiceCommerceCustomerActionError(
      "ACTION_PROVIDER_UNAVAILABLE",
      "Customer notification requires one current WhatsApp sender.",
    )
  }
  const templates = stringRecord(binding.connection.templateConfiguration)
  if (templates.customer_actions !== input.templateKey) {
    throw new ServiceCommerceCustomerActionError(
      "ACTION_PROVIDER_UNAVAILABLE",
      "The approved customer-action message template is unavailable.",
    )
  }
  return {
    connectionId: binding.connection.id,
    credentialReference: binding.connection.credentialReference,
    phoneNumberId: binding.connection.phoneNumberId,
    templateKey: templates.customer_actions,
  }
}

export { ServiceCommerceCustomerActionTargetType }
