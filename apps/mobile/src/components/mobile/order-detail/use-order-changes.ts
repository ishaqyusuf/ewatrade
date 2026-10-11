import type { CommercialOrder } from "@/components/mobile/commerce/commerce-model"
import { useModal } from "@/components/ui/modal"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useRouter } from "expo-router"
import { useState } from "react"

export type OrderChangeSheet =
  | "menu"
  | "customer"
  | "details"
  | "items"
  | "cancel"
  | "refund"
  | "return"

type MetadataPatch = RouterInputs["orders"]["amendMetadata"]["patch"]
type ReplacementChanges = RouterInputs["orders"]["replace"]["changes"]
type PaymentMethod = RouterInputs["orders"]["recordPayment"]["method"]
type ReturnDisposition =
  RouterInputs["orders"]["returnProductLine"]["disposition"]

const operationId = (prefix: string) => `${prefix}-${Crypto.randomUUID()}`
const blocked = (blockers: { reason: string }[]) =>
  new Error(
    blockers.map((block) => block.reason).join(" ") ||
      "This change is not allowed.",
  )

/**
 * The Change sheet and its forms: every amendment is reviewed first and then
 * confirmed with that review, so a stale screen cannot overwrite newer work.
 */
export function useOrderChanges({
  isOffline,
  onChanged,
  onNotice,
  order,
}: {
  isOffline: boolean
  onChanged: () => Promise<void>
  onNotice: (message: string) => void
  order: CommercialOrder | null
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const router = useRouter()
  const modal = useModal()
  const [sheet, setSheet] = useState<OrderChangeSheet>("menu")
  const [error, setError] = useState<string | null>(null)
  // Covers the review read as well as the write, so Save shows progress at once.
  const [working, setWorking] = useState(false)
  const orderId = order?.id ?? ""
  const options = useQuery(
    trpc.orders.changeOptions.queryOptions(
      { orderId },
      { enabled: Boolean(order) && !isOffline, retry: false },
    ),
  )
  const cancelReview = useQuery(
    trpc.orders.cancellationReview.queryOptions(
      { orderId },
      {
        enabled: sheet === "cancel" && Boolean(order) && !isOffline,
        retry: false,
        staleTime: 0,
      },
    ),
  )

  async function finish(message: string) {
    setError(null)
    modal.dismiss()
    onNotice(message)
    await onChanged()
  }
  const fail = (failure: unknown) =>
    setError(
      failure instanceof Error ? failure.message : "Something went wrong.",
    )

  const amendMetadata = useMutation(trpc.orders.amendMetadata.mutationOptions())
  const replace = useMutation(trpc.orders.replace.mutationOptions())
  const cancel = useMutation(trpc.orders.cancel.mutationOptions())
  const refund = useMutation(trpc.orders.recordPayment.mutationOptions())
  const returnLine = useMutation(
    trpc.orders.returnProductLine.mutationOptions(),
  )
  const busy =
    working ||
    amendMetadata.isPending ||
    replace.isPending ||
    cancel.isPending ||
    refund.isPending ||
    returnLine.isPending

  return {
    sheet,
    error,
    busy,
    options: options.data ?? null,
    optionsLoading: options.isPending && !isOffline,
    cancelReview: cancelReview.data ?? null,
    cancelReviewLoading: cancelReview.isFetching,
    modalRef: modal.ref,
    open(next: OrderChangeSheet = "menu") {
      setError(null)
      setSheet(next)
      modal.present()
    },
    go(next: OrderChangeSheet) {
      setError(null)
      setSheet(next)
    },
    close() {
      setError(null)
      modal.dismiss()
    },
    async saveMetadata(patch: MetadataPatch, reason: string, done: string) {
      if (!order || busy) return
      setError(null)
      setWorking(true)
      try {
        const review = await queryClient.fetchQuery(
          trpc.orders.metadataReview.queryOptions(
            { orderId: order.id, patch },
            { staleTime: 0 },
          ),
        )
        if (!review.eligible) throw blocked(review.blockers)
        await amendMetadata.mutateAsync({
          clientOperationId: operationId("amend"),
          expectedReviewDigest: review.reviewDigest,
          orderId: order.id,
          patch,
          reason,
        })
        await finish(done)
      } catch (failure) {
        fail(failure)
      } finally {
        setWorking(false)
      }
    },
    async saveItems(changes: ReplacementChanges, reason: string) {
      if (!order || busy) return
      setError(null)
      setWorking(true)
      try {
        const review = await queryClient.fetchQuery(
          trpc.orders.replacementReview.queryOptions(
            { orderId: order.id, changes },
            { staleTime: 0 },
          ),
        )
        if (!review.eligible) throw blocked(review.blockers)
        const receipt = await replace.mutateAsync({
          changes,
          clientOperationId: operationId("replace"),
          expectedReviewDigest: review.reviewDigest,
          orderId: order.id,
          reason,
        })
        await finish("Items changed. This is the new order.")
        if (receipt.replacementOrderId)
          router.replace({
            pathname: "/order/[orderId]",
            params: { orderId: receipt.replacementOrderId },
          })
      } catch (failure) {
        fail(failure)
      } finally {
        setWorking(false)
      }
    },
    async cancelOrder(reason: string) {
      if (!order || busy) return
      setError(null)
      setWorking(true)
      try {
        const review =
          cancelReview.data ??
          (await queryClient.fetchQuery(
            trpc.orders.cancellationReview.queryOptions(
              { orderId: order.id },
              { staleTime: 0 },
            ),
          ))
        if (!review.eligible) throw blocked(review.blockers)
        await cancel.mutateAsync({
          clientOperationId: operationId("cancel"),
          expectedReviewDigest: review.reviewDigest,
          orderId: order.id,
          reason,
        })
        await finish("Order cancelled. Reserved stock is back on the shelf.")
      } catch (failure) {
        fail(failure)
      } finally {
        setWorking(false)
      }
    },
    async recordRefund(input: {
      amountMinor: number
      method: PaymentMethod
      reason: string
      reference: string
    }) {
      if (!order || busy) return
      setError(null)
      setWorking(true)
      try {
        await refund.mutateAsync({
          amountMinor: input.amountMinor,
          clientPaymentId: operationId("refund"),
          method: input.method,
          note: input.reason,
          orderId: order.id,
          reference: input.reference.trim() || undefined,
          type: "refund",
        })
        await finish("Refund recorded.")
      } catch (failure) {
        fail(failure)
      } finally {
        setWorking(false)
      }
    },
    async recordReturn(input: {
      disposition: ReturnDisposition
      orderLineId: string
      quantity: string
      reason: string
    }) {
      if (!order || busy) return
      setError(null)
      setWorking(true)
      try {
        await returnLine.mutateAsync({
          clientReturnId: operationId("return"),
          disposition: input.disposition,
          orderLineId: input.orderLineId,
          quantity: input.quantity,
          reason: input.reason,
          schemaVersion: 1,
        })
        await finish("Return recorded.")
      } catch (failure) {
        fail(failure)
      } finally {
        setWorking(false)
      }
    },
  }
}

export type OrderChanges = ReturnType<typeof useOrderChanges>
