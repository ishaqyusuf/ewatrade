import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import { useBusinessStore } from "@/store/businessStore"
import {
  type RetailOpsProduct,
  type RetailOpsShareLink,
  useRetailOpsStore,
} from "@/store/retailOpsStore"
import { useTRPC } from "@/trpc/client"
import { formatMoney } from "@ewatrade/utils"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as Clipboard from "expo-clipboard"
import { forwardRef, useEffect, useMemo, useState } from "react"
import { Share, View } from "react-native"

type ProductShareSheetProps = {
  onComplete?: () => void
}

type ShareLinkMetric = {
  icon:
    | "CircleCheck"
    | "Eye"
    | "Globe"
    | "ReceiptText"
    | "TrendingUp"
    | "Truck"
    | "Users"
  label: string
  value: string
}

type SharedLinkPaymentMethod = "cash" | "transfer" | "card"
type SharedLinkFulfillmentStatus =
  | "ready_for_pickup"
  | "picked_up"
  | "delivered"
type SharedLinkFulfillmentMethod = "pickup" | "delivery"

type SharedLinkFollowUpSelection = {
  fulfillmentMethod: SharedLinkFulfillmentMethod
  fulfillmentStatus: SharedLinkFulfillmentStatus
  paymentMethod: SharedLinkPaymentMethod
}

type DeliveryRequestStatus =
  | "assigned"
  | "cancelled"
  | "delivered"
  | "draft"
  | "open"
  | "picked_up"

type DeliveryRequestStatusUpdate =
  | "assigned"
  | "cancelled"
  | "delivered"
  | "picked_up"

type SharedLinkOrderRequestStatusAction = {
  orderId: string
  status: "cancelled" | "completed"
} | null

type DeliveryRequestStatusAction = {
  deliveryRequestId: string
  status: DeliveryRequestStatusUpdate
} | null

type DeliveryRequestDraft = {
  dropoffAddress?: string
  dropoffName?: string
  dropoffPhone?: string
  notes?: string
  pickupAddress?: string
  pickupName?: string
  pickupPhone?: string
}

type FollowUpOption<Value extends string> = {
  icon: IconKeys
  label: string
  value: Value
}

const defaultSharedLinkFollowUpSelection: SharedLinkFollowUpSelection = {
  fulfillmentMethod: "pickup",
  fulfillmentStatus: "picked_up",
  paymentMethod: "cash",
}

const paymentMethodOptions = [
  { icon: "Wallet", label: "Cash", value: "cash" },
  { icon: "CreditCard", label: "Transfer", value: "transfer" },
  { icon: "CreditCard", label: "Card", value: "card" },
] satisfies FollowUpOption<SharedLinkPaymentMethod>[]

const fulfillmentStatusOptions = [
  {
    icon: "Clock",
    label: "Ready",
    value: "ready_for_pickup",
  },
  {
    icon: "CircleCheck",
    label: "Picked up",
    value: "picked_up",
  },
  {
    icon: "Truck",
    label: "Delivered",
    value: "delivered",
  },
] satisfies FollowUpOption<SharedLinkFulfillmentStatus>[]

const fulfillmentMethodOptions = [
  { icon: "Warehouse", label: "Pickup", value: "pickup" },
  { icon: "Truck", label: "Delivery", value: "delivery" },
] satisfies FollowUpOption<SharedLinkFulfillmentMethod>[]

type SharedLinkOrderRequest = {
  createdAt: Date | string
  currencyCode: string
  customer: {
    email: string | null
    name: string | null
    phone: string | null
  }
  id: string
  line: {
    productName: string
    quantity: number
    unitName: string | null
  } | null
  notification?: {
    attemptCount?: number
    failedAt?: string | null
    failureReason?: string | null
    lastAttemptAt?: string | null
    sentAt?: string | null
    status?: string | null
  } | null
  orderNumber: string
  reservation?: {
    inventoryItemId?: string | null
    productVariantId?: string | null
    quantity?: number | null
    status?: string | null
  } | null
  totalMinor: number
}

type DeliveryRequest = {
  customer: {
    email: string | null
    name: string | null
    phone: string | null
  }
  dropoff: {
    address: string
    name: string
    phone: string | null
  }
  id: string
  order: {
    currencyCode: string
    id: string
    orderNumber: string
    totalMinor: number
  }
  pickup: {
    address: string
    name: string
    phone: string | null
  }
  requestedAt: Date | string
  status: DeliveryRequestStatus
}

type ProductionShareLink = {
  active: boolean
  createdAt: string
  createdByUserId: string
  id: string
  label: string | null
  lastActivityAt: string | null
  orderCount: number
  product: {
    id: string
    name: string
  }
  url: string
  viewCount: number
}

type ProductionShareLinkAnalyticsMetrics = {
  cancelledOrderCount: number
  completedOrderCount: number
  consumedQuantity: number
  orderRequestCount: number
  releasedQuantity: number
  reservedQuantity: number
  revenueMinor: number
  uniqueVisitorCount: number
  viewCount: number
}

type ProductionShareLinkAnalytics = {
  linkSummaries: Array<
    ProductionShareLinkAnalyticsMetrics & {
      shareLink: ProductionShareLink
    }
  >
  range: {
    from: string
    to: string
  }
  source: "daily_rollup" | "link_counters"
  summary: ProductionShareLinkAnalyticsMetrics & {
    activeLinkCount: number
    linkCount: number
  }
}

function formatOrderTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return "New request"

  return date.toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  })
}

function formatShortDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return "Recent"

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
}

function formatLinkTime(value: string | null) {
  if (!value) return "No activity yet"

  return formatOrderTime(value)
}

function formatCreatorLabel(value?: string | null) {
  if (!value) return "This device"

  return `Creator ${value.slice(-8) || value}`
}

function formatLocalLinkActivity(link: RetailOpsShareLink) {
  if (link.orders > 0 || link.views > 0) {
    return "Local activity on this device"
  }

  return "No activity yet"
}

function formatMinorMoney(value: number, currencyCode: string) {
  return formatMoney(value / 100, currencyCode || "NGN")
}

function getReservationStatusLabel(status: string | null | undefined) {
  if (status === "reserved") return "Stock reserved"
  if (status === "consumed") return "Stock consumed"
  if (status === "released") return "Stock released"

  return "Reservation pending"
}

function getNotificationStatusLabel(status: string | null | undefined) {
  if (status === "sent") return "Notification sent"
  if (status === "failed") return "Notify manually"

  return "Notification pending"
}

function getDeliveryRequestStatusLabel(status: DeliveryRequestStatus) {
  if (status === "assigned") return "Assigned"
  if (status === "cancelled") return "Cancelled"
  if (status === "delivered") return "Delivered"
  if (status === "picked_up") return "Picked up"

  return "Open"
}

