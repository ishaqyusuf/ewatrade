import { expect, test } from "bun:test"
import { getStoreCheckoutLegalGate } from "./store-checkout-legal"

type LegalDb = Parameters<typeof getStoreCheckoutLegalGate>[0]

const publication = {
  version: "2026-10-01",
  documentHash: "a".repeat(64),
  effectiveDate: "2026-10-01",
}

function legalDb(documentHash: string | null) {
  const lookups: unknown[] = []
  const db = {
    legalAcceptance: {
      findUnique: async (input: unknown) => {
        lookups.push(input)
        return documentHash === null ? null : { documentHash }
      },
    },
  } as unknown as LegalDb
  return { db, lookups }
}

test("new checkout requires this manager's exact current legal digest", async () => {
  for (const documentHash of [null, "b".repeat(64)]) {
    const { db, lookups } = legalDb(documentHash)
    expect(
      await getStoreCheckoutLegalGate(db, "manager-1", true, publication),
    ).toEqual({ purchaseAvailable: false, legalAcceptanceRequired: true })
    expect(lookups).toEqual([
      {
        where: {
          userId_version: { userId: "manager-1", version: publication.version },
        },
        select: { documentHash: true },
      },
    ])
  }
  const { db } = legalDb(publication.documentHash)
  expect(
    await getStoreCheckoutLegalGate(db, "manager-1", true, publication),
  ).toEqual({ purchaseAvailable: true, legalAcceptanceRequired: false })
})

test("draft or unconfigured checkout never advertises purchase or queries acceptance", async () => {
  const configured = legalDb(publication.documentHash)
  expect(
    await getStoreCheckoutLegalGate(configured.db, "manager-1", true, null),
  ).toEqual({ purchaseAvailable: false, legalAcceptanceRequired: false })
  expect(configured.lookups).toHaveLength(0)

  const disabled = legalDb(publication.documentHash)
  expect(
    await getStoreCheckoutLegalGate(
      disabled.db,
      "manager-1",
      false,
      publication,
    ),
  ).toEqual({ purchaseAvailable: false, legalAcceptanceRequired: false })
  expect(disabled.lookups).toHaveLength(0)
})
