import { createGeneralDomainCaller } from "./general-callers"
import type { GeneralContext } from "./general-context"
import { requireGeneralScope } from "./general-context"

/** Preserve the item contract while applying the canonical active-Store detail fence. */
export async function readGeneralCatalogItem(
  ctx: GeneralContext,
  itemId: string,
) {
  const scope = requireGeneralScope(ctx)
  const detail = await createGeneralDomainCaller(ctx).catalog.detail.overview({
    itemId,
    storeId: scope.storeId,
  })
  return detail.item
}
