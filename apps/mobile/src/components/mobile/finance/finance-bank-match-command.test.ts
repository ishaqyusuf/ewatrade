import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { createFinanceCommandRunner } from "@/lib/finance-command-runner"
import {
  type NativeBankMatchSource,
  nativeBankMatchRecovery,
  prepareNativeBankMatchReview,
  submitNativeBankMatchReview,
} from "./finance-bank-match-command"

const scope = { actorUserId: "owner", tenantId: "tenant", bookId: "book" }
const ids = { bookId: "book", accountId: "bank", statementId: "statement-1" }
const reason = "Aisha paid order 1042 in two transfers"

function fixture() {
  const records = new Map<string, string>()
  const writes: { kind: string; payload: Record<string, unknown> }[] = []
  let id = 0
  let source: NativeBankMatchSource = {
    bookId: "book",
    accountId: "bank",
    bankRevision: "4",
    snapshotSequence: "40",
    statement: { id: "statement-1" },
    rows: [
      {
        id: "row-b",
        externalId: "FT-2",
        amountMinor: "1200000",
        activeMatchId: null,
      },
      {
        id: "row-a",
        externalId: "FT-1",
        amountMinor: "2750000",
        activeMatchId: null,
      },
      {
        id: "row-m",
        externalId: "FT-9",
        amountMinor: "1500000",
        activeMatchId: "match-1",
      },
    ],
    candidates: [
      {
        id: "line-a",
        sequence: "38",
        description: "Order 1042",
        amountMinor: "3950000",
      },
      {
        id: "line-x",
        sequence: "39",
        description: "Bank charges",
        amountMinor: "-100000",
      },
    ],
  }
  const event = {
    id: "match-1",
    kind: "MATCH",
    revision: "3",
    bankRows: [
      {
        id: "row-m",
        statementId: "statement-1",
        externalId: "FT-9",
        occurredAt: "2026-09-12T00:00:00.000Z",
        amountMinor: "1500000",
      },
    ],
    journalLines: [
      {
        id: "line-m",
        entryId: "entry-m",
        sequence: "31",
        effectiveAt: "2026-09-12T00:00:00.000Z",
        payloadHash: "hash",
        debitMinor: "1500000",
        creditMinor: "0",
      },
    ],
    amountMinor: "1500000",
  }
  const state = {
    current: true,
    committed: false,
    loseResponse: false,
    locked: false,
    duringWrite: null as null | (() => void),
    stale: 0,
  }
  const runtime = {
    storage: {
      getItem: async (key: string) => records.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        records.set(key, value)
      },
      removeItem: async (key: string) => {
        records.delete(key)
      },
    },
    uuid: () => `command-${++id}`,
    hash: async (value: string) =>
      createHash("sha256").update(value).digest("hex"),
    status: async () =>
      state.committed ? ("COMMITTED" as const) : ("NOT_FOUND" as const),
    isCurrent: () => state.current,
    withLock: async <T>(action: () => Promise<T>) => {
      if (state.locked) throw new Error("Another command owns this book")
      state.locked = true
      try {
        return await action()
      } finally {
        state.locked = false
      }
    },
  }
  const runner = createFinanceCommandRunner(scope, runtime)
  const reads = {
    readSource: async () => source,
    readMatchEvent: async () => event,
    isCurrent: () => state.current,
  }
  const record = (kind: string) => async (payload: Record<string, unknown>) => {
    state.duringWrite?.()
    writes.push({ kind, payload })
    if (state.loseResponse) throw new Error("Network response lost")
    state.committed = true
    source = {
      ...source,
      bankRevision: String(Number(source.bankRevision) + 1),
    }
  }
  const submit = (
    review: Awaited<ReturnType<typeof prepareNativeBankMatchReview>>,
  ) =>
    submitNativeBankMatchReview({
      ...reads,
      review,
      run: runner.run,
      write: { match: record("match"), unmatch: record("unmatch") },
      onStale: () => {
        state.stale += 1
      },
    })
  return {
    records,
    writes,
    state,
    runtime,
    runner,
    reads,
    submit,
    setSource: (next: Partial<NativeBankMatchSource>) => {
      source = { ...source, ...next }
    },
    stored: () => {
      const raw = [...records.values()][0]
      return raw
        ? (JSON.parse(raw) as { command: Record<string, unknown> })
        : null
    },
  }
}

