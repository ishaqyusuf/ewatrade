"use server"

import { trpc } from "@/trpc/server"
import { publicBookingFailureMessage } from "./booking-public-state"

export type PublicBookingActionState =
  | { kind: "idle"; message: null }
  | { kind: "error"; message: string }
  | {
      confirmToken: string
      expiresAt: string
      holdId: string
      kind: "held"
      message: string
    }
  | {
      booking: {
        endAt: string
        paymentStatus: string
        resourceLabel: string | null
        startAt: string
        status: string
        timezone: string
      }
      kind: "confirmed"
      manageAccessToken: string | null
      message: string
    }
  | {
      booking: {
        endAt: string
        id: string
        nextOperations: string[]
        paymentStatus: string
        resourceLabel: string | null
        revision: number
        startAt: string
        status: string
        timezone: string
      }
      kind: "managed"
      manageAccessToken: string | null
      message: string
    }
  | { kind: "cancelled"; message: string }

function text(data: FormData, key: string) {
  const value = data.get(key)
  return typeof value === "string" ? value.trim() : ""
}

export async function submitPublicBooking(
  previous: PublicBookingActionState,
  data: FormData,
): Promise<PublicBookingActionState> {
  const intent = text(data, "intent")
  const accessToken = text(data, "accessToken")
  const clientOperationId = text(data, "clientOperationId")
  if (!accessToken || !clientOperationId) {
    return { kind: "error", message: "This booking action is unavailable." }
  }
  try {
    if (intent === "hold") {
      const resourceId = text(data, "resourceId")
      const slotStartAt = new Date(text(data, "slotStartAt"))
      const slotEndAt = new Date(text(data, "slotEndAt"))
      const expectedConfigurationRevision = Number(
        text(data, "expectedConfigurationRevision"),
      )
      if (
        !resourceId ||
        !Number.isInteger(expectedConfigurationRevision) ||
        Number.isNaN(slotStartAt.getTime()) ||
        Number.isNaN(slotEndAt.getTime())
      ) {
        return {
          kind: "error",
          message: "Choose an available appointment time.",
        }
      }
      const hold = await trpc.serviceCommerce.publicHoldBookingSlot.mutate({
        accessToken,
        clientOperationId,
        expectedConfigurationRevision,
        offeringId: text(data, "offeringId"),
        quantity: 1,
        resourceId,
        slotEndAt,
        slotStartAt,
      })
      if (!hold.accessToken) {
        return {
          kind: "error",
          message: "The selected time could not be held. Choose another slot.",
        }
      }
      return {
        confirmToken: hold.accessToken,
        expiresAt: hold.expiresAt.toISOString(),
        holdId: hold.id,
        kind: "held",
        message:
          "Your selected time is held briefly. Confirm it before the hold expires.",
      }
    }
    if (intent === "confirm" && previous.kind === "held") {
      const result = await trpc.serviceCommerce.publicConfirmBooking.mutate({
        accessToken: previous.confirmToken,
        clientOperationId,
        holdId: previous.holdId,
      })
      return {
        booking: {
          endAt: result.endAt.toISOString(),
          paymentStatus: result.paymentStatus,
          resourceLabel: result.resourceLabel,
          startAt: result.startAt.toISOString(),
          status: result.status,
          timezone: result.timezone,
        },
        kind: "confirmed",
        manageAccessToken: result.accessToken,
        message: "Your appointment is confirmed.",
      }
    }
    if (intent === "cancel") {
      const bookingId = text(data, "bookingId")
      const expectedRevision = Number(text(data, "expectedRevision"))
      if (!bookingId || !Number.isInteger(expectedRevision)) {
        return { kind: "error", message: "This booking action is unavailable." }
      }
      await trpc.serviceCommerce.publicReviseBooking.mutate({
        accessToken,
        bookingId,
        clientOperationId,
        expectedRevision,
        operation: "cancel",
        reasonCode: "customer_cancelled",
      })
      return {
        kind: "cancelled",
        message:
          "Your appointment was cancelled. The business will apply its refund policy if payment was collected.",
      }
    }
    if (intent === "reschedule") {
      const bookingId = text(data, "bookingId")
      const expectedRevision = Number(text(data, "expectedRevision"))
      const slotStartAt = new Date(text(data, "slotStartAt"))
      const slotEndAt = new Date(text(data, "slotEndAt"))
      const resourceId = text(data, "resourceId")
      if (
        !bookingId ||
        !resourceId ||
        !Number.isInteger(expectedRevision) ||
        Number.isNaN(slotStartAt.getTime()) ||
        Number.isNaN(slotEndAt.getTime())
      ) {
        return {
          kind: "error",
          message: "Choose another available appointment time.",
        }
      }
      const result = await trpc.serviceCommerce.publicReviseBooking.mutate({
        accessToken,
        bookingId,
        clientOperationId,
        expectedRevision,
        newSlotEndAt: slotEndAt,
        newSlotStartAt: slotStartAt,
        operation: "reschedule",
        reasonCode: "customer_rescheduled",
        resourceId,
      })
      return {
        booking: {
          endAt: result.endAt.toISOString(),
          id: result.id,
          nextOperations: [...result.nextOperations],
          paymentStatus: result.paymentStatus,
          resourceLabel: result.resourceLabel,
          revision: result.revision,
          startAt: result.startAt.toISOString(),
          status: result.status,
          timezone: result.timezone,
        },
        kind: "managed",
        manageAccessToken: result.accessToken,
        message: "Your appointment was rescheduled.",
      }
    }
    return { kind: "error", message: "Choose an available appointment time." }
  } catch (error) {
    return { kind: "error", message: publicBookingFailureMessage(error) }
  }
}
