import { catalogRouter } from "../trpc/routers/catalog"
import type { GeneralContext } from "./general-context"
import { requireGeneralScope } from "./general-context"

/** Preserve the item contract while applying the canonical active-Store detail fence. */
export async function readGeneralCatalogItem(
  ctx: GeneralContext,
  itemId: string,
) {
  const scope = requireGeneralScope(ctx)
  const detail = await catalogRouter.createCaller(ctx).detail.overview({
    itemId,
    storeId: scope.storeId,
  })
  return detail.item
}
