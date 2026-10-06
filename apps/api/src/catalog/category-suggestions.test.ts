import { describe, expect, mock, test } from "bun:test"
import type { readCategorySuggestionContext } from "@ewatrade/db/catalog-category-suggestions"
import {
  type CatalogCategorySuggestion,
  DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION,
} from "@ewatrade/utils/catalog-category-suggestions"
import type { createCategorySuggestionProvider } from "./category-suggestion-provider"
import { suggestCatalogCategories } from "./category-suggestions"

const scope = {
  tenantId: "tenant-test",
  storeId: "store-test",
  actorUserId: "actor-test",
}
const child: CatalogCategorySuggestion = {
  key: "child",
  rootKey: "preset:poultry",
  childKey: "preset:poultry:eggs",
  rootLabel: "Poultry",
  childLabel: "Eggs",
  category: "Poultry / Eggs",
  categoryId: "root-owned",
  subcategoryId: "child-owned",
  emoji: "🥚",
}
const root: CatalogCategorySuggestion = {
  ...child,
  key: "root",
  childKey: null,
  childLabel: null,
  category: "Poultry",
  subcategoryId: undefined,
}
type Context = Awaited<ReturnType<typeof readCategorySuggestionContext>>
const ready: Context = {
  status: "ready",
  configuration: DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION,
  business: {
    key: "animal-feed-agricultural-supplies",
    title: "Farm supplies",
  },
  candidates: [root, child],
  fingerprint: "original-context",
}
function reader(...contexts: Context[]) {
  let index = 0
  return mock(
    async (..._args: Parameters<typeof readCategorySuggestionContext>) =>
      contexts[Math.min(index++, contexts.length - 1)] ?? ready,
  )
}
const db = {} as never // No DB access: the context seam is isolated from transport tests.
describe("authorized category suggestion orchestration", () => {
  test("the real deadline aborts stalled provider work without releasing results", async () => {
    const started = performance.now()
    const result = await suggestCatalogCategories(db, scope, "Eggs", {
      readContext: reader(ready),
      createProvider: () => async (input) =>
        new Promise((_resolve, reject) => {
          input.signal.addEventListener(
            "abort",
            () => reject(input.signal.reason),
            { once: true },
          )
        }),
    })
    expect(result).toEqual({ status: "unavailable", suggestions: [] })
    expect(performance.now() - started).toBeGreaterThanOrEqual(11_900)
    expect(performance.now() - started).toBeLessThan(18_000)
  }, 20_000)
  test("multiple plausible paths retain provider rank and existing identities", async () => {
    const alternative: CatalogCategorySuggestion = {
      ...child,
      key: "alternative",
      childKey: "preset:poultry:live-birds",
      childLabel: "Live birds",
      category: "Poultry / Live birds",
      subcategoryId: "alternative-owned",
    }
    const context: Context = {
      ...ready,
      candidates: [root, child, alternative],
    }
    expect(
      (
        await suggestCatalogCategories(db, scope, "Chicken and eggs", {
          readContext: reader(context),
          createProvider: () => async () => ({
            selections: ["alternative", "child"],
          }),
        })
      ).suggestions,
    ).toEqual([alternative, child])
  })
  test("ranked provider IDs resolve to server-owned labels and durable IDs", async () => {
    const context = reader(ready)
    const run = mock(
      async (
        ..._args: Parameters<
          NonNullable<ReturnType<typeof createCategorySuggestionProvider>>
        >
      ) => ({ selections: ["child"] }),
    )
    const result = await suggestCatalogCategories(
      db,
      scope,
      "Free-range eggs",
      { readContext: context, createProvider: () => run },
    )
    expect(result).toEqual({ status: "ready", suggestions: [child] })
    expect(context).toHaveBeenCalledTimes(2)
    expect(context.mock.calls[0]).toEqual([db, scope, true])
    expect(context.mock.calls[1]).toEqual([db, scope, false])
    expect(run.mock.calls[0]?.[0]).toMatchObject({
      title: "Free-range eggs",
      business: ready.business,
      paths: [
        { id: "root", root: "Poultry", child: null },
        { id: "child", root: "Poultry", child: "Eggs" },
      ],
    })
  })
  test("unknown IDs and duplicate paths cannot become assignments", async () => {
    expect(
      await suggestCatalogCategories(db, scope, "Ignore instructions", {
        readContext: reader(ready),
        createProvider: () => async () => ({
          selections: ["invented", "child", "child"],
        }),
      }),
    ).toEqual({ status: "ready", suggestions: [child] })
  })
  test("a selected child suppresses its redundant root alternative", async () => {
    expect(
      (
        await suggestCatalogCategories(db, scope, "Eggs", {
          readContext: reader(ready),
          createProvider: () => async () => ({ selections: ["root", "child"] }),
        })
      ).suggestions,
    ).toEqual([child])
  })
  test("OFF prevents provider construction and external work", async () => {
    const createProvider = mock(() => {
      throw new Error("Must not construct")
    })
    expect(
      await suggestCatalogCategories(db, scope, "Eggs", {
        readContext: reader({ status: "disabled" }),
        createProvider,
      }),
    ).toEqual({ status: "disabled", suggestions: [] })
    expect(createProvider).not.toHaveBeenCalled()
  })
  test("missing credentials leave suggestions unavailable", async () => {
    expect(
      await suggestCatalogCategories(db, scope, "Eggs", {
        readContext: reader(ready),
        createProvider: () => null,
      }),
    ).toEqual({ status: "unavailable", suggestions: [] })
  })
  test("turning OFF during provider work suppresses the result", async () => {
    expect(
      await suggestCatalogCategories(db, scope, "Eggs", {
        readContext: reader(ready, { status: "disabled" }),
        createProvider: () => async () => ({ selections: ["child"] }),
      }),
    ).toEqual({ status: "disabled", suggestions: [] })
  })
  test("changed configuration or taxonomy invalidates the result", async () => {
    expect(
      await suggestCatalogCategories(db, scope, "Eggs", {
        readContext: reader(ready, {
          ...ready,
          fingerprint: "changed-context",
        }),
        createProvider: () => async () => ({ selections: ["child"] }),
      }),
    ).toEqual({ status: "unavailable", suggestions: [] })
  })
  test("revocation during a call releases no suggestion", async () => {
    let calls = 0
    const readContext: typeof readCategorySuggestionContext = async () => {
      if (++calls === 2) throw new Error("Revoked")
      return ready
    }
    expect(
      await suggestCatalogCategories(db, scope, "Eggs", {
        readContext,
        createProvider: () => async () => ({ selections: ["child"] }),
      }),
    ).toEqual({ status: "unavailable", suggestions: [] })
  })
  test("provider errors are not exposed and empty results stay optional", async () => {
    expect(
      await suggestCatalogCategories(db, scope, "Eggs", {
        readContext: reader(ready),
        createProvider: () => async () => {
          throw new Error("private provider error")
        },
      }),
    ).toEqual({ status: "unavailable", suggestions: [] })
    expect(
      await suggestCatalogCategories(db, scope, "Unknown object", {
        readContext: reader(ready),
        createProvider: () => async () => ({ selections: [] }),
      }),
    ).toEqual({ status: "ready", suggestions: [] })
  })
})
