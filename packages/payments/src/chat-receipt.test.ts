import { describe, expect, test } from "bun:test"
import {
  chatReceiptAmountMinor,
  createChatReceiptReader,
  normalizedBankReference,
  parseChatReceiptExtraction,
} from "./chat-receipt"

const read = {
  amountText: "62,000.00",
  currencyCode: "NGN",
  senderName: "MUSA IBRAHIM",
  senderAccount: "012****789",
  senderBank: "Access Bank",
  recipientName: "MAMA ADA PROVISIONS",
  recipientAccount: "0123454417",
  recipientBank: "GTBank",
  narration: "Funmi Bello order",
  bankReference: "1000 0426 1102 1142",
  dateRaw: "02 Nov 2026 11:42",
  dateTimeIso: "2026-11-02T11:42:00+01:00",
  documentKind: "transfer_receipt",
  printedStatus: "successful",
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

describe("chat receipt reading", () => {
  test("parses amounts in kobo without the fee or currency sign", () => {
    expect(chatReceiptAmountMinor("62,000.00")).toBe(6_200_000)
    expect(chatReceiptAmountMinor("₦1,240,000")).toBe(124_000_000)
    expect(chatReceiptAmountMinor("62000.5")).toBe(6_200_050)
    expect(chatReceiptAmountMinor("abc")).toBeNull()
    expect(chatReceiptAmountMinor("0")).toBeNull()
    expect(chatReceiptAmountMinor(null)).toBeNull()
  })

  test("normalizes bank references for duplicate checks", () => {
    expect(normalizedBankReference("1000 0426-1102/1142")).toBe(
      "1000042611021142",
    )
    expect(normalizedBankReference("12")).toBeNull()
  })

  test("refuses unknown keys and control characters", () => {
    expect(parseChatReceiptExtraction(read).senderName).toBe("MUSA IBRAHIM")
    expect(() => parseChatReceiptExtraction({ ...read, extra: 1 })).toThrow()
    expect(() =>
      parseChatReceiptExtraction({ ...read, narration: "a\u0001b" }),
    ).toThrow()
    expect(() =>
      parseChatReceiptExtraction({ ...read, documentKind: "invoice" }),
    ).toThrow()
  })

  test("needs a key and an allowed model", () => {
    expect(createChatReceiptReader({})).toBeNull()
    expect(createChatReceiptReader({ apiKey: "k", model: "gpt-x" })).toBeNull()
    expect(createChatReceiptReader({ apiKey: "k" })).not.toBeNull()
  })

  test("sends a PDF as a file and returns usage", async () => {
    let sent: Record<string, unknown> = {}
    const reader = createChatReceiptReader({
      apiKey: "test-key",
      fetchImpl: async (_url, init) => {
        sent = JSON.parse(String(init?.body))
        return response({
          id: "resp_1",
          status: "completed",
          usage: { input_tokens: 900, output_tokens: 120 },
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(read) }],
            },
          ],
        })
      },
    })
    const result = await reader?.({
      file: {
        kind: "pdf",
        bytes: new Uint8Array([37, 80, 68, 70]),
        fileName: "r.pdf",
      },
    })
    expect(result?.extraction.recipientAccount).toBe("0123454417")
    expect(result?.inputTokens).toBe(900)
    const input = sent.input as { content: { type: string }[] }[]
    expect(input[0]?.content[1]?.type).toBe("input_file")
    expect(sent.store).toBe(false)
  })

  test("a provider failure never returns a partial read", async () => {
    const reader = createChatReceiptReader({
      apiKey: "test-key",
      fetchImpl: async () => response({ error: "x" }, 500),
    })
    await expect(
      reader?.({
        file: {
          kind: "image",
          bytes: new Uint8Array([1]),
          contentType: "image/png",
        },
      }),
    ).rejects.toThrow("Receipt reading unavailable.")
  })
})
