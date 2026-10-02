import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  isFinanceCommandRecoveryMetadata,
  validatePendingFinanceCommand,
} from "@ewatrade/utils/finance-command-identity"
import { financePurchaseRecognitionSchema } from "../../../../../api/src/schemas/finance-purchases"
import { createFinanceCommandRunner } from "../../../lib/finance-command-runner"
import {
  purchaseReceiptRecoveryMetadata,
  retainedPurchaseReceiptConfirmations,
} from "./supplier-purchase-recognition-state"

const scope = { actorUserId: "owner", tenantId: "business", bookId: "book" }
const source = {
  bookId: "book",
  recognitionId: "purchase",
  storeId: "store",
  lineIds: ["line-b", "line-a"],
}
const original = {
  bookId: "book",
  recognitionId: "purchase",
  stage: "RECEIPT" as const,
  effectiveAt: new Date("2026-10-01T00:00:00.000Z"),
  reference: "Private delivery reference",
  receipts: [
    { lineId: "line-b", expectedBalanceRevision: 7 },
    { lineId: "line-a", expectedBalanceRevision: 0 },
  ],
}
function fixture() {
  const records = new Map<string, string>()
  let uuid = 0
  const runtime = {
    storage: {
      getItem: async (key: string) => records.get(key) ?? null,
      setItem: async (key: string, value: string) =>
        void records.set(key, value),
      removeItem: async (key: string) => void records.delete(key),
    },
    uuid: () => `command-${++uuid}`,
    hash: async (value: string) =>
      createHash("sha256").update(value).digest("hex"),
    status: async () => "NOT_FOUND" as const,
    isCurrent: () => true,
    withLock: async <T>(run: () => Promise<T>) => run(),
  }
  return {
    runtime,
    records,
    runner: createFinanceCommandRunner(scope, runtime),
  }
}
function metadata() {
  return purchaseReceiptRecoveryMetadata({
    recognitionId: source.recognitionId,
    storeId: source.storeId,
    receipts: original.receipts,
  })
}

test("receipt restart restores original ordered stock revisions and original command only", async () => {
  const f = fixture()
  let firstId = ""
  await expect(
    f.runner.run(
      "recognizePurchase",
      original,
      async (id) => {
        firstId = id
        throw new Error("Response lost")
      },
      { recoveryMetadata: metadata() },
    ),
  ).rejects.toThrow("Response lost")
  const raw = [...f.records.values()][0] ?? ""
  expect(raw).not.toContain(original.reference)
  expect(raw).not.toContain("effectiveAt")
  expect(raw).not.toContain("amountMinor")
  const restarted = createFinanceCommandRunner(scope, f.runtime)
  const pending = await restarted.inspect()
  const receipts = retainedPurchaseReceiptConfirmations(
    pending?.command,
    source,
  )
  expect(receipts).toEqual(original.receipts)
  const reentered = { ...original, receipts: receipts ?? [] }
  expect(
    financePurchaseRecognitionSchema.parse({
      ...reentered,
      clientCommandId: firstId,
    }).receipts,
  ).toEqual(original.receipts)
  let sent = ""
  await restarted.run("recognizePurchase", reentered, async (id) => {
    sent = id
  })
  expect(sent).toBe(firstId)
  expect(f.records.size).toBe(0)
})

test("receipt restart refuses changed reference, date, revision or line order without replacing identity", async () => {
  const f = fixture()
  await expect(
    f.runner.run(
      "recognizePurchase",
      original,
      async () => {
        throw new Error("Lost")
      },
      { recoveryMetadata: metadata() },
    ),
  ).rejects.toThrow()
  const saved = [...f.records.values()][0]
  const restarted = createFinanceCommandRunner(scope, f.runtime)
  let writes = 0
  for (const changed of [
    { ...original, reference: "Changed reference" },
    { ...original, effectiveAt: new Date("2026-10-02T00:00:00.000Z") },
    {
      ...original,
      receipts: original.receipts.map((line) => ({
        ...line,
        expectedBalanceRevision: 8,
      })),
    },
    { ...original, receipts: [...original.receipts].reverse() },
  ]) {
    await expect(
      restarted.run("recognizePurchase", changed, async () => {
        writes++
      }),
    ).rejects.toThrow("exact original details")
    expect([...f.records.values()][0]).toBe(saved)
  }
  expect(writes).toBe(0)
})

