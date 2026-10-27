import { describe, expect, test } from "bun:test"
import {
  PaystackBankingError,
  PaystackBankingProvider,
} from "./paystack-banking"

const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ status: status === 200, data }), { status })
const recipient = {
  active: true,
  currency: "NGN",
  recipient_code: "RCP_aisha",
  details: {
    account_number: "0123456789",
    bank_code: "058",
    bank_name: "GTBank",
    account_name: "AISHA YUSUF",
  },
}
describe("Paystack banking transport", () => {
  test("creates a confirmed recipient and returns only reusable token and masked identity", async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    const provider = new PaystackBankingProvider({
      secretKey: "secret-for-test",
      fetch: (async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
        expect(init?.redirect).toBe("error")
        return response(recipient)
      }) as typeof fetch,
    })
    expect(
      await provider.createRecipient({
        accountNumber: "0123456789",
        bankCode: "058",
        confirmedAccountName: "AISHA YUSUF",
      }),
    ).toEqual({
      recipientCode: "RCP_aisha",
      accountName: "AISHA YUSUF",
      bankCode: "058",
      bankName: "GTBank",
      accountSuffix: "6789",
      currencyCode: "NGN",
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.body).toMatchObject({
      type: "nuban",
      currency: "NGN",
      account_number: "0123456789",
    })
  })

  test("refuses returned recipient identity changes", async () => {
    const provider = new PaystackBankingProvider({
      secretKey: "test",
      fetch: (async () =>
        response({
          ...recipient,
          details: { ...recipient.details, bank_code: "044" },
        })) as typeof fetch,
    })
    await expect(
      provider.createRecipient({
        accountNumber: "0123456789",
        bankCode: "058",
        confirmedAccountName: "AISHA YUSUF",
      }),
    ).rejects.toMatchObject({ outcome: "UNKNOWN" })
  })

  test("unknown writes are attempted once, never retried, and expose no private provider body", async () => {
    let attempts = 0
    const provider = new PaystackBankingProvider({
      secretKey: "private",
      fetch: (async () => {
        attempts++
        throw new Error("private account data")
      }) as typeof fetch,
    })
    const error = await provider
      .sendTransfer({
        amountMinor: 5_000_000,
        recipientCode: "RCP_aisha",
        reference: "po_123456789abcdef",
        reason: "Payment",
      })
      .catch((error: unknown) => error)
    expect(error).toBeInstanceOf(PaystackBankingError)
    expect(error).toMatchObject({ outcome: "UNKNOWN" })
    expect(String(error)).not.toContain("private")
    expect(attempts).toBe(1)
  })

  test("always sends from provider balance and verifies returned money identity", async () => {
    const input = {
      amountMinor: 5_000_000,
      recipientCode: "RCP_aisha",
      reference: "po_123456789abcdef",
      reason: "Payment",
    }
    const provider = new PaystackBankingProvider({
      secretKey: "test",
      fetch: (async (_url, init) => {
        expect(JSON.parse(String(init?.body))).toEqual({
          source: "balance",
          amount: input.amountMinor,
          recipient: input.recipientCode,
          reference: input.reference,
          reason: input.reason,
          currency: "NGN",
        })
        return response({
          amount: 4_000_000,
          recipient: "RCP_aisha",
          reference: input.reference,
          transfer_code: "TRF_123",
          status: "success",
          currency: "NGN",
        })
      }) as typeof fetch,
    })
    await expect(provider.sendTransfer(input)).rejects.toMatchObject({
      outcome: "UNKNOWN",
    })
  })

  test("missing DVA assignment proof cannot activate an account", async () => {
    const provider = new PaystackBankingProvider({
      secretKey: "test",
      fetch: (async () =>
        response({
          id: 1,
          account_number: "0123456789",
          account_name: "Business",
          currency: "NGN",
          active: true,
          customer: { customer_code: "CUS_a" },
          bank: { name: "Wema", slug: "wema-bank" },
        })) as typeof fetch,
    })
    await expect(
      provider.createReceivingAccount({
        customerCode: "CUS_a",
        bankSlug: "wema-bank",
      }),
    ).rejects.toMatchObject({ outcome: "UNKNOWN" })
  })

  test("invalid money and account inputs make zero provider calls", async () => {
    let calls = 0
    const provider = new PaystackBankingProvider({
      secretKey: "test",
      fetch: (async () => {
        calls++
        return response({})
      }) as typeof fetch,
    })
    expect(() =>
      provider.resolveAccount({ accountNumber: "123", bankCode: "058" }),
    ).toThrow()
    expect(() =>
      provider.sendTransfer({
        amountMinor: 1.5,
        recipientCode: "RCP_a",
        reference: "po_123456789abcdef",
        reason: "Payment",
      }),
    ).toThrow()
    expect(calls).toBe(0)
  })
})
