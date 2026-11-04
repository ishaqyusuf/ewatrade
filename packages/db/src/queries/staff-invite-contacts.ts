import { randomUUID } from "node:crypto"
import type { Prisma } from "../../generated/prisma/client"

/** Phone-only accounts carry a non-deliverable internal email (see phone-auth). */
const PHONE_ACCOUNT_EMAIL_SUFFIX = "@phone.ewatrade.invalid"

export function isPhoneAccountEmail(email: string | null | undefined) {
  return Boolean(
    email?.trim().toLowerCase().endsWith(PHONE_ACCOUNT_EMAIL_SUFFIX),
  )
}

export function createPhoneAccountEmail() {
  return `${randomUUID()}${PHONE_ACCOUNT_EMAIL_SUFFIX}`
}

/** The email a person can see or use; internal phone-account emails read as none. */
export function visibleAccountEmail(email: string) {
  return isPhoneAccountEmail(email) ? "" : email
}

export type StaffInviteContacts = { email?: string; phone?: string }

export type StaffInviteContactProblem = {
  code:
    | "STAFF_CONTACT_REQUIRED"
    | "STAFF_CONTACT_INVALID"
    | "STAFF_CONTACT_CONFLICT"
  message: string
}

/** Same rules as registration: lowercased email, E.164 phone with its country code. */
export function normalizeStaffInviteContacts(input: {
  email?: string | null
  phone?: string | null
}): { contacts: StaffInviteContacts } | { problem: StaffInviteContactProblem } {
  const email = input.email?.trim().toLowerCase() || undefined
  const phone = input.phone?.trim() || undefined
  if (!email && !phone)
    return {
      problem: {
        code: "STAFF_CONTACT_REQUIRED",
        message: "Add an email address or a WhatsApp number.",
      },
    }
  if (
    email &&
    (email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      isPhoneAccountEmail(email))
  )
    return {
      problem: {
        code: "STAFF_CONTACT_INVALID",
        message: "Enter a valid email address.",
      },
    }
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone))
    return {
      problem: {
        code: "STAFF_CONTACT_INVALID",
        message: "Enter the WhatsApp number with its country code.",
      },
    }
  return {
    contacts: { ...(email ? { email } : {}), ...(phone ? { phone } : {}) },
  }
}

export type StaffInviteAccount = {
  displayName: string | null
  email: string
  emailVerified: boolean
  id: string
  name: string
  phone: string | null
  phoneVerifiedAt: Date | null
}

const accountSelect = {
  displayName: true,
  email: true,
  emailVerified: true,
  id: true,
  name: true,
  phone: true,
  phoneVerifiedAt: true,
} as const

/**
 * An account nobody has signed in to yet: created by an earlier staff invite
 * and never verified. Only these may have a contact added by an owner.
 */
async function isUnclaimedAccount(
  tx: Prisma.TransactionClient,
  account: StaffInviteAccount,
) {
  if (account.emailVerified || account.phoneVerifiedAt) return false
  const [credentials, active] = await Promise.all([
    tx.account.count({ where: { userId: account.id } }),
    tx.membership.count({ where: { userId: account.id, status: "ACTIVE" } }),
  ])
  return credentials === 0 && active === 0
}

const conflict = (message: string) =>
  ({ problem: { code: "STAFF_CONTACT_CONFLICT" as const, message } }) as const

/**
 * Finds the one account the invited contacts point to. An owner never adds an
 * email or phone to an account someone already uses: that would let the owner
 * choose how another person's account signs in.
 */
export async function findStaffInviteAccount(
  tx: Prisma.TransactionClient,
  contacts: StaffInviteContacts,
): Promise<
  | {
      account: StaffInviteAccount | null
      link: { email?: string; phone?: string }
    }
  | { problem: StaffInviteContactProblem }
> {
  const [byEmail, byPhone] = await Promise.all([
    contacts.email
      ? tx.user.findUnique({
          where: { email: contacts.email },
          select: accountSelect,
        })
      : null,
    contacts.phone
      ? tx.user.findUnique({
          where: { phone: contacts.phone },
          select: accountSelect,
        })
      : null,
  ])
  if (byEmail && byPhone && byEmail.id !== byPhone.id)
    return conflict(
      "This email and WhatsApp number belong to two different accounts. Invite with one of them.",
    )
  const account = byEmail ?? byPhone
  if (!account) return { account: null, link: {} }
  const link: { email?: string; phone?: string } = {}
  if (contacts.phone && account.phone !== contacts.phone)
    link.phone = contacts.phone
  if (contacts.email && account.email !== contacts.email) {
    if (!isPhoneAccountEmail(account.email))
      return conflict(
        "This WhatsApp number already signs in with a different email. Invite with the number only.",
      )
    link.email = contacts.email
  }
  if ((link.email || link.phone) && !(await isUnclaimedAccount(tx, account)))
    return conflict(
      link.phone
        ? "This email already has an ẸwáTrade account without this WhatsApp number. Invite with the email only."
        : "This WhatsApp number already has an ẸwáTrade account without this email. Invite with the number only.",
    )
  return { account, link }
}

/**
 * A phone that has never signed in may do so once when it is the WhatsApp
 * number on an open staff invite for that same account.
 */
export async function hasOpenStaffPhoneInvite(
  tx: Prisma.TransactionClient,
  input: { phone: string; userId: string; now: Date },
) {
  const invite = await tx.retailOpsStaffInviteToken.findFirst({
    where: {
      phone: input.phone,
      invitedUserId: input.userId,
      status: "ACTIVE",
      expiresAt: { gt: input.now },
      membership: { status: "INVITED", userId: input.userId },
    },
    select: { id: true },
  })
  return Boolean(invite)
}

/** What happened to the invite's WhatsApp message, kept on the open invite. */
export type StaffInviteWhatsAppStatus =
  | "SENT"
  | "FAILED"
  | "UNCONFIRMED"
  | "NOT_CONFIGURED"
  | "LOCAL_ONLY"

const whatsAppStatuses = new Set<string>([
  "SENT",
  "FAILED",
  "UNCONFIRMED",
  "NOT_CONFIGURED",
  "LOCAL_ONLY",
])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function readStaffInviteWhatsAppStatus(
  metadata: unknown,
): StaffInviteWhatsAppStatus | null {
  const status = asRecord(
    asRecord(asRecord(metadata).retailOps).whatsapp,
  ).status
  return typeof status === "string" && whatsAppStatuses.has(status)
    ? (status as StaffInviteWhatsAppStatus)
    : null
}

export async function recordStaffInviteWhatsAppDelivery(
  db: Pick<Prisma.TransactionClient, "retailOpsStaffInviteToken">,
  input: {
    tenantId: string
    membershipId: string
    status: StaffInviteWhatsAppStatus
    providerMessageId?: string | null
    at?: Date
  },
) {
  const token = await db.retailOpsStaffInviteToken.findFirst({
    where: {
      tenantId: input.tenantId,
      membershipId: input.membershipId,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, metadata: true },
  })
  if (!token) return false
  const metadata = asRecord(token.metadata)
  const retailOps = asRecord(metadata.retailOps)
  await db.retailOpsStaffInviteToken.update({
    where: { id: token.id },
    data: {
      metadata: {
        ...metadata,
        retailOps: {
          ...retailOps,
          whatsapp: {
            status: input.status,
            providerMessageId: input.providerMessageId ?? null,
            at: (input.at ?? new Date()).toISOString(),
          },
        },
      } as Prisma.InputJsonValue,
    },
  })
  return true
}