test("receipt metadata is bounded, private-field free and tied to the exact source line set", async () => {
  const pending = {
    ...scope,
    version: 1 as const,
    operation: "recognizePurchase",
    clientCommandId: "command",
    salt: "salt",
    payloadDigest: "a".repeat(64),
    createdAt: "2026-10-02T00:00:00.000Z",
    recoveryMetadata: metadata(),
  }
  expect(validatePendingFinanceCommand(pending, scope)).toEqual(pending)
  for (const changed of [
    { ...source, bookId: "other" },
    { ...source, storeId: "other" },
    { ...source, recognitionId: "other" },
    { ...source, lineIds: ["line-b"] },
    { ...source, lineIds: ["line-b", "line-b"] },
    { ...source, lineIds: ["line-b", "other"] },
  ])
    expect(retainedPurchaseReceiptConfirmations(pending, changed)).toBeNull()
  expect(
    retainedPurchaseReceiptConfirmations(
      { ...pending, recoveryMetadata: undefined },
      source,
    ),
  ).toBeNull()
  expect(() =>
    validatePendingFinanceCommand(
      { ...pending, operation: "recordCashCount" },
      scope,
    ),
  ).toThrow("invalid retry metadata")
  for (const receipt of [
    { ...metadata().purchaseReceipt, reference: "Private" },
    {
      ...metadata().purchaseReceipt,
      receipts: [{ ...original.receipts[0], amountMinor: "12" }],
    },
    {
      ...metadata().purchaseReceipt,
      receipts: [original.receipts[0], original.receipts[0]],
    },
    { ...metadata().purchaseReceipt, receipts: [] },
    {
      ...metadata().purchaseReceipt,
      receipts: Array.from({ length: 11 }, (_, i) => ({
        lineId: `line-${i}`,
        expectedBalanceRevision: 0,
      })),
    },
    ...[-1, 1.5, 2_147_483_647, "7"].map((revision) => ({
      ...metadata().purchaseReceipt,
      receipts: [{ lineId: "line-b", expectedBalanceRevision: revision }],
    })),
  ])
    expect(isFinanceCommandRecoveryMetadata({ purchaseReceipt: receipt })).toBe(
      false,
    )
})

test("altered receipt metadata readback blocks the first mutation", async () => {
  const f = fixture()
  const set = f.runtime.storage.setItem
  f.runtime.storage.setItem = async (key, value) => {
    const stored = JSON.parse(value)
    stored.command.recoveryMetadata.purchaseReceipt.receipts[0].expectedBalanceRevision = 8
    await set(key, JSON.stringify(stored))
  }
  let writes = 0
  await expect(
    f.runner.run(
      "recognizePurchase",
      original,
      async () => {
        writes++
      },
      { recoveryMetadata: metadata() },
    ),
  ).rejects.toThrow("could not be saved")
  expect(writes).toBe(0)
})

test("receipt generated facts are frozen before awaited work and cannot attach to unrelated commands", async () => {
  const f = fixture()
  const retainedMetadata = metadata()
  const get = f.runtime.storage.getItem
  let release: () => void = () => {}
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  let started: () => void = () => {}
  const entered = new Promise<void>((resolve) => {
    started = resolve
  })
  let held = false
  f.runtime.storage.getItem = async (key) => {
    if (!held) {
      held = true
      started()
      await waiting
    }
    return get(key)
  }
  const sending = f.runner.run(
    "recognizePurchase",
    original,
    async () => {
      throw new Error("Lost")
    },
    { recoveryMetadata: retainedMetadata },
  )
  await entered
  const firstReceipt = retainedMetadata.purchaseReceipt?.receipts[0]
  if (firstReceipt) firstReceipt.expectedBalanceRevision = 9
  release()
  await expect(sending).rejects.toThrow("Lost")
  const stored = await createFinanceCommandRunner(scope, f.runtime).inspect()
  expect(stored?.command.recoveryMetadata?.purchaseReceipt?.receipts).toEqual(
    original.receipts,
  )
  const unrelated = fixture()
  let writes = 0
  await expect(
    unrelated.runner.run(
      "recordCashCount",
      original,
      async () => {
        writes++
      },
      { recoveryMetadata: metadata() },
    ),
  ).rejects.toThrow("unsupported retry metadata")
  expect(writes).toBe(0)
  expect(unrelated.records.size).toBe(0)
})
