import type { CommercialOrder } from "@/components/mobile/commerce/commerce-model"
import { useModal } from "@/components/ui/modal"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useRouter } from "expo-router"
import { useState } from "react"
import {
  type OrderChangeApprovalKind,
  hasOpenApproval,
} from "./order-change-approval-model"

export type OrderChangeSheet =
  | "menu"
  | "customer"
  | "details"
  | "items"
  | "cancel"
  | "refund"
  | "return"
  /** The person's own request (waiting, approved or not approved). */
  | "approval"
  /** An Owner/Admin deciding someone's request. */
  | "review"

type MetadataPatch = RouterInputs["orders"]["amendMetadata"]["patch"]
type ReplacementChanges = RouterInputs["orders"]["replace"]["changes"]
type PaymentMethod = RouterInputs["orders"]["refund"]["method"]
type ReturnDisposition =
  RouterInputs["orders"]["returnItems"]["lines"][number]["disposition"]

const SHEET_CLOSE_MS = 400
// While someone waits on a decision, the order checks back this often.
const APPROVAL_POLL_MS = 15_000
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
/** A committed change the customer can be told about, by exact record. */
export type OrderChangeRecorded = {
  eventKey: "order.cancelled" | "payment.refund_recorded"
  sourceId?: string
}

export function useOrderChanges({
  isOffline,
  onChanged,
  onNotice,
  onRecorded,
  order,
}: {
  isOffline: boolean
  onChanged: () => Promise<void>
  onNotice: (message: string) => void
  onRecorded?: (record: OrderChangeRecorded) => void
  order: CommercialOrder | null
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const router = useRouter()
  const modal = useModal()
  const [sheet, setSheet] = useState<OrderChangeSheet>("menu")
  const [approvalKind, setApprovalKind] =
    useState<OrderChangeApprovalKind>("return")
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A sheet closed from code can keep a stale handle and refuse to present
  // again; once it has closed, a fresh instance takes its place.
  const [instance, setInstance] = useState(0)
  // Covers the review read as well as the write, so Save shows progress at once.
  const [working, setWorking] = useState(false)
  const orderId = order?.id ?? ""
  const optionsQuery = useQuery(
    trpc.orders.changeOptions.queryOptions(
      { orderId },
      {
        enabled: Boolean(order) && !isOffline,
        refetchInterval: (query) =>
          hasOpenApproval(query.state.data) ? APPROVAL_POLL_MS : false,
        retry: false,
      },
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

  // Let the sheet finish closing before the screen re-renders or changes.
  const closeSheet = async () => {
    setError(null)
    modal.dismiss()
    await new Promise((resolve) => setTimeout(resolve, SHEET_CLOSE_MS))
    setInstance((current) => current + 1)
  }
  async function finish(message: string) {
    await closeSheet()
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
  const refund = useMutation(trpc.orders.refund.mutationOptions())
  const returnItems = useMutation(trpc.orders.returnItems.mutationOptions())
  const requestApproval = useMutation(
    trpc.orders.requestChangeApproval.mutationOptions(),
  )
  const withdrawApproval = useMutation(
    trpc.orders.withdrawChangeApproval.mutationOptions(),
  )
  const recordApproved = useMutation(
    trpc.orders.recordApprovedChange.mutationOptions(),
  )
  const decideApproval = useMutation(
    trpc.orders.decideChangeApproval.mutationOptions(),
  )
  const busy =
    working ||
    amendMetadata.isPending ||
    replace.isPending ||
    cancel.isPending ||
    refund.isPending ||
    returnItems.isPending ||
    requestApproval.isPending ||
    withdrawApproval.isPending ||
    recordApproved.isPending ||
    decideApproval.isPending
  // Runs one write, then closes the sheet with a notice and refreshes.
  async function run(write: () => Promise<string>) {
    if (!order || busy) return
    setError(null)
    setWorking(true)
    try {
      await finish(await write())
    } catch (failure) {
      fail(failure)
    } finally {
      setWorking(false)
    }
  }
  const options = optionsQuery

  return {
    sheet,
    error,
    busy,
    options: options.data ?? null,
    optionsLoading: options.isPending && !isOffline,
    approvalKind,
    reviewId,
    /** The person's own request of this kind, or an Owner/Admin review. */
    openApproval(kind: OrderChangeApprovalKind) {
      setApprovalKind(kind)
      setError(null)
      setSheet("approval")
      modal.present()
    },
    goApproval(kind: OrderChangeApprovalKind) {
      setApprovalKind(kind)
      setError(null)
      setSheet("approval")
    },
    openReview(approvalId: string) {
      setReviewId(approvalId)
      setError(null)
      setSheet("review")
      modal.present()
    },
    goReview(approvalId: string) {
      setReviewId(approvalId)
      setError(null)
      setSheet("review")
    },
    askReturn(input: {
      lines: Array<{
        disposition: ReturnDisposition
        orderLineId: string
        quantity: string
      }>
      money: { method: PaymentMethod } | null
      reason: string
    }) {
      return run(async () => {
        if (!order) return ""
        await requestApproval.mutateAsync({
          clientRequestId: operationId("ask-return"),
          kind: "return",
          lines: input.lines,
          money: input.money,
          orderId: order.id,
          reason: input.reason,
        })
        return "Sent for approval. Record it here once an owner or admin approves."
      })
    },
    askRefund(input: {
      amountMinor: number
      lowerTotal: boolean
      method: PaymentMethod
      reason: string
    }) {
      return run(async () => {
        if (!order) return ""
        await requestApproval.mutateAsync({
          ...input,
          clientRequestId: operationId("ask-refund"),
          kind: "refund",
          orderId: order.id,
        })
        return "Sent for approval. Record it here once an owner or admin approves."
      })
    },
    withdraw(approvalId: string) {
      return run(async () => {
        await withdrawApproval.mutateAsync({ approvalId })
        return "Request withdrawn."
      })
    },
    recordApproved(approvalId: string, reference: string) {
      return run(async () => {
        const result = await recordApproved.mutateAsync({
          approvalId,
          clientOperationId: operationId("approved"),
          reference: reference.trim() || undefined,
        })
        const refundId =
          result && "paymentId" in result && result.paymentId
            ? result.paymentId
            : result && "refundPaymentId" in result && result.refundPaymentId
              ? result.refundPaymentId
              : null
        if (refundId)
          onRecorded?.({
            eventKey: "payment.refund_recorded",
            sourceId: refundId,
          })
        if (result?.kind === "refund")
          return result.creditId
            ? "Refund recorded and the total lowered."
            : "Refund recorded."
        return result && "refundPaymentId" in result && result.refundPaymentId
          ? "Return and refund recorded."
          : result?.creditId
            ? "Return recorded and taken off what they owe."
            : "Return recorded."
      })
    },
    decide(approvalId: string, decision: "approve" | "reject", note: string) {
      return run(async () => {
        await decideApproval.mutateAsync({
          approvalId,
          decision,
          note: note.trim() || undefined,
        })
        return decision === "approve"
          ? "Approved. They can record it now."
          : "Not approved. They'll see your note."
      })
    },
    cancelReview: cancelReview.data ?? null,
    cancelReviewLoading: cancelReview.isFetching,
    modalRef: modal.ref,
    instance,
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
      void closeSheet()
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
        const next = receipt.replacementOrderId
        if (!next) return await finish("Items changed.")
        // Swapping the screen while the sheet animates out crashes Fabric;
        // close the sheet first, then open the new order and refresh lists.
        await closeSheet()
        router.replace({
          pathname: "/order/[orderId]",
          params: { orderId: next },
        })
        void onChanged()
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
        onRecorded?.({ eventKey: "order.cancelled" })
        await finish("Order cancelled. Reserved stock is back on the shelf.")
      } catch (failure) {
        fail(failure)
      } finally {
        setWorking(false)
      }
    },
    async recordRefund(input: {
      amountMinor: number
      lowerTotal: boolean
      method: PaymentMethod
      reason: string
      reference: string
    }) {
      if (!order || busy) return
      setError(null)
      setWorking(true)
      try {
        const result = await refund.mutateAsync({
          amountMinor: input.amountMinor,
          clientOperationId: operationId("refund"),
          lowerTotal: input.lowerTotal,
          method: input.method,
          orderId: order.id,
          reason: input.reason,
          reference: input.reference.trim() || undefined,
        })
        // A replayed refund without a record id offers nothing; never guess.
        if ("paymentId" in result && result.paymentId)
          onRecorded?.({
            eventKey: "payment.refund_recorded",
            sourceId: result.paymentId,
          })
        await finish(
          input.lowerTotal
            ? "Refund recorded and the total lowered."
            : "Refund recorded.",
        )
      } catch (failure) {
        fail(failure)
      } finally {
        setWorking(false)
      }
    },
    async returnItems(input: {
      lines: Array<{
        disposition: ReturnDisposition
        orderLineId: string
        quantity: string
      }>
      money: { method: PaymentMethod } | null
      reason: string
    }) {
      if (!order || busy) return
      setError(null)
      setWorking(true)
      try {
        const result = await returnItems.mutateAsync({
          clientOperationId: operationId("return"),
          lines: input.lines,
          money: input.money,
          orderId: order.id,
          reason: input.reason,
        })
        if (result?.refundPaymentId)
          onRecorded?.({
            eventKey: "payment.refund_recorded",
            sourceId: result.refundPaymentId,
          })
        await finish(
          result?.refundPaymentId
            ? "Return and refund recorded."
            : result?.creditId
              ? "Return recorded and taken off what they owe."
              : "Return recorded.",
        )
      } catch (failure) {
        fail(failure)
      } finally {
        setWorking(false)
      }
    },
  }
}

export type OrderChanges = ReturnType<typeof useOrderChanges>
