import { ActionButton } from "@/components/mobile/action-button"
import {
  ClassicOrderDetailContent,
  ClassicOrderDetailPrimaryAction,
  CommercialOrderOverviewHeader,
} from "@/components/mobile/appearances/classic/order-detail-content"
import { buildCommercialOrderActivity } from "@/components/mobile/commerce/commercial-order-overview-model"
import { EmptyState } from "@/components/mobile/empty-state"
import {
  OrderFulfilmentConfirmationSheet,
  type OrderPaymentMethod,
  OrderPaymentSheet,
} from "./order-action-sheets"
import {
  OrderDetailDispatchDocket,
  OrderDetailDispatchDocketPrimaryAction,
} from "@/components/mobile/appearances/market-day/order-detail-dispatch-docket"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { MobileScreen } from "@/components/mobile/screen"
import { useModal } from "@/components/ui/modal"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { getOrderFulfilmentConfirmation } from "@/lib/order-action-sheet-model"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import {
  createQaPaymentFixture,
  formatMinorMoney,
  majorToMinor,
  minorToMajorInput,
} from "@ewatrade/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useRouter } from "expo-router"
import { useEffect, useMemo, useRef, useState } from "react"
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native"

import { useMobileDesign } from "@/hooks/use-mobile-design"
import { ClassicOrderDetailScreen } from "@/components/mobile/appearances/classic/order-detail-screen"
import { MarketDayOrderDetailScreen } from "@/components/mobile/appearances/market-day/order-detail-screen"

