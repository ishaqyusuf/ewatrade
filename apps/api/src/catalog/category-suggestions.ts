import type { PrismaClient } from "@ewatrade/db"
import { readCategorySuggestionContext } from "@ewatrade/db/catalog-category-suggestions"
import type { CatalogPhotoActorScope } from "@ewatrade/db/catalog-photos"
import type { CatalogCategorySuggestionResult } from "@ewatrade/utils/catalog-category-suggestions"
import { createCategorySuggestionProvider } from "./category-suggestion-provider"

/** Suggestions are advisory; only validated server-owned vocabulary leaves this service. */
export async function suggestCatalogCategories(
  db: PrismaClient,
  scope: CatalogPhotoActorScope,
  title: string,
  dependencies: {
    readContext?: typeof readCategorySuggestionContext
    createProvider?: typeof createCategorySuggestionProvider
  } = {},
): Promise<CatalogCategorySuggestionResult> {
  const readContext = dependencies.readContext ?? readCategorySuggestionContext
  const createProvider =
    dependencies.createProvider ?? createCategorySuggestionProvider
  const context = await readContext(db, scope, true)
  if (context.status !== "ready")
    return { status: context.status, suggestions: [] }
  const provider = createProvider(context.configuration)
  if (!provider) return { status: "unavailable", suggestions: [] }
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), 12_000)
  try {
    const output = await provider({
      title,
      business: context.business,
      paths: context.candidates.map((entry) => ({
        id: entry.key,
        root: entry.rootLabel,
        child: entry.childLabel,
      })),
      signal: controller.signal,
    })
    const seenLabels = new Set<string>()
    const suggestions = [...new Set(output.selections)]
      .flatMap((key) => {
        const entry = context.candidates.find(
          (candidate) => candidate.key === key,
        )
        return entry ? [entry] : []
      })
      .filter(
        (entry, _index, entries) =>
          entry.childKey !== null ||
          !entries.some(
            (other) =>
              other.rootKey === entry.rootKey && other.childKey !== null,
          ),
      )
      .filter((entry) => {
        const label = entry.category.trim().toLowerCase()
        if (seenLabels.has(label)) return false
        seenLabels.add(label)
        return true
      })
    // Turning OFF or revoking permissions during a request must suppress its result.
    const current = await readContext(db, scope, false)
    if (current.status !== "ready")
      return { status: current.status, suggestions: [] }
    if (current.fingerprint !== context.fingerprint)
      return { status: "unavailable", suggestions: [] }
    return { status: "ready", suggestions }
  } catch {
    // No provider text, prompts, credentials or titles are logged/exposed on failure.
    return { status: "unavailable", suggestions: [] }
  } finally {
    clearTimeout(deadline)
  }
}
