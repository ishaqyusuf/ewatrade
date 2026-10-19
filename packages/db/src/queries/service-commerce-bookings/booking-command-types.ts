import type { ServiceCommerceSourceRef } from "@ewatrade/service-commerce"
import type { IssueServiceCommerceBookingCapabilityToken } from "./lifecycle"

export type ServiceCommerceBookingHoldInput = {
  accessToken?: string
  actorUserId?: string
  clientOperationId: string
  expectedConfigurationRevision: number
  issueCapabilityToken: IssueServiceCommerceBookingCapabilityToken
  now?: Date
  offeringId: string
  quantity: number
  resourceId: string
  slotEndAt: Date
  slotStartAt: Date
  source: ServiceCommerceSourceRef
  storeId: string
  tenantId: string
}

export type ServiceCommerceBookingConfirmationInput = {
  accessToken?: string
  actorUserId?: string
  clientBookingId?: string
  clientOperationId: string
  commercialOrderId?: string
  holdId: string
  issueCapabilityToken: IssueServiceCommerceBookingCapabilityToken
  now?: Date
  protectRecipient: (value: string) => string
  quoteVersionId?: string
  serviceJobId?: string
  source: ServiceCommerceSourceRef
  storeId: string
  tenantId: string
}

export type ServiceCommerceBookingRevisionInput = {
  accessToken?: string
  actorUserId?: string
  bookingId: string
  clientOperationId: string
  expectedRevision: number
  issueCapabilityToken: IssueServiceCommerceBookingCapabilityToken
  newSlotEndAt?: Date
  newSlotStartAt?: Date
  now?: Date
  operation:
    | "arrive"
    | "cancel"
    | "complete"
    | "mark_no_show"
    | "reschedule"
    | "start"
  reasonCode?: string
  resourceId?: string
  storeId: string
  tenantId: string
}

export type BookingHoldData = Omit<
  ServiceCommerceBookingHoldInput,
  "issueCapabilityToken"
>
export type BookingConfirmationData = Omit<
  ServiceCommerceBookingConfirmationInput,
  "issueCapabilityToken" | "protectRecipient"
>
export type BookingRevisionData = Omit<
  ServiceCommerceBookingRevisionInput,
  "issueCapabilityToken"
>
export type BookingContactBasis = {
  sourceId: string
  tenantId: string
  storeId: string
  revision: number
  contactOptIn: boolean
  phone: string | null
  channelOrigin: string
  customerName: string
}
export type BookingConfirmationContact =
  | { kind: "legacy"; protectRecipient: (phone: string) => string }
  | { kind: "prepared"; basis: BookingContactBasis; ciphertext: string | null }
export type BookingHoldAllocation = {
  now: Date
  payloadHash: string
  confirmCapabilityOperationId: string
  confirmToken: string
}
export type BookingConfirmationAllocation = {
  now: Date
  payloadHash: string
  manageCapabilityOperationId: string
  manageToken: string
  contact: BookingConfirmationContact
}
export type BookingRevisionAllocation = {
  now: Date
  payloadHash: string
  nextCapabilityOperationId: string
  nextToken: string
}
