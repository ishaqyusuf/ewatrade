import { ManualPaymentError } from "@ewatrade/utils/manual-payments"

export type PaymentAlertChannel = "email" | "whatsapp"
export type PaymentAlertSelection = {
  recipientUserIds: string[]
  channel: PaymentAlertChannel
  expectedRevision: number
}
export type PaymentAlertMember = {
  userId: string
  role: string
  status: string
  staffAccessMode: string
  staffStoreAssignments: Array<{ storeId: string; status: string }>
  user: {
    name: string
    email: string
    emailVerified: boolean
    phone: string | null
    phoneVerifiedAt: Date | null
  }
}

/** Same current payment-review roles/scope as manual report confirmation. */
export function paymentAlertCanReview(
  member: PaymentAlertMember,
  storeId?: string,
) {
  if (member.status !== "ACTIVE") return false
  if (["OWNER", "ADMIN"].includes(member.role)) return true
  if (!["MANAGER", "CASHIER", "OPERATOR"].includes(member.role)) return false
  if (member.staffAccessMode !== "SCOPED") return true
  return member.staffStoreAssignments.some(
    (assignment) =>
      assignment.status === "ACTIVE" &&
      (!storeId || assignment.storeId === storeId),
  )
}

export function paymentAlertDestination(
  member: PaymentAlertMember,
  channel: PaymentAlertChannel,
) {
  if (channel === "email") {
    const email = member.user.email.trim()
    return member.user.emailVerified &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      email.length <= 320
      ? email
      : null
  }
  const phone = member.user.phone?.trim() ?? ""
  return member.user.phoneVerifiedAt && /^\+[1-9]\d{7,14}$/.test(phone)
    ? phone
    : null
}

export function maskPaymentAlertDestination(
  value: string | null,
  channel: PaymentAlertChannel,
) {
  if (!value) return null
  if (channel === "whatsapp") return `•••• ${value.slice(-4)}`
  const [name = "", domain = ""] = value.split("@")
  return `${name.slice(0, 1)}•••@${domain}`
}

export function validatePaymentAlertSelection(input: PaymentAlertSelection) {
  if (
    !["email", "whatsapp"].includes(input.channel) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.recipientUserIds.length < 1 ||
    input.recipientUserIds.length > 20 ||
    input.recipientUserIds.some(
      (id) => !id || id.length > 128 || id.trim() !== id,
    ) ||
    new Set(input.recipientUserIds).size !== input.recipientUserIds.length
  )
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Choose one alert channel and between 1 and 20 different Business staff.",
    )
}

/** Whole-group validation: never split a saved bank account across channels. */
export function paymentAlertRecipients(
  members: PaymentAlertMember[],
  selection: PaymentAlertSelection,
  storeId?: string,
) {
  validatePaymentAlertSelection(selection)
  return selection.recipientUserIds.map((userId) => {
    const member = members.find((entry) => entry.userId === userId)
    if (!member || !paymentAlertCanReview(member, storeId)) {
      throw new ManualPaymentError(
        "FORBIDDEN",
        "Each selected person must still have access to check these payments.",
      )
    }
    const destination = paymentAlertDestination(member, selection.channel)
    if (!destination)
      throw new ManualPaymentError(
        "BAD_REQUEST",
        `Each selected person needs a verified ${selection.channel === "email" ? "email address" : "phone number"}.`,
      )
    return { userId, destination }
  })
}
