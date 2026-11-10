import { useTRPC } from "@/trpc/client"
import { useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Saves (or clears) the barcode on one product option/unit. Reads the item
 * fresh first so the save carries the option's current revision; the API
 * refuses a code that another item already uses and names that item.
 */
export function useSaveOfferingBarcode() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const mutation = useMutation(
    trpc.catalog.updateProductIdentifiers.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.catalog.pathKey() }),
    }),
  )
  async function save(input: {
    catalogItemId: string
    offeringId: string
    barcode: string | null
  }) {
    const item = await queryClient.fetchQuery({
      ...trpc.catalog.getItem.queryOptions({ itemId: input.catalogItemId }),
      staleTime: 0,
    })
    const offering = item.variants
      .flatMap((variant) => variant.offerings)
      .find((candidate) => candidate.id === input.offeringId)
    if (!offering) throw new Error("This option is no longer available.")
    if ((offering.productUnit?.barcode ?? null) === input.barcode) return
    await mutation.mutateAsync({
      offeringId: input.offeringId,
      expectedRevision: offering.revision,
      barcode: input.barcode,
    })
  }
  return { save, saving: mutation.isPending }
}
