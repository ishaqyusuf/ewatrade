import type { z } from "zod"
import { assertServiceCommercePolicyAllowedReadOnlyInTransaction } from "../service-commerce-policy"
import { assertStaffBookingCommandScopeInTransaction } from "./booking-command-authority"
import { readBookingContactBasisInTransaction } from "./booking-command-contacts"
import {
  bookingConfirmationCommandHash,
  bookingHoldCommandHash,
  bookingRevisionCommandHash,
} from "./booking-command-inputs"
import type { BookingContactBasis } from "./booking-command-types"
import {
  type IssueServiceCommerceBookingCapabilityToken,
  runServiceCommerceBookingConfirmationInTransaction,
  runServiceCommerceBookingHoldInTransaction,
  runServiceCommerceBookingRevisionInTransaction,
} from "./lifecycle"
import {
  type BookingTransaction,
  ServiceCommerceBookingError,
  assertBookingRuntimeReady,
  assertBookingSource,
} from "./shared"

import {
  type StaffServiceCommerceBookingConfirmationInput,
  type StaffServiceCommerceBookingHoldInput,
  type StaffServiceCommerceBookingRevisionInput,
  confirmationSchema,
  holdSchema,
  revisionSchema,
} from "./booking-command-schemas"
export type {
  StaffServiceCommerceBookingHoldInput,
  StaffServiceCommerceBookingConfirmationInput,
  StaffServiceCommerceBookingRevisionInput,
} from "./booking-command-schemas"
import {
  readServiceCommerceBookingConfirmationEffectInTransaction,
  readServiceCommerceBookingHoldEffectInTransaction,
  readServiceCommerceBookingRevisionEffectInTransaction,
} from "./booking-command-effects"
declare const holdBrand: unique symbol
declare const confirmationBrand: unique symbol
declare const revisionBrand: unique symbol
declare const inspectionBrand: unique symbol
export type PreparedServiceCommerceBookingHold = { readonly [holdBrand]: true }
export type PreparedServiceCommerceBookingConfirmation = {
  readonly [confirmationBrand]: true
}
export type PreparedServiceCommerceBookingRevision = {
  readonly [revisionBrand]: true
}
export type ServiceCommerceBookingConfirmationInspection = {
  readonly [inspectionBrand]: true
}
type HoldState = {
  input: StaffServiceCommerceBookingHoldInput
  payloadHash: string
  token: string
}
type ConfirmationState = {
  input: StaffServiceCommerceBookingConfirmationInput
  payloadHash: string
  token: string
  basis: BookingContactBasis
  ciphertext: string | null
}
type RevisionState = {
  input: StaffServiceCommerceBookingRevisionInput
  payloadHash: string
  token: string
}
const holds = new WeakMap<PreparedServiceCommerceBookingHold, HoldState>()
const confirmations = new WeakMap<
  PreparedServiceCommerceBookingConfirmation,
  ConfirmationState
>()
const revisions = new WeakMap<
  PreparedServiceCommerceBookingRevision,
  RevisionState
>()
const inspections = new WeakMap<
  ServiceCommerceBookingConfirmationInspection,
  {
    input: StaffServiceCommerceBookingConfirmationInput
    basis: BookingContactBasis
  }
>()
const preparedInspections = new WeakMap<
  ServiceCommerceBookingConfirmationInspection,
  PreparedServiceCommerceBookingConfirmation