function getDeliveryRequestStatusTone(status: DeliveryRequestStatus) {
  if (status === "delivered") return "sent"
  if (status === "cancelled") return "failed"
  if (status === "assigned" || status === "picked_up") return "released"

  return "pending"
}

function getStatusPillClassName(status: string | null | undefined) {
  if (status === "sent" || status === "reserved") {
    return "bg-emerald-500/10"
  }

  if (status === "failed") {
    return "bg-destructive/10"
  }

  if (status === "released" || status === "consumed") {
    return "bg-primary/10"
  }

  return "bg-muted"
}

function getStatusPillTextClassName(status: string | null | undefined) {
  if (status === "sent" || status === "reserved") {
    return "text-emerald-700"
  }

  if (status === "failed") {
    return "text-destructive"
  }

  if (status === "released" || status === "consumed") {
    return "text-primary"
  }

  return "text-muted-foreground"
}

function StatusPill({
  label,
  status,
}: {
  label: string
  status?: string | null
}) {
  return (
    <View
      className={cn("rounded-full px-3 py-1", getStatusPillClassName(status))}
    >
      <Text
        className={cn("text-xs font-bold", getStatusPillTextClassName(status))}
      >
        {label}
      </Text>
    </View>
  )
}

function shareGeneratedLink({
  title,
  url,
}: {
  title: string
  url: string
}) {
  void Share.share({
    message: `${title}\n${url}`,
    title,
    url,
  })
}

function getDeliveryDraftValue(
  draft: DeliveryRequestDraft | undefined,
  key: keyof DeliveryRequestDraft,
  fallback: string,
) {
  return draft?.[key] ?? fallback
}

function getDeliveryDraft(input: {
  draft?: DeliveryRequestDraft
  order: SharedLinkOrderRequest
}) {
  const customerName =
    input.order.customer.name ??
    input.order.customer.email ??
    input.order.customer.phone ??
    "Customer"

  return {
    dropoffAddress: getDeliveryDraftValue(input.draft, "dropoffAddress", ""),
    dropoffName: getDeliveryDraftValue(
      input.draft,
      "dropoffName",
      customerName,
    ),
    dropoffPhone: getDeliveryDraftValue(
      input.draft,
      "dropoffPhone",
      input.order.customer.phone ?? "",
    ),
    notes: getDeliveryDraftValue(input.draft, "notes", ""),
    pickupAddress: getDeliveryDraftValue(input.draft, "pickupAddress", ""),
    pickupName: getDeliveryDraftValue(input.draft, "pickupName", "Store"),
    pickupPhone: getDeliveryDraftValue(input.draft, "pickupPhone", ""),
  } satisfies Required<DeliveryRequestDraft>
}

function ProductOption({
  onPress,
  product,
  selected,
}: {
  onPress: () => void
  product: RetailOpsProduct
  selected: boolean
}) {
  return (
    <Pressable
      className={cn(
        "gap-2 rounded-2xl border border-border bg-card p-4 active:bg-accent",
        selected && "border-primary bg-primary/10",
      )}
      haptic
      onPress={onPress}
      transition
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">{product.name}</Text>
          <Text className="text-sm text-muted-foreground">
            {product.variants.length > 0
              ? `${product.variants.length} variants`
              : product.unitName}
          </Text>
        </View>
        <Icon
          className={cn(
            "size-base text-muted-foreground",
            selected && "text-primary",
          )}
          name={selected ? "CircleCheck" : "Share"}
        />
      </View>
    </Pressable>
  )
}

function ShareLinkMetricCard({ icon, label, value }: ShareLinkMetric) {
  return (
    <View className="flex-1 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-2">
        <Icon className="size-sm text-muted-foreground" name={icon} />
        <Text className="text-xs font-semibold uppercase text-muted-foreground">
          {label}
        </Text>
      </View>
      <Text className="mt-2 text-xl font-bold text-foreground">{value}</Text>
    </View>
  )
}

