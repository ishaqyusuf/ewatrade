import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { readCustomerFundsAllocationAuthority } from "./funds-allocation-authority"
import { getVerifiedCustomerFundsInTransaction } from "./public-funds"

const principal = {
  linkId: "link",
  authenticatedUserId: "customer-user",
  authenticatedSessionId: "session",
}
function fixture(
  options: {
    contact?: string
    unverified?: boolean
    noAccount?: boolean
    privacyBlocked?: boolean
    reserved?: bigint
    credit?: bigint
    foreign?: boolean
  } = {},
) {
  let sessionReads = 0
  const tx = {
    session: {
      findFirst: async (args: {
        where: { id: string; userId: string; expiresAt: { gt: Date } }
      }) => {
        sessionReads++
        expect(args.where.expiresAt.gt).toBeInstanceOf(Date)
        return args.where.id === "session" &&
          args.where.userId === "customer-user"
          ? {
              user: {
                id: "customer-user",
                email: "customer@example.test",
                emailVerified: !options.unverified,
                phone: null,
                phoneVerifiedAt: null,
              },
            }
          : null
      },
    },
    accountPrivacyRequest: {
      findUnique: async () =>
        options.privacyBlocked ? { status: "PROCESSING" } : null,
    },
    manualPaymentLink: {
      findFirst: async (args: {
        where: {
          id: string
          closedAt: null
          expiresAt: { gt: Date }
          tenant: { isActive: true }
        }
      }) => {
        expect(args.where.closedAt).toBeNull()
        expect(args.where.tenant.isActive).toBe(true)
        return {
          id: "link",
          tenantId: "tenant",
          currencyCode: "NGN",
          amountMinor: 5000,
          attempts: [{ id: "attempt" }],
          order: {
            id: "order",
            tenantId: options.foreign ? "other-tenant" : "tenant",
            storeId: "store",
            customerId: "customer",
            currencyCode: "NGN",
            totalMinor: 10000,
            amountPaidMinor: 1000,
            status: "CONFIRMED",
          },
        }
      },
    },
    customer: {
      findFirst: async () => ({
        id: "customer",
        normalizedEmail: options.contact ?? "customer@example.test",
        normalizedPhone: null,
      }),
    },
    customerLedgerAccount: {
      findUnique: async () =>
        options.noAccount
          ? null
          : { id: "account", revision: 4n, lastSequence: 3n },
    },
    customerLedgerEntry: {
      aggregate: async (args: { where: { side: string } }) => ({
        _sum: {
          amountMinor:
            args.where.side === "CREDIT" ? (options.credit ?? 1000n) : 0n,
        },
      }),
    },
    customerLedgerAllocation: {
      aggregate: async () => ({ _sum: { amountMinor: 0n } }),
    },
    customerLedgerAllocationRelease: {
      aggregate: async () => ({ _sum: { amountMinor: 0n } }),
    },
    $queryRaw: async () => [{ reservedMinor: options.reserved ?? 0n }],
  } as unknown as Prisma.TransactionClient
  return { tx, sessionReads: () => sessionReads }
}

test("link-only access and a forged common session reveal no balance", async () => {
  const f = fixture()
  expect(
    await getVerifiedCustomerFundsInTransaction(f.tx, {
      ...principal,
      authenticatedSessionId: null,
    }),
  ).toEqual({ status: "VERIFICATION_REQUIRED" })
  expect(f.sessionReads()).toBe(0)
  expect(
    await getVerifiedCustomerFundsInTransaction(f.tx, {
      ...principal,
      authenticatedSessionId: "forged",
    }),
  ).toEqual({ status: "VERIFICATION_REQUIRED" })
})
test("unverified, retargeted, foreign-business and privacy-blocked customer principals cannot disclose credit", async () => {
  for (const options of [
    { unverified: true },
    { contact: "changed@example.test" },
    { foreign: true },
    { privacyBlocked: true },
  ]) {
    expect(
      await getVerifiedCustomerFundsInTransaction(
        fixture(options).tx,
        principal,
      ),
    ).toEqual({ status: "VERIFICATION_REQUIRED" })
  }
})
test("verified positive balance excludes reservations and known zero alone hides the row", async () => {
  expect(
    await getVerifiedCustomerFundsInTransaction(
      fixture({ reserved: 600n }).tx,
      principal,
    ),
  ).toMatchObject({
    status: "VERIFIED",
    accountRevision: "4",
    availableMinor: "400",
    reservedMinor: "600",
    showCredit: true,
  })
  expect(
    await getVerifiedCustomerFundsInTransaction(
      fixture({ credit: 0n }).tx,
      principal,
    ),
  ).toMatchObject({
    status: "VERIFIED",
    availableMinor: "0",
    showCredit: false,
  })
  expect(
    await getVerifiedCustomerFundsInTransaction(
      fixture({ noAccount: true }).tx,
      principal,
    ),
  ).toEqual({ status: "UNLINKED" })
  expect(
    await getVerifiedCustomerFundsInTransaction(
      fixture({ reserved: 1001n }).tx,
      principal,
    ),
  ).toEqual({ status: "UNAVAILABLE" })
})
test("a structurally forged customer capability grants no financial authority", () => {
  const f = fixture()
  expect(() =>
    readCustomerFundsAllocationAuthority(
      f.tx,
      { kind: "CUSTOMER_ORDER_CREDIT" },
      {
        tenantId: "tenant",
        actorUserId: "customer-user",
        accountId: "account",
        bookId: "book",
        orderId: "order",
      },
    ),
  ).toThrow()
})
