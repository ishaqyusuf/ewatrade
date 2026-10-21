import { describe, expect, test } from "bun:test"
import { generalActionSchema } from "@ewatrade/assistant/general/contracts"
import {
  type CurrentGeneralDraftSnapshot,
  selectCurrentGeneralDraft,
} from "./general-current-draft"
import { proposalDigest } from "./proposal-security"

const payload = generalActionSchema.parse({
  action: "product_create",
  name: "Egg",
  canonicalUnitName: "Egg",
  priceMinor: 15000,
  openingStock: "25",
})

function fixture(): CurrentGeneralDraftSnapshot {
  const row = {
    id: "draft",
    conversationId: "chat",
    tenantId: "tenant",
    storeId: "store",
    actorUserId: "owner",
    action: payload.action,
    actionVersion: 1,
    payload,
    payloadHash: proposalDigest(payload),
    revision: 1,
    status: "PENDING",
    expiresAt: new Date("2027-01-01T00:00:00Z"),
  }
  return {
    scope: { tenantId: "tenant", storeId: "store", userId: "owner" },
    conversationId: "chat",
    runId: "current-run",
    currentRun: {
      id: "current-run",
      conversationId: "chat",
      actorUserId: "owner",
      requestId: "request",
      status: "RUNNING",
    },
    userMessage: {
      conversationId: "chat",
      role: "user",
      sequence: 5,
      clientRequestId: "request",
    },
    sources: [
      {
        id: "reply",
        conversationId: "chat",
        role: "assistant",
        sequence: 2,
        completedRun: {
          id: "draft-run",
          conversationId: "chat",
          actorUserId: "owner",
          requestId: "old-request",
          status: "COMPLETED",
          assistantMessageId: "reply",
        },
        parts: [
          {
            type: "data-general-proposal-reference",
            data: {
              proposalId: row.id,
              revision: row.revision,
              payloadHash: row.payloadHash,
            },
          },
        ],
      },
    ],
    pending: [row],
    now: new Date("2026-10-21T00:00:00Z"),
  }
}

