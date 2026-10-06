import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { createFinanceCommandRunner } from "@/lib/finance-command-runner"
import {
  prepareNativeBankImportReview,
  submitNativeBankImportReview,
} from "./finance-bank-import-command"
import type { NativeFinanceBankImportSource } from "./finance-bank-import-state"

const scope = { actorUserId: "owner", tenantId: "tenant", bookId: "book" }
const draft = {
  selectedAccountId: "bank",
  bytes: new TextEncoder().encode(
    "id,date,amount,description\noriginal,2026-09-30,-12.34,Private bank description",
  ),
  columns: {
    transactionId: "id",
    date: "date",
    amount: "amount",
    description: "description",
  },
  units: "MAJOR" as const,
  reference: "Private September statement",
  startsOn: "2026-09-01",
  endsOn: "2026-09-30",
  openingBalance: "20.00",
  closingBalance: "7.66",
}
function fixture() {
  const records = new Map<string, string>()
  const writes: unknown[] = []
  let id = 0
  let source: NativeFinanceBankImportSource = {
    book: {
      id: "book",
      currencyCode: "NGN",
      startsAt: "2026-09-01T00:00:00.000Z",
    },
    account: {
      id: "bank",
      bookId: "book",
      kind: "ASSET",
      purpose: "BANK",
      archivedAt: null,
    },
    bankRevision: "4",
  }
  const state = {
    current: true,
    committed: false,
    failAfterWrite: false,
    locked: false,
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
  const runner = () => createFinanceCommandRunner(scope, runtime)
  const readSource = async () => source
  const write = async (payload: unknown) => {
    writes.push(payload)
    state.committed = true
    source = { ...source, bankRevision: "5" }
    if (state.failAfterWrite) throw new Error("Response lost")
  }
  return {
    records,
    writes,
    state,
    runtime,
    runner,
    readSource,
    write,
    changeSource: (next: Partial<NativeFinanceBankImportSource>) => {
      source = { ...source, ...next }
    },
    review: async (
      retained?: Awaited<ReturnType<ReturnType<typeof runner>["inspect"]>>,
    ) =>
      prepareNativeBankImportReview({
        draft,
        readSource,
        retained: retained?.command,
        isCurrent: () => state.current,
        now: new Date("2026-10-02T12:00:00.000Z"),
      }),
  }
}

describe("native original bank import command", () => {
  test("the reviewed payload remains exact when caller data changes during asynchronous hashing", async () => {
    const f = fixture()
    const preview = await f.review()
    const originalHash = f.runtime.hash
    f.runtime.hash = async (value) => {
      preview.reference = "Changed after review"
      preview.startsAt.setUTCDate(2)
      preview.columns.amount = "other amount"
      return originalHash(value)
    }
    await submitNativeBankImportReview({
      preview,
      run: f.runner().run,
      readSource: f.readSource,
      isCurrent: () => f.state.current,
      write: f.write,
    })
    expect(f.writes[0]).toMatchObject({
      reference: draft.reference,
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      columns: { amount: "amount" },
    })
    expect(f.records.size).toBe(0)
  })

  test("records the reviewed exact payload once and clears metadata after confirmation", async () => {
    const f = fixture()
    const preview = await f.review()
    await submitNativeBankImportReview({
      preview,
      run: f.runner().run,
      readSource: f.readSource,
      isCurrent: () => f.state.current,
      write: f.write,
    })
    expect(f.writes).toHaveLength(1)
    expect(f.writes[0]).toEqual({
      bookId: "book",
      accountId: "bank",
      clientCommandId: "command-2",
      expectedRevision: "4",
      currencyCode: "NGN",
      reference: draft.reference,
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      endsAt: new Date("2026-09-30T23:59:59.999Z"),
      openingBalanceMinor: "2000",
      closingBalanceMinor: "766",
      csv: new TextDecoder().decode(draft.bytes),
      columns: draft.columns,
      units: "MAJOR",
    })
    expect(f.records.size).toBe(0)
  })

  test("lost response survives restart with original revision and no private payload persisted", async () => {
    const f = fixture()
    const first = f.runner()
    const preview = await f.review()
    f.state.failAfterWrite = true
    await expect(
      submitNativeBankImportReview({
        preview,
        run: first.run,
        readSource: f.readSource,
        isCurrent: () => f.state.current,
        write: f.write,
      }),
    ).rejects.toThrow("Response lost")
    const raw = [...f.records.values()][0] ?? ""
    expect(raw).not.toContain(draft.reference)
    expect(raw).not.toContain("Private bank description")
    expect(raw).not.toContain("openingBalanceMinor")
    expect(raw).not.toContain("csv")
    const restarted = f.runner()
    const retained = await restarted.inspect()
    expect(retained?.command.recoveryMetadata).toEqual({
      accountId: "bank",
      expectedBankRevision: "4",
    })
    const recovered = await f.review(retained)
    expect(recovered.expectedRevision).toBe("4")
    await expect(
      submitNativeBankImportReview({
        preview: recovered,
        run: restarted.run,
        readSource: f.readSource,
        isCurrent: () => f.state.current,
        write: f.write,
      }),
    ).rejects.toThrow("acknowledge")
    expect(f.writes).toHaveLength(1)
    expect(await restarted.acknowledge()).toBe("RECORDED")
    expect(f.records.size).toBe(0)
  })

  test("uncertain retry refuses changed details and retains its original identity", async () => {
    const f = fixture()
    const preview = await f.review()
    const first = f.runner()
    await expect(
      submitNativeBankImportReview({
        preview,
        run: first.run,
        readSource: f.readSource,
        isCurrent: () => f.state.current,
        write: async () => {
          throw new Error("No response")
        },
      }),
    ).rejects.toThrow("No response")
    const saved = [...f.records.values()][0]
    const restarted = f.runner()
    await expect(
      submitNativeBankImportReview({
        preview: { ...preview, reference: "Replacement" },
        run: restarted.run,
        readSource: f.readSource,
        isCurrent: () => f.state.current,
        write: f.write,
      }),
    ).rejects.toThrow("exact original details")
    expect([...f.records.values()][0]).toBe(saved)
    expect(f.writes).toHaveLength(0)
  })

  test("fresh bank revision/archive checks after hashing prevent transport and clear a new unsent intention", async () => {
    for (const change of ["revision", "archive"] as const) {
      const f = fixture()
      const preview = await f.review()
      const originalHash = f.runtime.hash
      f.runtime.hash = async (value) => {
        if (change === "revision") f.changeSource({ bankRevision: "5" })
        else
          f.changeSource({
            account: {
              ...(await f.readSource()).account,
              archivedAt: new Date(),
            },
          })
        return originalHash(value)
      }
      await expect(
        submitNativeBankImportReview({
          preview,
          run: f.runner().run,
          readSource: f.readSource,
          isCurrent: () => f.state.current,
          write: f.write,
        }),
      ).rejects.toThrow()
      expect(f.writes).toHaveLength(0)
      expect(f.records.size).toBe(0)
    }
  })

  test("a pre-transport refusal on an already uncertain command never discards the original intention", async () => {
    const f = fixture()
    const preview = await f.review()
    const first = f.runner()
    await expect(
      submitNativeBankImportReview({
        preview,
        run: first.run,
        readSource: f.readSource,
        isCurrent: () => f.state.current,
        write: async () => {
          throw new Error("No response")
        },
      }),
    ).rejects.toThrow()
    const saved = [...f.records.values()][0]
    f.changeSource({ bankRevision: "5" })
    await expect(
      submitNativeBankImportReview({
        preview,
        run: f.runner().run,
        readSource: f.readSource,
        isCurrent: () => f.state.current,
        write: f.write,
      }),
    ).rejects.toThrow("changed after review")
    expect([...f.records.values()][0]).toBe(saved)
    expect(f.writes).toHaveLength(0)
  })

  test("an access change while a fresh source read awaits cannot enter transport", async () => {
    const f = fixture()
    const preview = await f.review()
    await expect(
      submitNativeBankImportReview({
        preview,
        run: f.runner().run,
        readSource: async () => {
          f.state.current = false
          return f.readSource()
        },
        isCurrent: () => f.state.current,
        write: f.write,
      }),
    ).rejects.toThrow("original account")
    expect(f.writes).toHaveLength(0)
    f.state.current = true
    expect(await f.runner().inspect()).not.toBeNull()
  })
})
