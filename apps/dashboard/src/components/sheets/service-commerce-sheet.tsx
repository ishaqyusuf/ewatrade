"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { SERVICE_COMMERCE_CONTROLLERS } from "@/components/service-commerce/service-commerce-controllers"
import { ServiceCommerceSheetContent } from "@/components/service-commerce/service-commerce-sheet-content"
import {
  SERVICE_COMMERCE_SHEET_RESET_PARAMS,
  useServiceCommerceParams,
} from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useRef } from "react"

export function ServiceCommerceSheet({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const params = useServiceCommerceParams()
  const formResets = useRef(new Set<() => void>())
  const mode = params.serviceCommerceSheet
  const controller = mode ? SERVICE_COMMERCE_CONTROLLERS[mode] : null

  const registerFormReset = useCallback((reset: () => void) => {
    formResets.current.add(reset)
    return () => formResets.current.delete(reset)
  }, [])

  const close = async () => {
    for (const reset of formResets.current) reset()
    const invalidations: Array<Promise<unknown>> = []
    if (params.sourceKind && params.sourceId && params.sourceLineId) {
      const source = { id: params.sourceId, kind: params.sourceKind }
      const matchesInput = {
        source,
        sourceLineId: params.sourceLineId,
        storeId,
      }
      const matchesKey =
        trpc.serviceCommerce.catalogMatches.queryKey(matchesInput)
      const matches =
        queryClient.getQueryData<
          RouterOutputs["serviceCommerce"]["catalogMatches"]
        >(matchesKey)
      invalidations.push(
        queryClient.invalidateQueries({ exact: true, queryKey: matchesKey }),
      )
      if (params.offeringId) {
        invalidations.push(
          queryClient.invalidateQueries({
            exact: true,
            queryKey: trpc.serviceCommerce.catalogPriceSuggestions.queryKey({
              offeringId: params.offeringId,
              source,
              sourceLineId: params.sourceLineId,
              storeId,
            }),
          }),
        )
      }
      if (params.quoteId && matches?.sourceLine.fingerprint) {
        invalidations.push(
          queryClient.invalidateQueries({
            exact: true,
            queryKey: trpc.serviceCommerce.catalogPricePromotionImpact.queryKey(
              {
                expectedSourceFingerprint: matches.sourceLine.fingerprint,
                quoteId: params.quoteId,
                source,
                sourceLineId: params.sourceLineId,
                storeId,
              },
            ),
          }),
        )
      }
    }
    await Promise.all(invalidations)
    await params.setParams(SERVICE_COMMERCE_SHEET_RESET_PARAMS)
  }

  return (
    <DashboardSheet
      description={controller?.description}
      onClose={close}
      open={Boolean(mode)}
      title={controller?.title ?? "Service Commerce"}
    >
      {mode ? (
        <ServiceCommerceSheetContent
          registerFormReset={registerFormReset}
          storeId={storeId}
        />
      ) : null}
    </DashboardSheet>
  )
}
