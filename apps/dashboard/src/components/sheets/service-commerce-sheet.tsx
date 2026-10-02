"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { ModalFrame } from "@/components/modals/modal-frame"

import { SERVICE_COMMERCE_CONTROLLERS } from "@/components/service-commerce/service-commerce-controllers"
import { ServiceCommerceSheetContent } from "@/components/service-commerce/service-commerce-sheet-content"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useCustomerChannelParams } from "@/hooks/use-customer-channel-params"
import {
  SERVICE_COMMERCE_SHEET_RESET_PARAMS,
  useServiceCommerceParams,
} from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Dialog, Sheet } from "@ewatrade/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useRef, useState } from "react"

export function ServiceCommerceSheet({
  storeId,
  storeIds,
}: {
  storeId: string
  storeIds: string[]
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const params = useServiceCommerceParams()
  const channelParams = useCustomerChannelParams()
  const formResets = useRef(new Set<() => void>())
  const mode = params.serviceCommerceSheet
  const requestedStoreId = params.storeId
  const resolvedStoreId =
    requestedStoreId && storeIds.includes(requestedStoreId)
      ? requestedStoreId
      : storeId
  const controller = mode ? SERVICE_COMMERCE_CONTROLLERS[mode] : null
  const Root = mode === "quote_policy" ? Dialog : Sheet
  const Frame = mode === "quote_policy" ? ModalFrame : SheetFrame
  const [closeError, setCloseError] = useState<string | null>(null)

  const registerFormReset = useCallback((reset: () => void) => {
    formResets.current.add(reset)
    return () => formResets.current.delete(reset)
  }, [])

  const close = async () => {
    setCloseError(null)
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
    for (const reset of formResets.current) reset()
    await Promise.all([
      params.setParams(SERVICE_COMMERCE_SHEET_RESET_PARAMS),
      channelParams.setParams({ whatsapp: null }),
    ])
  }

  const requestClose = () => {
    void close().catch(() => {
      setCloseError(
        "Some Service Commerce data could not be refreshed. Try closing again.",
      )
    })
  }

  return (
    <Root
      open={Boolean(mode)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) requestClose()
      }}
    >
      {mode ? (
        <Frame
          description={controller?.description}
          title={controller?.title ?? "Service Commerce"}
        >
          {closeError ? (
            <FormFeedback appearance="dashboard">{closeError}</FormFeedback>
          ) : null}
          <ServiceCommerceSheetContent
            key={`${resolvedStoreId}:${JSON.stringify(params)}`}
            registerFormReset={registerFormReset}
            storeId={resolvedStoreId}
          />
        </Frame>
      ) : null}
    </Root>
  )
}
