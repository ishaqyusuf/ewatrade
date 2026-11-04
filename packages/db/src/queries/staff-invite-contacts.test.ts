import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import {
  type StaffInviteAccount,
  findStaffInviteAccount,
  normalizeStaffInviteContacts,
  readStaffInviteWhatsAppStatus,
  recordStaffInviteWhatsAppDelivery,
  visibleAccountEmail,
} from "./staff-invite-contacts"

function account(input: Partial<StaffInviteAccount> = {}): StaffInviteAccount {
  return {
    displayName: null,
    email: "ada@example.com",
    emailVerified: false,
    id: "user_ada",
    name: "Ada",
    phone: null,
    phoneVerifiedAt: null,
    ...input,
  }
}

function tx(input: {
  users: StaffInviteAccount[]
  credentials?: number
  activeMemberships?: number
}) {
  return {
    user: {
      async findUnique({
        where,
      }: { where: { email?: string; phone?: string } }) {
        return (
          input.users.find(
            (user) =>
              (where.email && user.email === where.email) ||
              (where.phone && user.phone === where.phone),
          ) ?? null
        )
      },
    },
    account: { count: async () => input.credentials ?? 0 },
    membership: { count: async () => input.activeMemberships ?? 0 },
  } as unknown as Prisma.TransactionClient
}

describe("staff invite contacts", () => {
  test("needs an email or a WhatsApp number, normalised like registration", () => {
    expect(normalizeStaffInviteContacts({})).toEqual({
      problem: {
        code: "STAFF_CONTACT_REQUIRED",
        message: "Add an email address or a WhatsApp number.",
      },
    })
    expect(
      normalizeStaffInviteContacts({
        email: "  Ada@Example.COM ",
        phone: " +2348035550142 ",
      }),
    ).toEqual({
      contacts: { email: "ada@example.com", phone: "+2348035550142" },
    })
    expect(
      normalizeStaffInviteContacts({ phone: "08035550142" }),
    ).toMatchObject({
      problem: { code: "STAFF_CONTACT_INVALID" },
    })
    expect(
      normalizeStaffInviteContacts({ email: "x@phone.ewatrade.invalid" }),
    ).toMatchObject({ problem: { code: "STAFF_CONTACT_INVALID" } })
  })

  test("hides the internal email of a WhatsApp-only account", () => {
    expect(visibleAccountEmail("9f2c@phone.ewatrade.invalid")).toBe("")
    expect(visibleAccountEmail("ada@example.com")).toBe("ada@example.com")
  })

  test("creates a new account when neither contact is known", async () => {
    expect(
      await findStaffInviteAccount(tx({ users: [] }), {
        phone: "+2348035550142",
      }),
    ).toEqual({ account: null, link: {} })
  })

  test("refuses contacts that belong to two different accounts", async () => {
    const result = await findStaffInviteAccount(
      tx({
        users: [
          account(),
          account({
            id: "user_b",
            email: "b@example.com",
            phone: "+2348035550142",
          }),
        ],
      }),
      { email: "ada@example.com", phone: "+2348035550142" },
    )
    expect(result).toMatchObject({
      problem: { code: "STAFF_CONTACT_CONFLICT" },
    })
  })

  test("adds the WhatsApp number to an account nobody has signed in to", async () => {
    const result = await findStaffInviteAccount(tx({ users: [account()] }), {
      email: "ada@example.com",
      phone: "+2348035550142",
    })
    expect(result).toMatchObject({
      account: { id: "user_ada" },
      link: { phone: "+2348035550142" },
    })
  })

  test("never adds a contact to an account someone already uses", async () => {
    const claimedByEmail = await findStaffInviteAccount(
      tx({ users: [account({ emailVerified: true })] }),
      { email: "ada@example.com", phone: "+2348035550142" },
    )
    expect(claimedByEmail).toMatchObject({
      problem: { code: "STAFF_CONTACT_CONFLICT" },
    })

    const phoneOwner = account({
      email: "9f2c@phone.ewatrade.invalid",
      phone: "+2348035550142",
      phoneVerifiedAt: new Date(),
    })
    const claimedByPhone = await findStaffInviteAccount(
      tx({ users: [phoneOwner] }),
      {
        email: "new@example.com",
        phone: "+2348035550142",
      },
    )
    expect(claimedByPhone).toMatchObject({
      problem: { code: "STAFF_CONTACT_CONFLICT" },
    })

    const withPassword = await findStaffInviteAccount(
      tx({ users: [account()], credentials: 1 }),
      { email: "ada@example.com", phone: "+2348035550142" },
    )
    expect(withPassword).toMatchObject({
      problem: { code: "STAFF_CONTACT_CONFLICT" },
    })
  })

  test("reuses a verified phone account invited by its own number", async () => {
    const phoneOwner = account({
      email: "9f2c@phone.ewatrade.invalid",
      phone: "+2348035550142",
      phoneVerifiedAt: new Date(),
    })
    expect(
      await findStaffInviteAccount(tx({ users: [phoneOwner] }), {
        phone: "+2348035550142",
      }),
    ).toEqual({ account: phoneOwner, link: {} })
  })

  test("keeps the WhatsApp outcome on the open invite", async () => {
    const saved: { metadata?: unknown } = {}
    const db = {
      retailOpsStaffInviteToken: {
        findFirst: async () => ({
          id: "token",
          metadata: { retailOps: { source: "x" } },
        }),
        update: async ({ data }: { data: { metadata: unknown } }) => {
          saved.metadata = data.metadata
        },
      },
    } as unknown as Pick<Prisma.TransactionClient, "retailOpsStaffInviteToken">
    await recordStaffInviteWhatsAppDelivery(db, {
      tenantId: "tenant",
      membershipId: "membership",
      status: "SENT",
      providerMessageId: "wamid.1",
      at: new Date("2026-11-04T10:00:00.000Z"),
    })
    expect(saved.metadata).toEqual({
      retailOps: {
        source: "x",
        whatsapp: {
          status: "SENT",
          providerMessageId: "wamid.1",
          at: "2026-11-04T10:00:00.000Z",
        },
      },
    })
    expect(readStaffInviteWhatsAppStatus(saved.metadata)).toBe("SENT")
    expect(
      readStaffInviteWhatsAppStatus({
        retailOps: { whatsapp: { status: "?" } },
      }),
    ).toBeNull()
  })
})
