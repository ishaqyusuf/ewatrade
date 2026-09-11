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
  const resolvedStoreId = params.storeId ?? storeId
  const controller = mode ? SERVICE_COMMERCE_CONTROLLERS[mode] : null

  const registerFormReset = useCallback((reset: () => void) => {
    formResets.current.add(reset)
    return () => formResets.current.delete(reset)
  }, [])

  const close = async () => {
    for (const reset of formResets.current) reset()
    const invalidations: Array<Promise<unknown>> = []
    if (mode === "connection" || mode === "team" || mode === "entry_point") {
      invalidations.push(
        queryClient.invalidateQueries({
          exact: true,
          queryKey: trpc.serviceCommerce.channelWorkspace.queryKey({
            storeId: resolvedStoreId,
          }),
        }),
        queryClient.invalidateQueries({
          exact: true,
          queryKey: trpc.serviceCommerce.workspaceAccess.queryKey({
            storeId: resolvedStoreId,
          }),
        }),
      )
    }
    if (mode === "quote_policy") {
      invalidations.push(
        queryClient.invalidateQueries({
          exact: true,
          queryKey: trpc.serviceCommerce.quoteReleaseSettings.queryKey({
            storeId: resolvedStoreId,
          }),
        }),
        queryClient.invalidateQueries({
          exact: true,
          queryKey: trpc.serviceCommerce.pendingQuoteApprovals.queryKey({
            storeId: resolvedStoreId,
          }),
        }),
      )
    }
    if (mode === "availability") {
      invalidations.push(
        queryClient.invalidateQueries({
          exact: true,
          queryKey:
            trpc.serviceCommerce.storeConversationAvailabilitySettings.queryKey(
              { storeId: resolvedStoreId },
            ),
        }),
        queryClient.invalidateQueries({
          exact: true,
          queryKey: trpc.serviceCommerce.channelWorkspace.queryKey({
            storeId: resolvedStoreId,
          }),
        }),
      )
    }
    if (mode === "conversation_mode") {
      invalidations.push(
        queryClient.invalidateQueries({
          exact: true,
          queryKey:
            trpc.serviceCommerce.storeConversationChannelModeSettings.queryKey({
              storeId: resolvedStoreId,
            }),
        }),
        queryClient.invalidateQueries({
          exact: true,
          queryKey: trpc.serviceCommerce.channelWorkspace.queryKey({
            storeId: resolvedStoreId,
          }),
        }),
      )
    }
    if (mode === "quote_approval") {
      invalidations.push(
        queryClient.invalidateQueries({
          exact: true,
          queryKey: trpc.serviceCommerce.pendingQuoteApprovals.queryKey({
            storeId: resolvedStoreId,
          }),
        }),
      )
      if (params.quoteApprovalId) {
        invalidations.push(
          queryClient.invalidateQueries({
            exact: true,
            queryKey: trpc.serviceCommerce.quoteApprovalDetail.queryKey({
              approvalId: params.quoteApprovalId,
              storeId: resolvedStoreId,
            }),
          }),
        )
      }
    }
    if (params.attachmentId) {
      invalidations.push(
        queryClient.invalidateQueries({
          exact: true,
          queryKey: trpc.serviceCommerce.mediaAttachment.queryKey({
            attachmentId: params.attachmentId,
            storeId: resolvedStoreId,
          }),
        }),
      )
    }
    if (mode === "inventory_graduation" && params.offeringId) {
      invalidations.push(
        queryClient.invalidateQueries({
          exact: true,
          queryKey: trpc.serviceCommerce.catalogGraduationReadiness.queryKey({
            offeringId: params.offeringId,
            storeId: resolvedStoreId,
          }),
        }),
      )
    }
    if (params.sourceKind && params.sourceId && params.sourceLineId) {
      const source = { id: params.sourceId, kind: params.sourceKind }
      const matchesInput = {
        source,
        sourceLineId: params.sourceLineId,
        storeId: resolvedStoreId,
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
              storeId: resolvedStoreId,
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
                storeId: resolvedStoreId,
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
          storeId={resolvedStoreId}
        />
      ) : null}
    </DashboardSheet>
  )
}