describe("server-current product draft", () => {
  test("continues the committed draft across an intervening clarification", () => {
    const input = fixture()
    const source = input.sources[0]
    expect(source).toBeDefined()
    if (!source?.completedRun) throw Error("Missing fixture")
    input.sources = [
      {
        ...source,
        id: "clarification",
        sequence: 4,
        parts: [{ type: "text", text: "Which stock quantity?" }],
        completedRun: {
          ...source.completedRun,
          id: "clarifying-run",
          assistantMessageId: "clarification",
        },
      },
      source,
    ]
    const current = selectCurrentGeneralDraft(input)
    expect(current.status).toBe("available")
    if (current.status !== "available") throw Error("Draft unavailable")
    expect(current.source.kind).toBe("committed_reference")
    expect(current.source.anchor?.messageId).toBe("reply")
    expect(current.source.runId).toBe("current-run")
    expect(current.payload).toEqual(payload)
    expect(JSON.stringify(current)).not.toContain("approvalToken")
  })

  test("two pending drafts stay ambiguous even when the latest source names one", () => {
    const input = fixture()
    const row = input.pending[0]
    if (!row) throw Error("Missing fixture")
    input.pending = [row, { ...row, id: "older-still-pending" }]
    expect(selectCurrentGeneralDraft(input)).toEqual({ status: "ambiguous" })
    input.sources = []
    expect(selectCurrentGeneralDraft(input)).toEqual({ status: "ambiguous" })
  })

  test("supports only a unique scoped legacy product draft without a reference", () => {
    const input = fixture()
    input.sources = []
    const current = selectCurrentGeneralDraft(input)
    expect(current.status).toBe("available")
    if (current.status !== "available") throw Error("Draft unavailable")
    expect(current.source.kind).toBe("legacy_unique")
    expect(current.source.anchor).toBeUndefined()
    expect(current.source.proposalId).toBe("draft")
  })

  test("returns current canonical web-edit revision while retaining its immutable old anchor", () => {
    const input = fixture()
    const row = input.pending[0]
    if (!row) throw Error("Missing fixture")
    const revised = { ...payload, name: "Egg revised" }
    input.pending = [
      {
        ...row,
        payload: revised,
        payloadHash: proposalDigest(revised),
        revision: 2,
      },
    ]
    const current = selectCurrentGeneralDraft(input)
    expect(current.status).toBe("available")
    if (current.status !== "available") throw Error("Draft unavailable")
    expect(current.payload.name).toBe("Egg revised")
    expect(current.source.revision).toBe(2)
    expect(current.source.payloadHash).toBe(proposalDigest(revised))
    expect(current.source.anchor?.revision).toBe(1)
    expect(current.source.anchor?.payloadHash).toBe(row.payloadHash)
  })

  test("does not fall back to legacy selection when the latest reference names another draft", () => {
    const input = fixture()
    const source = input.sources[0]
    if (!source) throw Error("Missing fixture")
    input.sources = [
      {
        ...source,
        parts: [
          {
            type: "data-general-proposal-reference",
            data: {
              proposalId: "another-draft",
              revision: 1,
              payloadHash: proposalDigest(payload),
            },
          },
        ],
      },
    ]
    expect(selectCurrentGeneralDraft(input)).toEqual({ status: "unavailable" })
  })

  test("corrupt or multiple persisted references never become a legacy fallback", () => {
    const input = fixture()
    const source = input.sources[0]
    if (!source || !Array.isArray(source.parts)) throw Error("Missing fixture")
    input.sources = [{ ...source, parts: [...source.parts, ...source.parts] }]
    expect(selectCurrentGeneralDraft(input)).toEqual({ status: "ambiguous" })
    input.sources = [
      {
        ...source,
        parts: [{ type: "data-general-proposal-reference", data: {} }],
      },
    ]
    expect(selectCurrentGeneralDraft(input)).toEqual({ status: "unavailable" })
  })

  test("refuses changed ownership, scope, status, expiry, payload and current revision hash", () => {
    const base = fixture()
    const row = base.pending[0]
    if (!row) throw Error("Missing fixture")
    for (const change of [
      { actorUserId: "other" },
      { tenantId: "other" },
      { storeId: "other" },
      { conversationId: "other" },
      { status: "CANCELLED" },
      { expiresAt: base.now },
      { actionVersion: 2 },
      { payload: { ...payload, name: "tampered" } },
      { payloadHash: "a".repeat(64) },
    ]) {
      expect(
        selectCurrentGeneralDraft({
          ...base,
          pending: [{ ...row, ...change }],
        }),
      ).toEqual({ status: "unavailable" })
    }
  })

  test("requires the exact persisted user request and a completed source in the same scope", () => {
    const input = fixture()
    const run = input.currentRun
    const user = input.userMessage
    const source = input.sources[0]
    if (!run || !user || !source || !source.completedRun)
      throw Error("Missing fixture")
    expect(
      selectCurrentGeneralDraft({
        ...input,
        currentRun: { ...run, actorUserId: "other" },
      }),
    ).toEqual({ status: "unavailable" })
    expect(
      selectCurrentGeneralDraft({
        ...input,
        userMessage: { ...user, clientRequestId: "other" },
      }),
    ).toEqual({ status: "unavailable" })
    expect(
      selectCurrentGeneralDraft({
        ...input,
        sources: [{ ...source, sequence: user.sequence }],
      }),
    ).toEqual({ status: "unavailable" })
    expect(
      selectCurrentGeneralDraft({
        ...input,
        sources: [
          {
            ...source,
            completedRun: { ...source.completedRun, status: "FAILED" },
          },
        ],
      }),
    ).toEqual({ status: "unavailable" })
  })

  test("does not enroll other pending actions in product correction", () => {
    const input = fixture()
    const row = input.pending[0]
    if (!row) throw Error("Missing fixture")
    const customer = generalActionSchema.parse({
      action: "customer_create",
      name: "Ada",
    })
    input.pending = [
      {
        ...row,
        action: customer.action,
        payload: customer,
        payloadHash: proposalDigest(customer),
      },
    ]
    expect(selectCurrentGeneralDraft(input)).toEqual({ status: "unavailable" })
    expect(selectCurrentGeneralDraft({ ...input, pending: [] })).toEqual({
      status: "none",
    })
  })
})
