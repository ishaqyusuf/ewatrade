import { describe, expect, test } from "bun:test"
import { DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION } from "@ewatrade/utils/catalog-category-suggestions"
import { readCategorySuggestionContext } from "./catalog-category-suggestions"
import { CatalogPhotoError } from "./catalog-photos"

const scope = {
  actorUserId: "actor-owned",
  tenantId: "tenant-owned",
  storeId: "store-owned",
}
type Saved = { id: string; key: string; label: string; parentId: string | null }
function fixture({
  configuration = DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION,
  saved = [],
  qa = false,
  allowed = true,
  requests = 0,
  oldWindow = false,
}: {
  configuration?: unknown
  saved?: Saved[]
  qa?: boolean
  allowed?: boolean
  requests?: number
  oldWindow?: boolean
} = {}) {
  let quotaWrites = 0
  let reads = 0
  let categoryWhere: unknown
  let locked = false
  let quotaData: unknown
  const tx = {
    $queryRaw: async (sql: { strings: readonly string[] }) => {
      const text = sql.strings.join(" ")
      if (text.includes('FROM "Tenant"'))
        return [{ id: scope.tenantId, dataClassification: qa ? "QA" : "LIVE" }]
      if (text.includes('FROM "Store"')) return [{ id: scope.storeId }]
      if (text.includes('FROM "Membership"'))
        return allowed ? [{ id: "membership-owned" }] : []
      locked = text.includes("FOR UPDATE")
      return [
        {
          requests,
          windowStartedAt: new Date(Date.now() - (oldWindow ? 61_000 : 0)),
        },
      ]
    },
    systemConfiguration: {
      findUnique: async () =>
        configuration === null ? null : { revision: 1, value: configuration },
    },
    store: {
      findFirst: async () => ({
        metadata: {
          retailOps: {
            onboarding: {
              businessProfileKey: "animal-feed-agricultural-supplies",
            },
          },
        },
      }),
    },
    catalogCategory: {
      findMany: async (args: { where: unknown }) => {
        reads += 1
        categoryWhere = args.where
        return saved
      },
    },
    catalogCategorySuggestionBudget: {
      upsert: async () => {
        quotaWrites += 1
      },
      update: async (args: { data: unknown }) => {
        quotaWrites += 1
        quotaData = args.data
      },
    },
  }
  const db = {
    $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
  } as never
  return {
    db,
    facts: () => ({ quotaWrites, reads, categoryWhere, locked, quotaData }),
  }
}
describe("category suggestion context and persisted config", () => {
  test.each([
    { enabled: false },
    { enabled: "true" },
    { provider: "OPENAI", model: "deepseek-flash" },
  ])(
    "invalid or OFF persisted config skips taxonomy/provider budget",
    async (changes) => {
      const f = fixture({
        configuration: {
          ...DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION,
          ...changes,
        },
      })
      expect(await readCategorySuggestionContext(f.db, scope, true)).toEqual({
        status: "disabled",
      })
      expect(f.facts().reads).toBe(0)
      expect(f.facts().quotaWrites).toBe(0)
    },
  )
  test("missing config fails closed and QA cannot reach provider work", async () => {
    for (const f of [fixture({ configuration: null }), fixture({ qa: true })]) {
      const result = await readCategorySuggestionContext(f.db, scope, true)
      expect(result.status).not.toBe("ready")
      expect(f.facts().quotaWrites).toBe(0)
    }
  })
  test("current membership is required before reading settings or taxonomy", async () => {
    const f = fixture({ allowed: false })
    await expect(
      readCategorySuggestionContext(f.db, scope, true),
    ).rejects.toBeInstanceOf(CatalogPhotoError)
    expect(f.facts().reads).toBe(0)
  })
  test("complete Product vocabulary includes Tenant custom paths and preserves IDs", async () => {
    const f = fixture({
      saved: [
        {
          id: "custom-root",
          key: "custom:root",
          label: "Local goods",
          parentId: null,
        },
        {
          id: "custom-child",
          key: "custom:child",
          label: "Handmade baskets",
          parentId: "custom-root",
        },
      ],
    })
    const result = await readCategorySuggestionContext(f.db, scope, true)
    expect(result.status).toBe("ready")
    if (result.status !== "ready") throw new Error("Expected context")
    expect(result.candidates).toHaveLength(82)
    expect(result.business.key).toBe("animal-feed-agricultural-supplies")
    expect(
      result.candidates.find(
        (entry) => entry.category === "Local goods / Handmade baskets",
      ),
    ).toMatchObject({
      categoryId: "custom-root",
      subcategoryId: "custom-child",
      emoji: "🏷️",
    })
    expect(
      result.candidates.some(
        (entry) => entry.rootKey === "preset:tailoring-services",
      ),
    ).toBe(false)
    expect(f.facts().categoryWhere).toEqual({ tenantId: scope.tenantId })
    expect(f.facts().locked).toBe(true)
  })
  test("a virtual child never passes a persisted parent alone to save", async () => {
    const f = fixture({
      saved: [
        {
          id: "poultry-owned",
          key: "preset:poultry",
          label: "Poultry",
          parentId: null,
        },
      ],
    })
    const result = await readCategorySuggestionContext(f.db, scope, false)
    if (result.status !== "ready") throw new Error("Expected context")
    expect(
      result.candidates.find((entry) => entry.category === "Poultry")
        ?.categoryId,
    ).toBe("poultry-owned")
    expect(
      result.candidates.find((entry) => entry.category === "Poultry / Eggs")
        ?.categoryId,
    ).toBeUndefined()
    expect(f.facts().quotaWrites).toBe(0)
  })
  test("oversized taxonomy and renamed preset root do not send incomplete context", async () => {
    for (const saved of [
      Array.from({ length: 1201 }, (_, i) => ({
        id: String(i),
        key: `custom:${i}`,
        label: `Label ${i}`,
        parentId: null,
      })),
      [
        {
          id: "poultry-owned",
          key: "preset:poultry",
          label: "Renamed",
          parentId: null,
        },
      ],
    ]) {
      const f = fixture({ saved })
      expect(await readCategorySuggestionContext(f.db, scope, true)).toEqual({
        status: "unavailable",
      })
      expect(f.facts().quotaWrites).toBe(0)
    }
  })
  test("ten calls exhaust the current window and a new window resets the counter", async () => {
    const limited = fixture({ requests: 10 })
    expect(
      await readCategorySuggestionContext(limited.db, scope, true),
    ).toEqual({ status: "unavailable" })
    expect(limited.facts().quotaWrites).toBe(1)
    const reset = fixture({ requests: 10, oldWindow: true })
    expect(
      (await readCategorySuggestionContext(reset.db, scope, true)).status,
    ).toBe("ready")
    expect(reset.facts().quotaData).toMatchObject({ requests: 1 })
  })
})