export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const appearance = useMobileDesign("order-detail")
  const isMarketDay = appearance === "market-day"
  const Screen = isMarketDay
    ? MarketDayOrderDetailScreen
    : ClassicOrderDetailScreen
  const Content = isMarketDay
    ? OrderDetailDispatchDocket
    : ClassicOrderDetailContent
  const PrimaryAction = isMarketDay
    ? OrderDetailDispatchDocketPrimaryAction
    : ClassicOrderDetailPrimaryAction
  const router = useRouter()
  const { profile } = useAuthContext()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const paymentModal = useModal()
  const fulfilLineModal = useModal()
  const fulfilAllModal = useModal()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const [amountPaid, setAmountPaid] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>("cash")
  const [paymentReference, setPaymentReference] = useState("")
  const [mastheadHeight, setMastheadHeight] = useState(116)
  const [mastheadVisible, setMastheadVisible] = useState(true)
  useEffect(() => {
    setMastheadVisible(true)
    setMastheadHeight(116)
  }, [appearance])
  const [selectedFulfilmentLineId, setSelectedFulfilmentLineId] = useState<
    string | null
  >(null)
  const paymentQuickFillSnapshot = useRef<{
    amountPaid: string
    method: OrderPaymentMethod
    reference: string
  } | null>(null)
  const [canUndoPaymentQuickFill, setCanUndoPaymentQuickFill] = useState(false)
  const orderQuery = useQuery(
    trpc.orders.get.queryOptions(
      { orderId },
      { enabled: !isOffline, retry: false },
    ),
  )
  const cachedOrders = useQuery(
    trpc.orders.list.queryOptions(
      { limit: 100 },
      { enabled: false, retry: false },
    ),
  )
  const order =
    orderQuery.data ??
    cachedOrders.data?.find((candidate) => candidate.id === orderId) ??
    null

  async function refreshOrderQueries() {
    await Promise.all([
      queryClient.invalidateQueries(trpc.orders.get.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.list.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.listPage.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.customerCount.queryFilter()),
      queryClient.invalidateQueries(trpc.catalog.listItems.queryFilter()),
      queryClient.invalidateQueries(trpc.catalog.listItemsPage.queryFilter()),
      queryClient.invalidateQueries(trpc.inventory.balanceReport.queryFilter()),
    ])
  }

  const paymentMutation = useMutation(
    trpc.orders.recordPayment.mutationOptions({
      onError: (failure) => {
        setNotice(null)
        setError(failure.message)
      },
      onSuccess: async () => {
        setAmountPaid("")
        setError(null)
        setNotice("Payment recorded.")
        setPaymentReference("")
        paymentQuickFillSnapshot.current = null
        setCanUndoPaymentQuickFill(false)
        paymentModal.dismiss()
        await refreshOrderQueries()
      },
    }),
  )
  const fulfilmentMutation = useMutation(
    trpc.orders.fulfillProductLine.mutationOptions({
      onError: (failure) => {
        setNotice(null)
        setError(failure.message)
      },
      onSuccess: async () => {
        setError(null)
        setNotice("Product fulfilment recorded.")
        fulfilLineModal.dismiss()
        setSelectedFulfilmentLineId(null)
        await refreshOrderQueries()
      },
    }),
  )
  const fulfilAllMutation = useMutation(
    trpc.orders.fulfillProducts.mutationOptions({
      onError: (failure) => {
        setNotice(null)
        setError(failure.message)
      },
      onSuccess: async (result) => {
        setError(null)
        setNotice(
          result.fulfilledLineCount === 1
            ? "1 Product line fulfilled."
            : `${result.fulfilledLineCount} Product lines fulfilled.`,
        )
        fulfilAllModal.dismiss()
        await refreshOrderQueries()
      },
    }),
  )

  const activity = useMemo(
    () => (order ? buildCommercialOrderActivity(order) : []),
    [order],
  )
  const fulfilLinePresentation = useMemo(
    () =>
      order && selectedFulfilmentLineId
        ? getOrderFulfilmentConfirmation(order, {
            kind: "line",
            orderLineId: selectedFulfilmentLineId,
          })
        : null,
    [order, selectedFulfilmentLineId],
  )
  const fulfilAllPresentation = useMemo(
    () =>
      order ? getOrderFulfilmentConfirmation(order, { kind: "all" }) : null,
    [order],
  )

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace("/dashboard")
  }

  function openCustomer() {
    if (!order) return
    router.push({
      params: { customerOrderId: order.id },
      pathname: "/customer-book-modal",
    } as never)
  }

  function openPaymentForm() {
    if (!order || order.balanceDueMinor <= 0) return
    setAmountPaid(minorToMajorInput(order.balanceDueMinor))
    setPaymentMethod("cash")
    setPaymentReference("")
    paymentQuickFillSnapshot.current = null
    setCanUndoPaymentQuickFill(false)
    setError(null)
    paymentModal.present()
  }

  function recordPayment() {
    if (!order || isOffline) return
    const amountMinor = majorToMinor(amountPaid)
    if (amountMinor === null || amountMinor <= 0) {
      setError("Enter a valid payment amount.")
      return
    }
    if (amountMinor > order.balanceDueMinor) {
      setError("Payment cannot exceed the balance due.")
      return
    }
    paymentMutation.mutate({
      amountMinor,
      clientPaymentId: `payment-${Crypto.randomUUID()}`,
      method: paymentMethod,
      orderId: order.id,
      reference: paymentReference.trim() || undefined,
    })
  }

  function cancelPayment() {
    setError(null)
    paymentQuickFillSnapshot.current = null
    setCanUndoPaymentQuickFill(false)
    setTimeout(paymentModal.dismiss, 120)
  }

  function openFulfilProductLine(orderLineId: string) {
    if (
      !order ||
      isOffline ||
      fulfilmentMutation.isPending ||
      fulfilAllMutation.isPending
    )
      return
    if (!getOrderFulfilmentConfirmation(order, { kind: "line", orderLineId }))
      return
    setError(null)
    setSelectedFulfilmentLineId(orderLineId)
    fulfilLineModal.present()
  }

  function confirmFulfilProductLine() {
    if (
      !selectedFulfilmentLineId ||
      isOffline ||
      fulfilmentMutation.isPending ||
      fulfilAllMutation.isPending
    )
      return
    fulfilmentMutation.mutate({
      clientOperationId: `fulfilment-${Crypto.randomUUID()}`,
      orderLineId: selectedFulfilmentLineId,
      schemaVersion: 1,
    })
  }

  function openFulfilAllProducts() {
    if (
      !order ||
      isOffline ||
      fulfilmentMutation.isPending ||
      fulfilAllMutation.isPending
    )
      return
    if (!getOrderFulfilmentConfirmation(order, { kind: "all" })) return
    setError(null)
    fulfilAllModal.present()
  }

  function confirmFulfilAllProducts() {
    if (
      !order ||
      isOffline ||
      fulfilmentMutation.isPending ||
      fulfilAllMutation.isPending
    )
      return
    fulfilAllMutation.mutate({
      clientOperationId: `fulfilment-all-${Crypto.randomUUID()}`,
      orderId: order.id,
      schemaVersion: 1,
    })
  }

  if (!order) {
    return (
      <MobileScreen
        contentClassName="gap-6 pb-12"
        refreshControl={<QueryRefreshControl />}
        scroll
      >
        <CommercialOrderOverviewHeader onBack={goBack} title="Order overview" />
        <View className="flex-1 items-center justify-center py-16">
          {orderQuery.isPending && !isOffline ? (
            <EmptyState
              icon="ReceiptText"
              message="Loading the latest Commercial Order state."
              title="Loading order"
            />
          ) : (
            <EmptyState
              icon="ReceiptText"
              message={
                isOffline
                  ? "This Order is not available in the current device cache. Reconnect to load it."
                  : (orderQuery.error?.message ?? "Commercial Order not found.")
              }
              title={
                isOffline ? "Order unavailable offline" : "Order not found"
              }
            />
          )}
        </View>
        <ActionButton onPress={goBack} variant="outline">
          Back to orders
        </ActionButton>
      </MobileScreen>
    )
  }

  const hasBalanceDue = order.balanceDueMinor > 0

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextVisible = event.nativeEvent.contentOffset.y < mastheadHeight - 8
    setMastheadVisible((current) =>
      current === nextVisible ? current : nextVisible,
    )
  }

  return (
    <View className="flex-1">
      <Screen
        hasBalanceDue={hasBalanceDue}
        mastheadVisible={mastheadVisible}
        onScroll={handleScroll}
      >
        <Content
          activity={activity}
          businessName={profile?.businessName ?? "Business"}
          error={error}
          fulfillingOrderLineId={
            fulfilmentMutation.isPending
              ? fulfilmentMutation.variables?.orderLineId
              : undefined
          }
          isFulfillingAll={fulfilAllMutation.isPending}
          isOffline={isOffline}
          notice={notice}
          onBack={goBack}
          onFulfillAll={openFulfilAllProducts}
          onFulfillLine={openFulfilProductLine}
          onMastheadHeightChange={setMastheadHeight}
          onOpenCustomer={openCustomer}
          order={order}
        />
      </Screen>

      {hasBalanceDue ? (
        <PrimaryAction
          disabled={isOffline}
          onPress={openPaymentForm}
          order={order}
        />
      ) : null}

      <OrderPaymentSheet
        appearance={appearance}
        amountPaid={amountPaid}
        balanceLabel={formatMinorMoney(
          order.balanceDueMinor,
          order.currencyCode,
        )}
        currencyCode={order.currencyCode}
        error={error}
        isLoading={paymentMutation.isPending}
        isOffline={isOffline}
        onAmountPaidChange={setAmountPaid}
        onCancel={cancelPayment}
        onConfirm={recordPayment}
        onPaymentMethodChange={setPaymentMethod}
        onReferenceChange={setPaymentReference}
        paymentMethod={paymentMethod}
        quickFill={
          <QaQuickFillButton
            canUndo={canUndoPaymentQuickFill}
            formId="mobile.order.payment"
            isDirty={
              amountPaid !== minorToMajorInput(order.balanceDueMinor) ||
              paymentMethod !== "cash" ||
              Boolean(paymentReference.trim())
            }
            onFill={(context) => {
              const fixture = createQaPaymentFixture(
                context,
                order.balanceDueMinor,
              )
              paymentQuickFillSnapshot.current = {
                amountPaid,
                method: paymentMethod,
                reference: paymentReference,
              }
              setAmountPaid(minorToMajorInput(fixture.amountMinor))
              setPaymentMethod(fixture.method)
              setPaymentReference(fixture.reference)
              setCanUndoPaymentQuickFill(true)
              setError(null)
            }}
            onUndo={() => {
              const snapshot = paymentQuickFillSnapshot.current
              if (!snapshot) return
              setAmountPaid(snapshot.amountPaid)
              setPaymentMethod(snapshot.method)
              setPaymentReference(snapshot.reference)
              paymentQuickFillSnapshot.current = null
              setCanUndoPaymentQuickFill(false)
            }}
          />
        }
        reference={paymentReference}
        ref={paymentModal.ref}
      />

      <OrderFulfilmentConfirmationSheet
        appearance={appearance}
        error={error}
        isLoading={fulfilmentMutation.isPending}
        onCancel={() => {
          setError(null)
          fulfilLineModal.dismiss()
          setSelectedFulfilmentLineId(null)
        }}
        onConfirm={confirmFulfilProductLine}
        presentation={fulfilLinePresentation}
        ref={fulfilLineModal.ref}
      />

      <OrderFulfilmentConfirmationSheet
        appearance={appearance}
        error={error}
        isLoading={fulfilAllMutation.isPending}
        onCancel={() => {
          setError(null)
          fulfilAllModal.dismiss()
        }}
        onConfirm={confirmFulfilAllProducts}
        presentation={fulfilAllPresentation}
        ref={fulfilAllModal.ref}
      />
    </View>
  )
}