>()
function refuse(
  message = "Prepare this exact staff booking command outside its transaction.",
): never {
  throw new ServiceCommerceBookingError("BOOKING_INVALID_INPUT", message)
}
function parsed<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw)
  if (!result.success)
    refuse("Keep the exact supported staff booking intention.")
  return structuredClone(result.data)
}
type StaffBookingCommandScope = {
  actorUserId: string
  tenantId: string
  storeId: string
}
function assertPreparedScope(
  captured: StaffBookingCommandScope,
  current: StaffBookingCommandScope,
) {
  if (
    !current ||
    captured.actorUserId !== current.actorUserId ||
    captured.tenantId !== current.tenantId ||
    captured.storeId !== current.storeId
  )
    throw new ServiceCommerceBookingError(
      "BOOKING_FORBIDDEN",
      "Prepared booking scope changed. Review this command in the current Store.",
    )
}
function allocatedToken(
  issue: IssueServiceCommerceBookingCapabilityToken,
  input: { clientOperationId: string; storeId: string; tenantId: string },
  purpose: "confirm" | "view_and_manage",
) {
  const token = issue({
    clientOperationId: `${input.clientOperationId}:${purpose === "confirm" ? "confirm" : "manage"}`,
    purpose,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  if (typeof token !== "string" || !token)
    refuse("The private booking capability allocation is unavailable.")
  return token
}
/** No transaction or callbacks are retained; server command IDs are caller-owned. */
export function prepareServiceCommerceBookingHold(
  raw: StaffServiceCommerceBookingHoldInput,
  issue: IssueServiceCommerceBookingCapabilityToken,
) {
  const input = parsed(holdSchema, raw)
  const payloadHash = bookingHoldCommandHash(input)
  const token = allocatedToken(issue, input, "confirm")
  const handle = Object.freeze({}) as PreparedServiceCommerceBookingHold
  holds.set(handle, { input, payloadHash, token })
  return handle
}
export function prepareServiceCommerceBookingRevision(
  raw: StaffServiceCommerceBookingRevisionInput,
  issue: IssueServiceCommerceBookingCapabilityToken,
) {
  const input = parsed(revisionSchema, raw)
  const payloadHash = bookingRevisionCommandHash(input)
  const token = allocatedToken(issue, input, "view_and_manage")
  const handle = Object.freeze({}) as PreparedServiceCommerceBookingRevision
  revisions.set(handle, { input, payloadHash, token })
  return handle
}
/** Caller owns an authenticated consistent read TX. Never resolves a customer token. */
export async function inspectServiceCommerceBookingConfirmationInTransaction(
  tx: BookingTransaction,
  raw: StaffServiceCommerceBookingConfirmationInput,
) {
  const input = parsed(confirmationSchema, raw)
  await assertStaffBookingCommandScopeInTransaction(tx, input)
  await assertBookingRuntimeReady(tx, input)
  await assertServiceCommercePolicyAllowedReadOnlyInTransaction(tx, {
    ...input,
    channel: "staff",
    subject: "booking",
    vertical: "service",
    purpose: "booking_confirm_inspection",
  })
  await assertBookingSource(tx, input)
  const hold = await tx.serviceBookingHold.findFirst({
    where: {
      id: input.holdId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      sourceId: input.source.id,
      sourceType: "SERVICE_REQUEST",
      status: "HELD",
      expiresAt: { gt: new Date(Date.now()) },
    },
    select: { id: true },
  })
  if (!hold || hold.id !== input.holdId)
    throw new ServiceCommerceBookingError(
      "BOOKING_NOT_FOUND",
      "The exact active booking hold is unavailable.",
    )
  const basis = await readBookingContactBasisInTransaction(tx, input)
  const inspection = Object.freeze(
    {},
  ) as ServiceCommerceBookingConfirmationInspection
  inspections.set(inspection, { input, basis })
  return inspection
}
/** MUST run after inspection TX closes. Only trusted local crypto/token allocation. */
export function prepareServiceCommerceBookingConfirmation(
  inspection: ServiceCommerceBookingConfirmationInspection,
  callbacks: {
    issueCapabilityToken: IssueServiceCommerceBookingCapabilityToken
    protectRecipient: (phone: string) => string
  },
) {
  const inspected = inspections.get(inspection)
  if (!inspected) refuse()
  const existing = preparedInspections.get(inspection)
  if (existing) return existing
  const { input, basis } = structuredClone(inspected)
  const payloadHash = bookingConfirmationCommandHash(input)
  const token = allocatedToken(
    callbacks.issueCapabilityToken,
    input,
    "view_and_manage",
  )
  const ciphertext =
    basis.contactOptIn && basis.phone
      ? callbacks.protectRecipient(basis.phone)
      : null
  if (
    basis.contactOptIn &&
    basis.phone &&
    (typeof ciphertext !== "string" || !ciphertext)
  )
    refuse("The exact protected booking contact is unavailable.")
  const handle = Object.freeze({}) as PreparedServiceCommerceBookingConfirmation
  confirmations.set(handle, { input, basis, payloadHash, token, ciphertext })
  preparedInspections.set(inspection, handle)
  return handle
}
/** Caller owns one fresh authorized Serializable TX and its atomic proposal receipt. */
export async function createPreparedServiceCommerceBookingHoldInTransaction(
  tx: BookingTransaction,
  handle: PreparedServiceCommerceBookingHold,
  serverScope: StaffBookingCommandScope,
) {
  const saved = holds.get(handle)
  if (!saved) refuse()
  assertPreparedScope(saved.input, serverScope)
  const state = structuredClone(saved)
  if (bookingHoldCommandHash(state.input) !== state.payloadHash) refuse()
  await assertStaffBookingCommandScopeInTransaction(tx, state.input)
  const result = await runServiceCommerceBookingHoldInTransaction(
    tx,
    state.input,
    {
      now: new Date(Date.now()),
      payloadHash: state.payloadHash,
      confirmCapabilityOperationId: `${state.input.clientOperationId}:confirm`,
      confirmToken: state.token,
    },
  )
  const receipt = await readServiceCommerceBookingHoldEffectInTransaction(
    tx,
    state.input,
  )
  if (!receipt || receipt.holdId !== result.hold.id)
    refuse(
      "The exact saved booking effect is unavailable; roll back this whole transaction.",
    )
  return { receipt }
}
export async function confirmPreparedServiceCommerceBookingInTransaction(
  tx: BookingTransaction,
  handle: PreparedServiceCommerceBookingConfirmation,
  serverScope: StaffBookingCommandScope,
) {
  const saved = confirmations.get(handle)
  if (!saved) refuse()
  assertPreparedScope(saved.input, serverScope)
  const state = structuredClone(saved)
  if (bookingConfirmationCommandHash(state.input) !== state.payloadHash)
    refuse()
  await assertStaffBookingCommandScopeInTransaction(tx, state.input)
  const result = await runServiceCommerceBookingConfirmationInTransaction(
    tx,
    state.input,
    {
      now: new Date(Date.now()),
      payloadHash: state.payloadHash,
      manageCapabilityOperationId: `${state.input.clientOperationId}:manage`,
      manageToken: state.token,
      contact: {
        kind: "prepared",
        basis: state.basis,
        ciphertext: state.ciphertext,
      },
    },
  )
  const receipt =
    await readServiceCommerceBookingConfirmationEffectInTransaction(
      tx,
      state.input,
    )
  if (!receipt || receipt.bookingId !== result.booking.id)
    refuse(
      "The exact saved booking effect is unavailable; roll back this whole transaction.",
    )
  return { receipt, notificationDispatches: result.notificationDispatches }
}
export async function revisePreparedServiceCommerceBookingInTransaction(
  tx: BookingTransaction,
  handle: PreparedServiceCommerceBookingRevision,
  serverScope: StaffBookingCommandScope,
) {
  const saved = revisions.get(handle)
  if (!saved) refuse()
  assertPreparedScope(saved.input, serverScope)
  const state = structuredClone(saved)
  if (bookingRevisionCommandHash(state.input) !== state.payloadHash) refuse()
  await assertStaffBookingCommandScopeInTransaction(tx, state.input)
  const result = await runServiceCommerceBookingRevisionInTransaction(
    tx,
    state.input,
    {
      now: new Date(Date.now()),
      payloadHash: state.payloadHash,
      nextCapabilityOperationId: `${state.input.clientOperationId}:manage`,
      nextToken: state.token,
    },
  )
  const receipt = await readServiceCommerceBookingRevisionEffectInTransaction(
    tx,
    state.input,
  )
  if (!receipt || receipt.bookingId !== result.booking.id)
    refuse(
      "The exact saved booking effect is unavailable; roll back this whole transaction.",
    )
  return { receipt, notificationDispatches: result.notificationDispatches }
}
