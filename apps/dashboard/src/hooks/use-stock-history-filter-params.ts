import { useQueryStates } from "nuqs"
import {
  type LoaderInput,
  createLoader,
  type inferParserType,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
} from "nuqs/server"

/** The server accepts up to ten match-all category names. */
export const MAX_STOCK_HISTORY_CATEGORIES = 10
const MAX_ID = 2_147_483_647

export const stockHistoryCategoryParams = {
  categories: parseAsArrayOf(parseAsInteger),
  uncategorized: parseAsBoolean,
}

/** Match-all category-name IDs, or Uncategorized; never both. */
export type StockHistoryCategoryFilter = {
  categoryNameIds: number[]
  uncategorized: boolean
}

export function toStockHistoryCategoryFilter(
  params: Partial<inferParserType<typeof stockHistoryCategoryParams>>,
): StockHistoryCategoryFilter {
  // Uncategorized is exclusive, so a URL carrying both keeps Uncategorized.
  if (params.uncategorized) return { categoryNameIds: [], uncategorized: true }
  const ids = (params.categories ?? []).filter(
    (id) => Number.isInteger(id) && id > 0 && id <= MAX_ID,
  )
  return {
    categoryNameIds: [...new Set(ids)].slice(0, MAX_STOCK_HISTORY_CATEGORIES),
    uncategorized: false,
  }
}

const loadStockHistoryCategoryState = createLoader(stockHistoryCategoryParams)

export async function loadStockHistoryCategoryFilter(
  searchParams: LoaderInput | Promise<LoaderInput>,
) {
  return toStockHistoryCategoryFilter(
    loadStockHistoryCategoryState(await searchParams),
  )
}

export function useStockHistoryCategoryParams() {
  const [params, setParams] = useQueryStates(stockHistoryCategoryParams)
  const filter = toStockHistoryCategoryFilter(params)
  return {
    filter,
    setCategories: (categoryNameIds: number[]) =>
      setParams({
        categories: categoryNameIds.length ? categoryNameIds : null,
        uncategorized: null,
      }),
    setUncategorized: (uncategorized: boolean) =>
      setParams({ categories: null, uncategorized: uncategorized || null }),
    clear: () => setParams({ categories: null, uncategorized: null }),
  }
}