const match = {
  kind: "MATCH" as const,
  bankRowIds: ["row-b", "row-a"],
  journalLineIds: ["line-a"],
}
const reviewed = { expectedRevision: "4", expectedSnapshotSequence: "40" }

describe("native bank match command", () => {
  test("records one exact sorted match and clears its saved identity", async () => {
    const f = fixture()
    const review = await prepareNativeBankMatchReview({
      ...f.reads,
      ...ids,
      action: match,
      reason: `  ${reason}  `,
      reviewed,
    })
    expect(review.amountMinor).toBe("3950000")
    expect(review.retry).toBe(false)
    let savedDuringWrite: unknown = null
    f.state.duringWrite = () => {
      savedDuringWrite = f.stored()
    }
    expect(await f.submit(review)).toBe("RECORDED")
    expect(f.writes).toEqual([
      {
        kind: "match",
        payload: {
          bookId: "book",
          accountId: "bank",
          expectedRevision: "4",
          expectedSnapshotSequence: "40",
          reason,
          bankRowIds: ["row-a", "row-b"],
          journalLineIds: ["line-a"],
          clientCommandId: "command-2",
        },
      },
    ])
    // Recovery metadata: account, statement, revisions and identities only.
    const command = (savedDuringWrite as { command: Record<string, unknown> })
      .command
    expect(command.operation).toBe("matchBankStatement")
    expect(command.recoveryMetadata).toEqual({
      accountId: "bank",
      expectedBankRevision: "4",
      expectedSnapshotSequence: "40",
      bankReview: {
        statementId: "statement-1",
        action: "MATCH",
        bankRowIds: ["row-a", "row-b"],
        journalLineIds: ["line-a"],
      },
    })
    const raw = JSON.stringify(savedDuringWrite)
    expect(raw).not.toContain("Aisha")
    expect(raw).not.toContain("3950000")
    expect(f.records.size).toBe(0)
  })

  test("refuses totals that differ before anything is saved", async () => {
    const f = fixture()
    await expect(
      prepareNativeBankMatchReview({
        ...f.reads,
        ...ids,
        action: {
          kind: "MATCH",
          bankRowIds: ["row-a"],
          journalLineIds: ["line-x"],
        },
        reason,
        reviewed,
      }),
    ).rejects.toThrow("Selected totals differ")
    expect(f.records.size).toBe(0)
  })

  test("a review taken on older revisions is stale", async () => {
    const f = fixture()
    f.setSource({ snapshotSequence: "41" })
    await expect(
      prepareNativeBankMatchReview({
        ...f.reads,
        ...ids,
        action: match,
        reason,
        reviewed,
      }),
    ).rejects.toThrow(
      "Bank evidence or posted records changed. Refresh and review again.",
    )
  })

  test("evidence that changes before transport is not sent and asks for a refresh", async () => {
    const f = fixture()
    const review = await prepareNativeBankMatchReview({
      ...f.reads,
      ...ids,
      action: match,
      reason,
      reviewed,
    })
    f.setSource({ bankRevision: "5" })
    await expect(f.submit(review)).rejects.toThrow(
      "Bank evidence or posted records changed",
    )
    expect(f.writes).toHaveLength(0)
    expect(f.state.stale).toBe(1)
    expect(f.records.size).toBe(0)
  })

  test("the reviewed payload stays exact when caller data changes while hashing", async () => {
    const f = fixture()
    const review = await prepareNativeBankMatchReview({
      ...f.reads,
      ...ids,
      action: match,
      reason,
      reviewed,
    })
    const hash = f.runtime.hash
    f.runtime.hash = async (value) => {
      if (review.action.kind === "MATCH") review.action.bankRowIds.push("row-m")
      review.payload.reason = "Changed after review"
      return hash(value)
    }
    await f.submit(review)
    expect(f.writes[0]?.payload).toMatchObject({
      reason,
      bankRowIds: ["row-a", "row-b"],
    })
  })

  test("an uncertain match is retried only with its saved identity and exact reason", async () => {
    const f = fixture()
    const review = await prepareNativeBankMatchReview({
      ...f.reads,
      ...ids,
      action: match,
      reason,
      reviewed,
    })
    f.state.loseResponse = true
    await expect(f.submit(review)).rejects.toThrow("Network response lost")
    const retained = await f.runner.inspect()
    expect(retained?.command.clientCommandId).toBe("command-2")
    const recovery = nativeBankMatchRecovery(retained?.command, ids)
    expect(recovery).toEqual({
      expectedRevision: "4",
      expectedSnapshotSequence: "40",
      action: {
        kind: "MATCH",
        bankRowIds: ["row-a", "row-b"],
        journalLineIds: ["line-a"],
      },
    })
    // An unmatch cannot replace the saved match.
    await expect(
      prepareNativeBankMatchReview({
        ...f.reads,
        ...ids,
        action: { kind: "UNMATCH", matchId: "match-1", matchRevision: "3" },
        reason,
        retained: retained?.command,
      }),
    ).rejects.toThrow("Only the same action can be retried")
    // A different reason is a different payload; the runner refuses it.
    const changed = await prepareNativeBankMatchReview({
      ...f.reads,
      ...ids,
      action: {
        kind: "MATCH",
        bankRowIds: ["row-a"],
        journalLineIds: ["line-x"],
      },
      reason: "Something else",
      retained: retained?.command,
    })
    expect(changed.retry).toBe(true)
    expect(changed.action).toEqual(recovery?.action ?? match)
    f.state.loseResponse = false
    await expect(f.submit(changed)).rejects.toThrow(
      "An unresolved submission exists",
    )
    expect(f.writes).toHaveLength(1)
    // Same reason: same command ID, sent once more.
    const exact = await prepareNativeBankMatchReview({
      ...f.reads,
      ...ids,
      action: match,
      reason,
      retained: retained?.command,
    })
    expect(await f.submit(exact)).toBe("RECORDED")
    expect(f.writes).toHaveLength(2)
    expect(f.writes[1]?.payload.clientCommandId).toBe("command-2")
    expect(f.records.size).toBe(0)
  })

  test("undoes an active match after checking its original evidence", async () => {
    const f = fixture()
    const review = await prepareNativeBankMatchReview({
      ...f.reads,
      ...ids,
      action: { kind: "UNMATCH", matchId: "match-1", matchRevision: "3" },
      reason: "Matched to the wrong order",
      reviewed,
    })
    expect(review.amountMinor).toBe("1500000")
    expect(await f.submit(review)).toBe("RECORDED")
    expect(f.writes[0]).toEqual({
      kind: "unmatch",
      payload: {
        bookId: "book",
        accountId: "bank",
        expectedRevision: "4",
        expectedSnapshotSequence: "40",
        reason: "Matched to the wrong order",
        matchId: "match-1",
        clientCommandId: "command-2",
      },
    })
  })

  test("an unmatch whose rows were already released is refused", async () => {
    const f = fixture()
    f.setSource({
      rows: [
        {
          id: "row-m",
          externalId: "FT-9",
          amountMinor: "1500000",
          activeMatchId: null,
        },
      ],
    })
    await expect(
      prepareNativeBankMatchReview({
        ...f.reads,
        ...ids,
        action: { kind: "UNMATCH", matchId: "match-1", matchRevision: "3" },
        reason: "Wrong",
        reviewed,
      }),
    ).rejects.toThrow("already undone or has changed")
  })

  test("a lost connection or scope change stops before any storage", async () => {
    const f = fixture()
    f.state.current = false
    await expect(
      prepareNativeBankMatchReview({
        ...f.reads,
        ...ids,
        action: match,
        reason,
        reviewed,
      }),
    ).rejects.toThrow("Finance access or connection changed")
    expect(f.records.size).toBe(0)
  })

  test("another retained submission blocks matching on this statement", () => {
    const retained = {
      ...scope,
      version: 1 as const,
      operation: "importBankStatement",
      clientCommandId: "command-1",
      salt: "salt",
      payloadDigest: "0".repeat(64),
      createdAt: "2026-10-27T00:00:00.000Z",
      recoveryMetadata: { accountId: "bank", expectedBankRevision: "4" },
    }
    expect(nativeBankMatchRecovery(null, ids)).toBeNull()
    expect(() => nativeBankMatchRecovery(retained, ids)).toThrow(
      "Check the earlier submission's result first",
    )
    expect(() =>
      nativeBankMatchRecovery(
        {
          ...retained,
          operation: "matchBankStatement",
          recoveryMetadata: {
            accountId: "bank",
            expectedBankRevision: "4",
            expectedSnapshotSequence: "40",
            bankReview: {
              statementId: "statement-2",
              action: "MATCH",
              bankRowIds: ["row-a"],
              journalLineIds: ["line-a"],
            },
          },
        },
        ids,
      ),
    ).toThrow("Check the earlier submission's result first")
  })
})