function ShareLinkAnalyticsPanel({
  analytics,
}: {
  analytics: ProductionShareLinkAnalytics
}) {
  const topLinks = [...analytics.linkSummaries]
    .filter(
      (linkSummary) =>
        linkSummary.viewCount > 0 ||
        linkSummary.orderRequestCount > 0 ||
        linkSummary.revenueMinor > 0,
    )
    .sort(
      (first, second) =>
        second.orderRequestCount - first.orderRequestCount ||
        second.viewCount - first.viewCount ||
        second.revenueMinor - first.revenueMinor,
    )
    .slice(0, 3)
  const sourceLabel =
    analytics.source === "daily_rollup" ? "Daily rollup" : "Link counters"

  return (
    <View className="gap-3 rounded-2xl border border-border bg-muted/40 p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">
            Generated-link analytics
          </Text>
          <Text className="text-xs leading-4 text-muted-foreground">
            {formatShortDate(analytics.range.from)} to{" "}
            {formatShortDate(analytics.range.to)} · {sourceLabel}
          </Text>
        </View>
        <Icon className="size-base text-primary" name="TrendingUp" />
      </View>

      <View className="flex-row gap-3">
        <ShareLinkMetricCard
          icon="Users"
          label="Visitors"
          value={String(analytics.summary.uniqueVisitorCount)}
        />
        <ShareLinkMetricCard
          icon="ReceiptText"
          label="Requests"
          value={String(analytics.summary.orderRequestCount)}
        />
      </View>

      <View className="flex-row gap-3">
        <ShareLinkMetricCard
          icon="CircleCheck"
          label="Completed"
          value={String(analytics.summary.completedOrderCount)}
        />
        <ShareLinkMetricCard
          icon="TrendingUp"
          label="Revenue"
          value={formatMinorMoney(analytics.summary.revenueMinor, "NGN")}
        />
      </View>

      <View className="flex-row flex-wrap gap-2">
        <View className="rounded-full bg-card px-3 py-2">
          <Text className="text-xs font-semibold text-muted-foreground">
            Reserved {analytics.summary.reservedQuantity}
          </Text>
        </View>
        <View className="rounded-full bg-card px-3 py-2">
          <Text className="text-xs font-semibold text-muted-foreground">
            Consumed {analytics.summary.consumedQuantity}
          </Text>
        </View>
        <View className="rounded-full bg-card px-3 py-2">
          <Text className="text-xs font-semibold text-muted-foreground">
            Released {analytics.summary.releasedQuantity}
          </Text>
        </View>
        <View className="rounded-full bg-card px-3 py-2">
          <Text className="text-xs font-semibold text-muted-foreground">
            Cancelled {analytics.summary.cancelledOrderCount}
          </Text>
        </View>
      </View>

      {topLinks.length > 0 ? (
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Top links
          </Text>
          {topLinks.map((linkSummary) => (
            <View
              className="gap-2 rounded-xl border border-border bg-card p-3"
              key={linkSummary.shareLink.id}
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                  <Text className="text-sm font-semibold text-foreground">
                    {linkSummary.shareLink.product.name}
                  </Text>
                  <Text
                    className="text-xs leading-4 text-muted-foreground"
                    numberOfLines={1}
                  >
                    {linkSummary.shareLink.url}
                  </Text>
                </View>
                <Text className="text-xs font-bold text-primary">
                  {linkSummary.orderRequestCount} orders
                </Text>
              </View>
              <Text className="text-xs leading-4 text-muted-foreground">
                {linkSummary.viewCount} views · {linkSummary.uniqueVisitorCount}{" "}
                visitors · {formatMinorMoney(linkSummary.revenueMinor, "NGN")}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-xs leading-4 text-muted-foreground">
          Detailed analytics will appear after customers view or order from a
          production link.
        </Text>
      )}
    </View>
  )
}

function FollowUpOptionGroup<Value extends string>({
  disabled,
  label,
  onSelect,
  options,
  selectedValue,
}: {
  disabled?: boolean
  label: string
  onSelect: (value: Value) => void
  options: FollowUpOption<Value>[]
  selectedValue: Value
}) {
  return (
    <View className="gap-2">
      <Text className="text-xs font-semibold text-muted-foreground">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = selectedValue === option.value

          return (
            <Pressable
              className={cn(
                "flex-row items-center gap-2 rounded-full border border-border bg-card px-3 py-2 active:bg-accent",
                selected && "border-primary bg-primary/10",
                disabled && "opacity-60",
              )}
              disabled={disabled}
              haptic
              key={option.value}
              onPress={() => onSelect(option.value)}
              transition
            >
              <Icon
                className={cn(
                  "size-xs text-muted-foreground",
                  selected && "text-primary",
                )}
                name={option.icon}
              />
              <Text
                className={cn(
                  "text-xs font-bold text-muted-foreground",
                  selected && "text-primary",
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function SharedLinkOrderRequestRow({
  activeStatus,
  deliveryDraft,
  followUp,
  isCreatingDelivery,
  isDeliveryCreationDisabled,
  isUpdating,
  onCancel,
  onCreateDeliveryRequest,
  onDeliveryDraftChange,
  onFollowUpChange,
  onComplete,
  order,
}: {
  activeStatus?: "cancelled" | "completed" | null
  deliveryDraft?: DeliveryRequestDraft
  followUp: SharedLinkFollowUpSelection
  isCreatingDelivery?: boolean
  isDeliveryCreationDisabled?: boolean
  isUpdating?: boolean
  onCancel: () => void
  onCreateDeliveryRequest: () => void
  onDeliveryDraftChange: (patch: Partial<DeliveryRequestDraft>) => void
  onFollowUpChange: (patch: Partial<SharedLinkFollowUpSelection>) => void
  onComplete: () => void
  order: SharedLinkOrderRequest
}) {
  const customerName =
    order.customer.name ??
    order.customer.email ??
    order.customer.phone ??
    "Customer"
  const lineName = order.line
    ? `${order.line.productName} - ${order.line.unitName ?? "Unit"}`
    : "Shared-link order"
  const quantity = order.line?.quantity ?? 0
  const notificationStatus = order.notification?.status ?? null
  const reservationStatus = order.reservation?.status ?? null
  const resolvedDeliveryDraft = getDeliveryDraft({
    draft: deliveryDraft,
    order,
  })
  const canCreateDeliveryRequest =
    resolvedDeliveryDraft.pickupAddress.trim().length > 0 &&
    resolvedDeliveryDraft.dropoffAddress.trim().length > 0

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">{customerName}</Text>
          <Text className="text-xs leading-5 text-muted-foreground">
            {order.orderNumber} - {formatOrderTime(order.createdAt)}
          </Text>
        </View>
        <Text className="text-sm font-bold text-primary">
          {formatMinorMoney(order.totalMinor, order.currencyCode)}
        </Text>
      </View>
      <View className="rounded-xl bg-muted p-3">
        <Text className="text-sm font-semibold text-foreground">
          {lineName}
        </Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          {quantity > 0 ? `${quantity} requested` : "Quantity pending review"}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <StatusPill
          label={getReservationStatusLabel(reservationStatus)}
          status={reservationStatus}
        />
        <StatusPill
          label={getNotificationStatusLabel(notificationStatus)}
          status={notificationStatus}
        />
      </View>
      {notificationStatus === "failed" ? (
        <Text className="text-xs leading-4 text-destructive">
          The customer request is saved. Contact them directly if email is not
          confirmed.
        </Text>
      ) : null}
      <View className="gap-3 rounded-xl bg-muted p-3">
        <Text className="text-xs font-bold uppercase text-muted-foreground">
          Follow-up details
        </Text>
        <FollowUpOptionGroup
          disabled={isUpdating}
          label="Payment"
          onSelect={(paymentMethod) => onFollowUpChange({ paymentMethod })}
          options={paymentMethodOptions}
          selectedValue={followUp.paymentMethod}
        />
        <FollowUpOptionGroup
          disabled={isUpdating}
          label="Outcome"
          onSelect={(fulfillmentStatus) =>
            onFollowUpChange({ fulfillmentStatus })
          }
          options={fulfillmentStatusOptions}
          selectedValue={followUp.fulfillmentStatus}
        />
        <FollowUpOptionGroup
          disabled={isUpdating}
          label="Method"
          onSelect={(fulfillmentMethod) =>
            onFollowUpChange({ fulfillmentMethod })
          }
          options={fulfillmentMethodOptions}
          selectedValue={followUp.fulfillmentMethod}
        />
      </View>
      {followUp.fulfillmentMethod === "delivery" ? (
        <View className="gap-3 rounded-xl bg-muted p-3">
          <Text className="text-xs font-bold uppercase text-muted-foreground">
            Delivery request
          </Text>
          <FormField
            label="Pickup address"
            onChangeText={(pickupAddress) =>
              onDeliveryDraftChange({ pickupAddress })
            }
            placeholder="Enter pickup address"
            value={resolvedDeliveryDraft.pickupAddress}
          />
          <View className="gap-3">
            <FormField
              label="Pickup name"
              onChangeText={(pickupName) =>
                onDeliveryDraftChange({ pickupName })
              }
              placeholder="Enter pickup contact name"
              value={resolvedDeliveryDraft.pickupName}
            />
            <FormField
              keyboardType="phone-pad"
              label="Pickup phone"
              onChangeText={(pickupPhone) =>
                onDeliveryDraftChange({ pickupPhone })
              }
              placeholder="Enter pickup phone"
              value={resolvedDeliveryDraft.pickupPhone}
            />
          </View>
          <FormField
            label="Dropoff address"
            onChangeText={(dropoffAddress) =>
              onDeliveryDraftChange({ dropoffAddress })
            }
            placeholder="Enter dropoff address"
            value={resolvedDeliveryDraft.dropoffAddress}
          />
          <View className="gap-3">
            <FormField
              label="Dropoff name"
              onChangeText={(dropoffName) =>
                onDeliveryDraftChange({ dropoffName })
              }
              placeholder="Enter dropoff contact name"
              value={resolvedDeliveryDraft.dropoffName}
            />
            <FormField
              keyboardType="phone-pad"
              label="Dropoff phone"
              onChangeText={(dropoffPhone) =>
                onDeliveryDraftChange({ dropoffPhone })
              }
              placeholder="Enter dropoff phone"
              value={resolvedDeliveryDraft.dropoffPhone}
            />
          </View>
          <FormField
            label="Delivery note"
            onChangeText={(notes) => onDeliveryDraftChange({ notes })}
            placeholder="Enter delivery instructions"
            value={resolvedDeliveryDraft.notes}
          />
          <Pressable
            className={cn(
              "flex-row items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 py-3 active:bg-primary/20",
              (!canCreateDeliveryRequest || isDeliveryCreationDisabled) &&
                "opacity-60",
            )}
            disabled={!canCreateDeliveryRequest || isDeliveryCreationDisabled}
            haptic
            onPress={onCreateDeliveryRequest}
            transition
          >
            <Icon className="size-sm text-primary" name="Truck" />
            <Text className="text-sm font-bold text-primary">
              {isCreatingDelivery
                ? "Creating request"
                : "Create delivery request"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View className="flex-row gap-3">
        <Pressable
          className={cn(
            "flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 py-3 active:bg-primary/20",
            isUpdating && "opacity-60",
          )}
          disabled={isUpdating}
          haptic
          onPress={onComplete}
          transition
        >
          <Icon className="size-sm text-primary" name="CheckCircle2" />
          <Text className="text-sm font-bold text-primary">
            {activeStatus === "completed" ? "Completing" : "Complete"}
          </Text>
        </Pressable>
        <Pressable
          className={cn(
            "flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-destructive/10 px-3 py-3 active:bg-destructive/20",
            isUpdating && "opacity-60",
          )}
          disabled={isUpdating}
          haptic
          onPress={onCancel}
          transition
        >
          <Icon className="size-sm text-destructive" name="XCircle" />
          <Text className="text-sm font-bold text-destructive">
            {activeStatus === "cancelled" ? "Cancelling" : "Cancel"}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function DeliveryRequestRow({
  activeStatus,
  isUpdating,
  onUpdateStatus,
  request,
}: {
  activeStatus?: DeliveryRequestStatusUpdate | null
  isUpdating?: boolean
  onUpdateStatus: (status: DeliveryRequestStatusUpdate) => void
  request: DeliveryRequest
}) {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">
            {request.order.orderNumber}
          </Text>
          <Text className="text-xs leading-5 text-muted-foreground">
            {request.customer.name ?? request.customer.email ?? "Customer"} -{" "}
            {formatOrderTime(request.requestedAt)}
          </Text>
        </View>
        <StatusPill
          label={getDeliveryRequestStatusLabel(request.status)}
          status={getDeliveryRequestStatusTone(request.status)}
        />
      </View>

      <View className="gap-2 rounded-xl bg-muted p-3">
        <Text className="text-xs font-bold uppercase text-muted-foreground">
          Route
        </Text>
        <Text className="text-sm font-semibold text-foreground">
          {request.pickup.name} to {request.dropoff.name}
        </Text>
        <Text className="text-xs leading-4 text-muted-foreground">
          {request.pickup.address} to {request.dropoff.address}
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {[
          { label: "Assign", status: "assigned" },
          { label: "Picked up", status: "picked_up" },
          { label: "Delivered", status: "delivered" },
          { label: "Cancel", status: "cancelled" },
        ].map((option) => (
          <Pressable
            className={cn(
              "flex-row items-center gap-2 rounded-full px-3 py-2",
              option.status === "cancelled"
                ? "bg-destructive/10 active:bg-destructive/20"
                : "bg-primary/10 active:bg-primary/20",
              isUpdating && "opacity-60",
            )}
            disabled={isUpdating}
            haptic
            key={option.status}
            onPress={() =>
              onUpdateStatus(option.status as DeliveryRequestStatusUpdate)
            }
            transition
          >
            <Icon
              className={cn(
                "size-sm",
                option.status === "cancelled"
                  ? "text-destructive"
                  : "text-primary",
              )}
              name={option.status === "cancelled" ? "XCircle" : "Truck"}
            />
            <Text
              className={cn(
                "text-xs font-bold",
                option.status === "cancelled"
                  ? "text-destructive"
                  : "text-primary",
              )}
            >
              {activeStatus === option.status ? "Updating" : option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function ProductionShareLinkRow({
  isCopied,
  isDeactivating,
  isUpdating,
  link,
  onCopy,
  onDeactivate,
  onShare,
}: {
  isCopied?: boolean
  isDeactivating?: boolean
  isUpdating?: boolean
  link: ProductionShareLink
  onCopy: () => void
  onDeactivate: () => void
  onShare: () => void
}) {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">
            {link.product.name}
          </Text>
          <Text
            className="text-xs leading-5 text-muted-foreground"
            numberOfLines={2}
          >
            {link.url}
          </Text>
          <Text className="text-xs leading-5 text-muted-foreground">
            Created {formatOrderTime(link.createdAt)} ·{" "}
            {formatCreatorLabel(link.createdByUserId)}
          </Text>
        </View>
        <View
          className={cn(
            "rounded-full px-3 py-1",
            link.active ? "bg-emerald-500/10" : "bg-muted",
          )}
        >
          <Text
            className={cn(
              "text-xs font-bold",
              link.active ? "text-emerald-700" : "text-muted-foreground",
            )}
          >
            {link.active ? "Active" : "Inactive"}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 rounded-xl bg-muted p-3">
          <Text className="text-xs font-semibold text-muted-foreground">
            Views
          </Text>
          <Text className="mt-1 text-lg font-bold text-foreground">
            {link.viewCount}
          </Text>
        </View>
        <View className="flex-1 rounded-xl bg-muted p-3">
          <Text className="text-xs font-semibold text-muted-foreground">
            Orders
          </Text>
          <Text className="mt-1 text-lg font-bold text-foreground">
            {link.orderCount}
          </Text>
        </View>
      </View>

      <Text className="text-xs leading-4 text-muted-foreground">
        Last activity: {formatLinkTime(link.lastActivityAt)}
      </Text>

      <View className="gap-3">
        <View className="flex-row gap-3">
          <Pressable
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 py-3 active:bg-primary/20"
            haptic
            onPress={onShare}
            transition
          >
            <Icon className="size-sm text-primary" name="Share" />
            <Text className="text-sm font-bold text-primary">Share</Text>
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 py-3 active:bg-primary/20"
            haptic
            onPress={onCopy}
            transition
          >
            <Icon
              className="size-sm text-primary"
              name={isCopied ? "ClipboardCheck" : "ClipboardList"}
            />
            <Text className="text-sm font-bold text-primary">
              {isCopied ? "Link copied" : "Copy link"}
            </Text>
          </Pressable>
        </View>
        {link.active ? (
          <Pressable
            className={cn(
              "flex-row items-center justify-center gap-2 rounded-xl bg-destructive/10 px-3 py-3 active:bg-destructive/20",
              isUpdating && "opacity-60",
            )}
            disabled={isUpdating}
            haptic
            onPress={onDeactivate}
            transition
          >
            <Icon className="size-sm text-destructive" name="Ban" />
            <Text className="text-sm font-bold text-destructive">
              {isDeactivating ? "Deactivating" : "Deactivate"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

function ShareLinkRow({
  isCopied,
  link,
  onCopy,
  onDeactivate,
  onShare,
}: {
  isCopied?: boolean
  link: RetailOpsShareLink
  onCopy: () => void
  onDeactivate: () => void
  onShare: () => void
}) {
  const isActive = link.status === "active"

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">
            {link.productName}
          </Text>
          <Text
            className="text-xs leading-5 text-muted-foreground"
            numberOfLines={2}
          >
            {link.url}
          </Text>
          <Text className="text-xs leading-5 text-muted-foreground">
            Created {formatOrderTime(link.createdAt)} · {formatCreatorLabel()}
          </Text>
        </View>
        <View
          className={cn(
            "rounded-full px-3 py-1",
            isActive ? "bg-emerald-500/10" : "bg-muted",
          )}
        >
          <Text
            className={cn(
              "text-xs font-bold",
              isActive ? "text-emerald-700" : "text-muted-foreground",
            )}
          >
            {isActive ? "Active" : "Inactive"}
          </Text>
        </View>
      </View>

      <Text className="text-xs leading-4 text-muted-foreground">
        Last activity: {formatLocalLinkActivity(link)}
      </Text>

      <View className="flex-row gap-3">
        <View className="flex-1 rounded-xl bg-muted p-3">
          <View className="flex-row items-center gap-2">
            <Icon className="size-sm text-muted-foreground" name="Eye" />
            <Text className="text-xs font-semibold text-muted-foreground">
              Views
            </Text>
          </View>
          <Text className="mt-1 text-lg font-bold text-foreground">
            {link.views}
          </Text>
        </View>
        <View className="flex-1 rounded-xl bg-muted p-3">
          <View className="flex-row items-center gap-2">
            <Icon
              className="size-sm text-muted-foreground"
              name="ReceiptText"
            />
            <Text className="text-xs font-semibold text-muted-foreground">
              Orders
            </Text>
          </View>
          <Text className="mt-1 text-lg font-bold text-foreground">
            {link.orders}
          </Text>
        </View>
      </View>

      <View className="gap-3">
        <View className="flex-row gap-3">
          <Pressable
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 py-3 active:bg-primary/20"
            haptic
            onPress={onShare}
            transition
          >
            <Icon className="size-sm text-primary" name="Share" />
            <Text className="text-sm font-bold text-primary">Share link</Text>
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 py-3 active:bg-primary/20"
            haptic
            onPress={onCopy}
            transition
          >
            <Icon
              className="size-sm text-primary"
              name={isCopied ? "ClipboardCheck" : "ClipboardList"}
            />
            <Text className="text-sm font-bold text-primary">
              {isCopied ? "Link copied" : "Copy link"}
            </Text>
          </Pressable>
        </View>
        {isActive ? (
          <Pressable
            className="flex-row items-center justify-center gap-2 rounded-xl bg-destructive/10 px-3 py-3 active:bg-destructive/20"
            haptic
            onPress={onDeactivate}
            transition
          >
            <Icon className="size-sm text-destructive" name="Ban" />
            <Text className="text-sm font-bold text-destructive">
              Deactivate
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

export const ProductShareSheet = forwardRef<
  BottomSheetModal,
  ProductShareSheetProps
>(({ onComplete }, ref) => {
  const trpc = useTRPC()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const createShareLink = useRetailOpsStore((state) => state.createShareLink)
  const deactivateShareLink = useRetailOpsStore(
    (state) => state.deactivateShareLink,
  )
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
  const allProducts = useRetailOpsStore((state) => state.products)
  const allShareLinks = useRetailOpsStore((state) => state.shareLinks)
  const products = useMemo(
    () =>
      allProducts.filter(
        (product) =>
          !activeBusinessId ||
          (product.businessId ?? activeBusinessId) === activeBusinessId,
      ),
    [activeBusinessId, allProducts],
  )
  const shareLinks = useMemo(
    () =>
      allShareLinks.filter(
        (link) =>
          !activeBusinessId ||
          (link.businessId ?? activeBusinessId) === activeBusinessId,
      ),
    [activeBusinessId, allShareLinks],
  )
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    products[0]?.id ?? null,
  )
  const [productQuery, setProductQuery] = useState("")
  const [orderFollowUps, setOrderFollowUps] = useState<
    Record<string, SharedLinkFollowUpSelection>
  >({})
  const [deliveryDrafts, setDeliveryDrafts] = useState<
    Record<string, DeliveryRequestDraft>
  >({})
  const [
    deactivatingProductionShareLinkId,
    setDeactivatingProductionShareLinkId,
  ] = useState<string | null>(null)
  const [deliveryCreationOrderId, setDeliveryCreationOrderId] = useState<
    string | null
  >(null)
  const [deliveryRequestStatusAction, setDeliveryRequestStatusAction] =
    useState<DeliveryRequestStatusAction>(null)
  const [orderRequestStatusAction, setOrderRequestStatusAction] =
    useState<SharedLinkOrderRequestStatusAction>(null)
  const [copiedShareLinkKey, setCopiedShareLinkKey] = useState<string | null>(
    null,
  )

  useEffect(() => {
    if (products.length === 0) {
      setSelectedProductId(null)
      return
    }

    const selectedProductExists = products.some(
      (product) => product.id === selectedProductId,
    )

    if (!selectedProductExists) {
      setSelectedProductId(products[0]?.id ?? null)
    }
  }, [products, selectedProductId])

  useEffect(() => {
    if (!copiedShareLinkKey) return

    const timeout = setTimeout(() => {
      setCopiedShareLinkKey(null)
    }, 1800)

    return () => {
      clearTimeout(timeout)
    }
  }, [copiedShareLinkKey])

  const selectedProduct = products.find(
    (product) => product.id === selectedProductId,
  )
  const filteredProducts = useMemo(() => {
    const normalizedQuery = productQuery.trim().toLowerCase()
    return normalizedQuery
      ? products.filter((product) =>
          product.name.toLowerCase().includes(normalizedQuery),
        )
      : products
  }, [productQuery, products])
  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, 12),
    [filteredProducts],
  )
  const hasMoreProducts = visibleProducts.length < filteredProducts.length
  const activeLinkCount = shareLinks.filter(
    (link) => link.status === "active",
  ).length
  const totalViews = shareLinks.reduce((total, link) => total + link.views, 0)
  const totalOrders = shareLinks.reduce((total, link) => total + link.orders, 0)
  const productionLinksQuery = useQuery(
    trpc.retailOps.productShareLinks.queryOptions(
      {},
      {
        enabled: !isOfflineMode,
        retry: false,
      },
    ),
  )
  const productionLinkAnalyticsQuery = useQuery(
    trpc.retailOps.productShareLinkAnalytics.queryOptions(
      {},
      {
        enabled: !isOfflineMode,
        retry: false,
      },
    ),
  )
  const orderRequestsQuery = useQuery(
    trpc.retailOps.sharedLinkOrderRequests.queryOptions(
      {
        limit: 5,
        status: "pending",
      },
      {
        enabled: !isOfflineMode,
        retry: false,
      },
    ),
  )
  const deliveryRequestsQuery = useQuery(
    trpc.retailOps.deliveryRequests.queryOptions(
      {
        limit: 6,
        status: "all",
      },
      {
        enabled: !isOfflineMode,
        retry: false,
      },
    ),
  )
  const createProductionShareLinkMutation = useMutation(
    trpc.retailOps.createProductShareLink.mutationOptions({
      onSuccess: (link) => {
        shareGeneratedLink({
          title: link.product.name,
          url: link.url,
        })
        void productionLinksQuery.refetch()
        void productionLinkAnalyticsQuery.refetch()
      },
    }),
  )
  const deactivateProductionShareLinkMutation = useMutation(
    trpc.retailOps.deactivateProductShareLink.mutationOptions({
      onSuccess: () => {
        void productionLinksQuery.refetch()
        void productionLinkAnalyticsQuery.refetch()
      },
      onSettled: () => {
        setDeactivatingProductionShareLinkId(null)
      },
    }),
  )
  const updateOrderRequestStatusMutation = useMutation(
    trpc.retailOps.updateSharedLinkOrderRequestStatus.mutationOptions({
      onSuccess: () => {
        setOrderFollowUps({})
        void orderRequestsQuery.refetch()
        void deliveryRequestsQuery.refetch()
        void productionLinkAnalyticsQuery.refetch()
      },
      onSettled: () => {
        setOrderRequestStatusAction(null)
      },
    }),
  )
  const createDeliveryRequestMutation = useMutation(
    trpc.retailOps.createDeliveryRequest.mutationOptions({
      onSuccess: () => {
        setDeliveryDrafts({})
        void deliveryRequestsQuery.refetch()
      },
      onSettled: () => {
        setDeliveryCreationOrderId(null)
      },
    }),
  )
  const updateDeliveryRequestStatusMutation = useMutation(
    trpc.retailOps.updateDeliveryRequestStatus.mutationOptions({
      onSuccess: () => {
        void deliveryRequestsQuery.refetch()
      },
      onSettled: () => {
        setDeliveryRequestStatusAction(null)
      },
    }),
  )
  const productionLinks = productionLinksQuery.data ?? []
  const productionLinkAnalytics = productionLinkAnalyticsQuery.data as
    | ProductionShareLinkAnalytics
    | undefined
  const productionActiveLinkCount = productionLinks.filter(
    (link) => link.active,
  ).length
  const productionTotalViews = productionLinks.reduce(
    (total, link) => total + link.viewCount,
    0,
  )
  const productionTotalOrders = productionLinks.reduce(
    (total, link) => total + link.orderCount,
    0,
  )
  const orderRequests = orderRequestsQuery.data ?? []
  const deliveryRequests = (deliveryRequestsQuery.data ??
    []) as DeliveryRequest[]
  const visibleShareLinks = useMemo(() => shareLinks.slice(0, 8), [shareLinks])
  const visibleProductionLinks = useMemo(
    () => productionLinks.slice(0, 8),
    [productionLinks],
  )
  const visibleOrderRequests = useMemo(
    () => orderRequests.slice(0, 6),
    [orderRequests],
  )
  const visibleDeliveryRequests = useMemo(
    () => deliveryRequests.slice(0, 6),
    [deliveryRequests],
  )

  const generateLink = () => {
    if (!selectedProduct) return

    if (!isOfflineMode && selectedProduct.remoteId) {
      createProductionShareLinkMutation.mutate({
        productId: selectedProduct.remoteId,
      })
      return
    }

    const link = createShareLink({
      businessId: activeBusinessId ?? undefined,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
    })
    shareGeneratedLink({
      title: link.productName,
      url: link.url,
    })
  }
  const copyGeneratedLink = (key: string, url: string) => {
    void Clipboard.setStringAsync(url).then(() => {
      setCopiedShareLinkKey(key)
    })
  }
  const updateOrderRequestStatus = (
    orderId: string,
    status: "cancelled" | "completed",
  ) => {
    if (orderRequestStatusAction) return

    const followUp =
      orderFollowUps[orderId] ?? defaultSharedLinkFollowUpSelection

    setOrderRequestStatusAction({ orderId, status })
    updateOrderRequestStatusMutation.mutate({
      ...(status === "completed"
        ? {
            fulfillmentMethod: followUp.fulfillmentMethod,
            fulfillmentStatus: followUp.fulfillmentStatus,
            paymentMethod: followUp.paymentMethod,
          }
        : {}),
      orderId,
      status,
    })
  }
  const updateOrderFollowUp = (
    orderId: string,
    patch: Partial<SharedLinkFollowUpSelection>,
  ) => {
    setOrderFollowUps((current) => ({
      ...current,
      [orderId]: {
        ...defaultSharedLinkFollowUpSelection,
        ...current[orderId],
        ...patch,
      },
    }))
  }
  const updateDeliveryDraft = (
    orderId: string,
    patch: Partial<DeliveryRequestDraft>,
  ) => {
    setDeliveryDrafts((current) => ({
      ...current,
      [orderId]: {
        ...current[orderId],
        ...patch,
      },
    }))
  }
  const createDeliveryRequest = (order: SharedLinkOrderRequest) => {
    if (deliveryCreationOrderId) return

    const deliveryDraft = getDeliveryDraft({
      draft: deliveryDrafts[order.id],
      order,
    })

    setDeliveryCreationOrderId(order.id)
    createDeliveryRequestMutation.mutate({
      dropoffAddress: deliveryDraft.dropoffAddress.trim(),
      dropoffName: deliveryDraft.dropoffName.trim(),
      dropoffPhone: deliveryDraft.dropoffPhone.trim() || undefined,
      notes: deliveryDraft.notes.trim() || undefined,
      orderId: order.id,
      pickupAddress: deliveryDraft.pickupAddress.trim(),
      pickupName: deliveryDraft.pickupName.trim(),
      pickupPhone: deliveryDraft.pickupPhone.trim() || undefined,
    })
  }
  const updateDeliveryRequestStatus = (
    deliveryRequestId: string,
    status: DeliveryRequestStatusUpdate,
  ) => {
    if (deliveryRequestStatusAction) return

    setDeliveryRequestStatusAction({ deliveryRequestId, status })
    updateDeliveryRequestStatusMutation.mutate({
      deliveryRequestId,
      status,
    })
  }
  const deactivateProductionShareLink = (link: ProductionShareLink) => {
    if (deactivatingProductionShareLinkId) return

    setDeactivatingProductionShareLinkId(link.id)
    deactivateProductionShareLinkMutation.mutate({
      productId: link.product.id,
      shareLinkId: link.id,
    })
  }

  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["88%"]}
      title="Share product"
    >
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={320}
        contentContainerStyle={{ paddingBottom: 240 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-5 pb-6">
          <View className="gap-2">
            <Text className="text-xl font-bold text-foreground">
              Product links
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Create customer-facing links and review link performance.
            </Text>
          </View>

          <View className="flex-row gap-3">
            <ShareLinkMetricCard
              icon="Globe"
              label="Active"
              value={`${activeLinkCount}/${shareLinks.length}`}
            />
            <ShareLinkMetricCard
              icon="Eye"
              label="Views"
              value={String(totalViews)}
            />
          </View>

          <View className="flex-row gap-3">
            <ShareLinkMetricCard
              icon="ReceiptText"
              label="Orders"
              value={String(totalOrders)}
            />
            <ShareLinkMetricCard
              icon="Globe"
              label="Products"
              value={String(products.length)}
            />
          </View>

          {products.length === 0 ? (
            <View className="gap-2 rounded-2xl border border-dashed border-border p-4">
              <Text className="font-semibold text-foreground">
                Add inventory first
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Create at least one item before generating a product link.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              <FormField
                autoCapitalize="words"
                helper={
                  hasMoreProducts
                    ? "Showing the first matches. Search to find another product."
                    : "Choose the product that should get a customer link."
                }
                label="Find product"
                onChangeText={setProductQuery}
                placeholder="Search by product name"
                value={productQuery}
              />
              {visibleProducts.length > 0 ? (
                visibleProducts.map((product) => (
                  <ProductOption
                    key={product.id}
                    onPress={() => setSelectedProductId(product.id)}
                    product={product}
                    selected={selectedProductId === product.id}
                  />
                ))
              ) : (
                <View className="gap-2 rounded-2xl border border-dashed border-border p-4">
                  <Text className="font-semibold text-foreground">
                    No products found
                  </Text>
                  <Text className="text-sm leading-5 text-muted-foreground">
                    Adjust the product search to generate a link.
                  </Text>
                </View>
              )}
            </View>
          )}

          <ActionButton
            disabled={
              !selectedProduct || createProductionShareLinkMutation.isPending
            }
            onPress={generateLink}
          >
            {createProductionShareLinkMutation.isPending
              ? "Generating production link"
              : !isOfflineMode && selectedProduct?.remoteId
                ? "Generate production link"
                : "Generate and share link"}
          </ActionButton>
          {!isOfflineMode && selectedProduct && !selectedProduct.remoteId ? (
            <Text className="text-xs leading-4 text-muted-foreground">
              This product will use the local link flow until product setup has
              synced to production.
            </Text>
          ) : null}
          {createProductionShareLinkMutation.isError ? (
            <Text className="text-sm leading-5 text-destructive">
              {createProductionShareLinkMutation.error.message}
            </Text>
          ) : null}

          <View className="gap-3">
            <Text className="text-base font-bold text-foreground">
              All generated links
            </Text>
            {shareLinks.length > 0 ? (
              <>
                {visibleShareLinks.map((link) => (
                  <ShareLinkRow
                    isCopied={copiedShareLinkKey === `local:${link.id}`}
                    key={link.id}
                    link={link}
                    onCopy={() =>
                      copyGeneratedLink(`local:${link.id}`, link.url)
                    }
                    onDeactivate={() => deactivateShareLink(link.id)}
                    onShare={() =>
                      shareGeneratedLink({
                        title: link.productName,
                        url: link.url,
                      })
                    }
                  />
                ))}
                {shareLinks.length > visibleShareLinks.length ? (
                  <Text className="text-xs font-semibold text-muted-foreground">
                    Showing first {visibleShareLinks.length} of{" "}
                    {shareLinks.length} generated links.
                  </Text>
                ) : null}
              </>
            ) : (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Generated product links will appear here with views, orders,
                  and deactivation controls.
                </Text>
              </View>
            )}
          </View>

          <View className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-base font-bold text-foreground">
                Production link performance
              </Text>
              {!isOfflineMode ? (
                <Pressable
                  className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
                  haptic
                  onPress={() => {
                    void productionLinksQuery.refetch()
                    void productionLinkAnalyticsQuery.refetch()
                  }}
                  transition
                >
                  <Text className="text-xs font-bold text-primary">
                    Refresh
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {isOfflineMode ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Production link analytics will refresh when this device is
                  back online.
                </Text>
              </View>
            ) : productionLinks.length > 0 ? (
              <View className="gap-3">
                <View className="flex-row gap-3">
                  <ShareLinkMetricCard
                    icon="Globe"
                    label="Active"
                    value={`${productionActiveLinkCount}/${productionLinks.length}`}
                  />
                  <ShareLinkMetricCard
                    icon="Eye"
                    label="Views"
                    value={String(productionTotalViews)}
                  />
                </View>
                <View className="flex-row gap-3">
                  <ShareLinkMetricCard
                    icon="ReceiptText"
                    label="Orders"
                    value={String(productionTotalOrders)}
                  />
                  <ShareLinkMetricCard
                    icon="Globe"
                    label="Synced"
                    value={String(productionLinks.length)}
                  />
                </View>
                {productionLinkAnalytics ? (
                  <ShareLinkAnalyticsPanel
                    analytics={productionLinkAnalytics}
                  />
                ) : productionLinkAnalyticsQuery.isFetching ? (
                  <View className="rounded-2xl border border-dashed border-border p-4">
                    <Text className="text-sm leading-5 text-muted-foreground">
                      Checking detailed generated-link analytics.
                    </Text>
                  </View>
                ) : productionLinkAnalyticsQuery.isError ? (
                  <View className="rounded-2xl border border-dashed border-border p-4">
                    <Text className="text-sm leading-5 text-muted-foreground">
                      Detailed generated-link analytics are unavailable for this
                      session.
                    </Text>
                  </View>
                ) : null}
                {visibleProductionLinks.map((link) => (
                  <ProductionShareLinkRow
                    isCopied={copiedShareLinkKey === `production:${link.id}`}
                    isDeactivating={
                      deactivatingProductionShareLinkId === link.id
                    }
                    isUpdating={
                      deactivateProductionShareLinkMutation.isPending ||
                      deactivatingProductionShareLinkId !== null
                    }
                    key={link.id}
                    link={link}
                    onCopy={() =>
                      copyGeneratedLink(`production:${link.id}`, link.url)
                    }
                    onDeactivate={() => deactivateProductionShareLink(link)}
                    onShare={() =>
                      shareGeneratedLink({
                        title: link.product.name,
                        url: link.url,
                      })
                    }
                  />
                ))}
                {productionLinks.length > visibleProductionLinks.length ? (
                  <Text className="text-xs font-semibold text-muted-foreground">
                    Showing first {visibleProductionLinks.length} of{" "}
                    {productionLinks.length} production links.
                  </Text>
                ) : null}
              </View>
            ) : productionLinksQuery.isFetching ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Checking production for generated product links.
                </Text>
              </View>
            ) : productionLinksQuery.isError ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Production link analytics are unavailable for this session.
                </Text>
              </View>
            ) : (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Synced generated links will appear here with production views
                  and order counts.
                </Text>
              </View>
            )}
            {deactivateProductionShareLinkMutation.isError ? (
              <Text className="text-sm leading-5 text-destructive">
                {deactivateProductionShareLinkMutation.error.message}
              </Text>
            ) : null}
          </View>

          <View className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-base font-bold text-foreground">
                Pending link orders
              </Text>
              {!isOfflineMode ? (
                <Pressable
                  className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
                  haptic
                  onPress={() => {
                    void orderRequestsQuery.refetch()
                  }}
                  transition
                >
                  <Text className="text-xs font-bold text-primary">
                    Refresh
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {isOfflineMode ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Link orders will refresh when this device is back online.
                </Text>
              </View>
            ) : orderRequests.length > 0 ? (
              <>
                {visibleOrderRequests.map((order) => (
                  <SharedLinkOrderRequestRow
                    activeStatus={
                      orderRequestStatusAction?.orderId === order.id
                        ? orderRequestStatusAction.status
                        : null
                    }
                    deliveryDraft={deliveryDrafts[order.id]}
                    followUp={
                      orderFollowUps[order.id] ??
                      defaultSharedLinkFollowUpSelection
                    }
                    isCreatingDelivery={deliveryCreationOrderId === order.id}
                    isDeliveryCreationDisabled={
                      createDeliveryRequestMutation.isPending ||
                      deliveryCreationOrderId !== null
                    }
                    isUpdating={
                      updateOrderRequestStatusMutation.isPending ||
                      orderRequestStatusAction !== null
                    }
                    key={order.id}
                    onCancel={() =>
                      updateOrderRequestStatus(order.id, "cancelled")
                    }
                    onCreateDeliveryRequest={() => createDeliveryRequest(order)}
                    onDeliveryDraftChange={(patch) =>
                      updateDeliveryDraft(order.id, patch)
                    }
                    onFollowUpChange={(patch) =>
                      updateOrderFollowUp(order.id, patch)
                    }
                    onComplete={() =>
                      updateOrderRequestStatus(order.id, "completed")
                    }
                    order={order}
                  />
                ))}
                {orderRequests.length > visibleOrderRequests.length ? (
                  <Text className="text-xs font-semibold text-muted-foreground">
                    Showing first {visibleOrderRequests.length} of{" "}
                    {orderRequests.length} pending orders.
                  </Text>
                ) : null}
              </>
            ) : orderRequestsQuery.isFetching ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Checking production for new link orders.
                </Text>
              </View>
            ) : orderRequestsQuery.isError ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Production link orders are unavailable for this session.
                </Text>
              </View>
            ) : (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  No pending customer requests from shared links yet.
                </Text>
              </View>
            )}
            {updateOrderRequestStatusMutation.isError ? (
              <Text className="text-sm leading-5 text-destructive">
                {updateOrderRequestStatusMutation.error.message}
              </Text>
            ) : null}
            {createDeliveryRequestMutation.isError ? (
              <Text className="text-sm leading-5 text-destructive">
                {createDeliveryRequestMutation.error.message}
              </Text>
            ) : null}
          </View>

          <View className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-base font-bold text-foreground">
                Delivery follow-up
              </Text>
              {!isOfflineMode ? (
                <Pressable
                  className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
                  haptic
                  onPress={() => {
                    void deliveryRequestsQuery.refetch()
                  }}
                  transition
                >
                  <Text className="text-xs font-bold text-primary">
                    Refresh
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {isOfflineMode ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Delivery requests will refresh when this device is back
                  online.
                </Text>
              </View>
            ) : deliveryRequests.length > 0 ? (
              <>
                {visibleDeliveryRequests.map((request) => (
                  <DeliveryRequestRow
                    activeStatus={
                      deliveryRequestStatusAction?.deliveryRequestId ===
                      request.id
                        ? deliveryRequestStatusAction.status
                        : null
                    }
                    isUpdating={
                      updateDeliveryRequestStatusMutation.isPending ||
                      deliveryRequestStatusAction !== null
                    }
                    key={request.id}
                    onUpdateStatus={(status) =>
                      updateDeliveryRequestStatus(request.id, status)
                    }
                    request={request}
                  />
                ))}
                {deliveryRequests.length > visibleDeliveryRequests.length ? (
                  <Text className="text-xs font-semibold text-muted-foreground">
                    Showing first {visibleDeliveryRequests.length} of{" "}
                    {deliveryRequests.length} delivery requests.
                  </Text>
                ) : null}
              </>
            ) : deliveryRequestsQuery.isFetching ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Checking production for delivery requests.
                </Text>
              </View>
            ) : deliveryRequestsQuery.isError ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Delivery requests are unavailable for this session.
                </Text>
              </View>
            ) : (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Delivery requests created from shared-link orders will appear
                  here.
                </Text>
              </View>
            )}
            {updateDeliveryRequestStatusMutation.isError ? (
              <Text className="text-sm leading-5 text-destructive">
                {updateDeliveryRequestStatusMutation.error.message}
              </Text>
            ) : null}
          </View>

          <ActionButton onPress={onComplete} variant="outline">
            Done
          </ActionButton>
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  )
})

ProductShareSheet.displayName = "ProductShareSheet"
