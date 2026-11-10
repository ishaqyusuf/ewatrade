import type { BarcodeOption } from "@/components/mobile/catalog-item/offering-barcode-editor"
import { useAuthContext } from "@/hooks/use-auth"
import { canEditMobileCatalog } from "@/lib/mobile-roles"
import { useTRPC } from "@/trpc/client"
import { useQueryClient } from "@tanstack/react-query"
import { router, useFocusEffect } from "expo-router"
import { useCallback, useRef, useState } from "react"
import type { OfferingRow } from "./create-sale-model"
import type { CreateSaleViewModel } from "./create-sale-presentation"
import type { SaleScan } from "./use-sale-scan"

/**
 * Unknown scan → attach the code. Catalog editors can link it to an existing
 * option (picked from the sale list, then confirmed) or start a new item with
 * the code filled in; the new item is scanned into the sale on return.
 * Nothing is saved without the explicit confirm step.
 */
export function useSaleScanLink(model: CreateSaleViewModel, scan: SaleScan) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  const [code, setCode] = useState<string | null>(null)
  const [target, setTarget] = useState<{
    row: OfferingRow
    option: BarcodeOption
  } | null>(null)
  const [error, setError] = useState("")
  const created = useRef<string | null>(null)
  const read = useRef(scan.read)
  read.current = scan.read
  const canLink =
    canEditMobileCatalog(profile) && !model.isOffline && !model.actionsLocked

  // Runs on focus changes only, so it fires when the new-item screen closes.
  useFocusEffect(
    useCallback(() => {
      const pending = created.current
      if (!pending) return
      created.current = null
      void read.current(pending)
    }, []),
  )

  return {
    canLink,
    code,
    target,
    error,
    start(next: string) {
      scan.close()
      scan.dismissNotice()
      setError("")
      setCode(next)
    },
    cancel() {
      setCode(null)
      setTarget(null)
      setError("")
    },
    async pick(row: OfferingRow) {
      if (!code || row.kind !== "product_unit") return
      setError("")
      try {
        const item = await queryClient.fetchQuery({
          ...trpc.catalog.getItem.queryOptions({ itemId: row.catalogItemId }),
          staleTime: 0,
        })
        const variant = item.variants.find((candidate) =>
          candidate.offerings.some((offering) => offering.id === row.id),
        )
        const offering = variant?.offerings.find((o) => o.id === row.id)
        if (!variant || !offering) throw new Error()
        setTarget({
          row,
          option: {
            offeringId: offering.id,
            name: offering.name,
            variantName: item.name,
            barcode: offering.productUnit?.barcode ?? null,
          },
        })
      } catch {
        setError("This item could not be opened. Try again.")
      }
    },
    closeTarget() {
      setTarget(null)
    },
    saved() {
      if (target) model.addOffering(target.row)
      setTarget(null)
      setCode(null)
    },
    create(next: string) {
      scan.close()
      scan.dismissNotice()
      created.current = next
      router.push(
        `/first-product-setup-modal?kind=product&from=sale&barcode=${encodeURIComponent(next)}` as never,
      )
    },
  }
}

export type SaleScanLink = ReturnType<typeof useSaleScanLink>
