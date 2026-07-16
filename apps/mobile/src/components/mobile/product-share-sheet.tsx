import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { InventoryProductCard } from "@/components/mobile/inventory-product-card"
import {
  ShareLinkActionButton,
  ShareLinkMetricTile,
  ShareLinkOptionPill,
  ShareLinkPanel,
  ShareLinkRecordRow,
} from "@/components/mobile/share-link-flow"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import type { MobileDesignStatusTone } from "@/lib/design-foundation"
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
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

type ProductShareSheetProps = {
  onComplete?: () => void
}

type ProductShareContentProps = ProductShareSheetProps & {
  presentation?: "screen" | "sheet"
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

function getStatusBadgeTone(
  status: string | null | undefined,
): MobileDesignStatusTone {
  if (status === "sent" || status === "reserved") {
    return "success"
  }

  if (status === "failed") {
    return "destructive"
  }

  if (status === "released" || status === "consumed") {
    return "primary"
  }

  return "muted"
}

function SharedLinkStatusBadge({
  icon,
  label,
  status,
}: {
  icon?: IconKeys
  label: string
  status?: string | null
}) {
  return (
    <StatusBadge icon={icon} label={label} tone={getStatusBadgeTone(status)} />
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
    <InventoryProductCard
      icon="Share"
      onPress={onPress}
      priceLabel={formatMoney(product.price, "NGN")}
      selected={selected}
      stockLabel={
        product.variants.length > 0
          ? `${product.variants.length} variants`
          : product.unitName
      }
      stockTone="muted"
      subtitle="Shareable product"
      title={product.name}
    />
  )
}

function ShareLinkMetricCard({ icon, label, value }: ShareLinkMetric) {
  return <ShareLinkMetricTile icon={icon} label={label} value={value} />
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
    <ShareLinkPanel
      description={`${formatShortDate(analytics.range.from)} to ${formatShortDate(
        analytics.range.to,
      )} - ${sourceLabel}`}
      icon="TrendingUp"
      title="Generated-link analytics"
    >
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
        <StatusBadge
          label={`Reserved ${analytics.summary.reservedQuantity}`}
          tone="success"
        />
        <StatusBadge
          label={`Consumed ${analytics.summary.consumedQuantity}`}
          tone="primary"
        />
        <StatusBadge
          label={`Released ${analytics.summary.releasedQuantity}`}
          tone="muted"
        />
        <StatusBadge
          label={`Cancelled ${analytics.summary.cancelledOrderCount}`}
          tone="destructive"
        />
      </View>

      {topLinks.length > 0 ? (
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Top links
          </Text>
          {topLinks.map((linkSummary) => (
            <ShareLinkRecordRow
              detail={linkSummary.shareLink.url}
              key={linkSummary.shareLink.id}
              meta={`${linkSummary.viewCount} views - ${
                linkSummary.uniqueVisitorCount
              } visitors - ${formatMinorMoney(linkSummary.revenueMinor, "NGN")}`}
              title={linkSummary.shareLink.product.name}
              trailing={
                <Text className="text-xs font-bold text-primary">
                  {linkSummary.orderRequestCount} orders
                </Text>
              }
            />
          ))}
        </View>
      ) : (
        <Text className="text-xs leading-4 text-muted-foreground">
          Detailed analytics will appear after customers view or order from a
          production link.
        </Text>
      )}
    </ShareLinkPanel>
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
            <ShareLinkOptionPill
              disabled={disabled}
              icon={option.icon}
              key={option.value}
              label={option.label}
              onPress={() => onSelect(option.value)}
              selected={selected}
            />
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
    <ShareLinkRecordRow
      detail={`${order.orderNumber} - ${formatOrderTime(order.createdAt)}`}
      title={customerName}
      trailing={
        <Text className="text-sm font-bold text-primary">
          {formatMinorMoney(order.totalMinor, order.currencyCode)}
        </Text>
      }
    >
      <View className="border-y border-border py-3">
        <Text className="text-sm font-semibold text-foreground">
          {lineName}
        </Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          {quantity > 0 ? `${quantity} requested` : "Quantity pending review"}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <SharedLinkStatusBadge
          label={getReservationStatusLabel(reservationStatus)}
          status={reservationStatus}
        />
        <SharedLinkStatusBadge
          label={getNotificationStatusLabel(notificationStatus)}
          status={notificationStatus}
        />
      </View>
      {notificationStatus === "failed" ? (
        <StatusBanner
          icon="TriangleAlert"
          message="The customer request is saved. Contact them directly if email is not confirmed."
          title="Notification needs follow-up"
          tone="destructive"
        />
      ) : null}
      <View className="gap-3 border-y border-border py-3">
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
        <View className="gap-3 border-y border-border py-3">
          <Text className="text-xs font-bold uppercase text-muted-foreground">
            Delivery request
          </Text>
          <FormField
            label="Pickup address"
            leadingIcon="MapPin"
            onChangeText={(pickupAddress) =>
              onDeliveryDraftChange({ pickupAddress })
            }
            placeholder="Enter pickup address"
            value={resolvedDeliveryDraft.pickupAddress}
          />
          <View className="gap-3">
            <FormField
              label="Pickup name"
              leadingIcon="User"
              onChangeText={(pickupName) =>
                onDeliveryDraftChange({ pickupName })
              }
              placeholder="Enter pickup contact name"
              value={resolvedDeliveryDraft.pickupName}
            />
            <FormField
              keyboardType="phone-pad"
              label="Pickup phone"
              leadingIcon="Phone"
              onChangeText={(pickupPhone) =>
                onDeliveryDraftChange({ pickupPhone })
              }
              placeholder="Enter pickup phone"
              value={resolvedDeliveryDraft.pickupPhone}
            />
          </View>
          <FormField
            label="Dropoff address"
            leadingIcon="MapPin"
            onChangeText={(dropoffAddress) =>
              onDeliveryDraftChange({ dropoffAddress })
            }
            placeholder="Enter dropoff address"
            value={resolvedDeliveryDraft.dropoffAddress}
          />
          <View className="gap-3">
            <FormField
              label="Dropoff name"
              leadingIcon="User"
              onChangeText={(dropoffName) =>
                onDeliveryDraftChange({ dropoffName })
              }
              placeholder="Enter dropoff contact name"
              value={resolvedDeliveryDraft.dropoffName}
            />
            <FormField
              keyboardType="phone-pad"
              label="Dropoff phone"
              leadingIcon="Phone"
              onChangeText={(dropoffPhone) =>
                onDeliveryDraftChange({ dropoffPhone })
              }
              placeholder="Enter dropoff phone"
              value={resolvedDeliveryDraft.dropoffPhone}
            />
          </View>
          <FormField
            label="Delivery note"
            leadingIcon="StickyNote"
            onChangeText={(notes) => onDeliveryDraftChange({ notes })}
            placeholder="Enter delivery instructions"
            value={resolvedDeliveryDraft.notes}
          />
          <ShareLinkActionButton
            disabled={!canCreateDeliveryRequest || isDeliveryCreationDisabled}
            icon="Truck"
            isLoading={isCreatingDelivery}
            label="Create delivery request"
            loadingLabel="Creating request"
            onPress={onCreateDeliveryRequest}
          />
        </View>
      ) : null}
      <View className="flex-row gap-3">
        <ShareLinkActionButton
          disabled={isUpdating}
          icon="CheckCircle2"
          isLoading={activeStatus === "completed"}
          label="Complete"
          loadingLabel="Completing"
          onPress={onComplete}
        />
        <ShareLinkActionButton
          destructive
          disabled={isUpdating}
          icon="XCircle"
          isLoading={activeStatus === "cancelled"}
          label="Cancel"
          loadingLabel="Cancelling"
          onPress={onCancel}
        />
      </View>
    </ShareLinkRecordRow>
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
    <ShareLinkRecordRow
      detail={`${request.customer.name ?? request.customer.email ?? "Customer"} - ${formatOrderTime(request.requestedAt)}`}
      title={request.order.orderNumber}
      trailing={
        <SharedLinkStatusBadge
          icon="Truck"
          label={getDeliveryRequestStatusLabel(request.status)}
          status={getDeliveryRequestStatusTone(request.status)}
        />
      }
    >
      <View className="gap-2 border-y border-border py-3">
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
          <ShareLinkActionButton
            destructive={option.status === "cancelled"}
            disabled={isUpdating}
            icon={option.status === "cancelled" ? "XCircle" : "Truck"}
            isLoading={activeStatus === option.status}
            key={option.status}
            label={option.label}
            loadingLabel="Updating"
            onPress={() =>
              onUpdateStatus(option.status as DeliveryRequestStatusUpdate)
            }
          />
        ))}
      </View>
    </ShareLinkRecordRow>
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
    <ShareLinkRecordRow
      detail={link.url}
      meta={`Created ${formatOrderTime(link.createdAt)} · ${formatCreatorLabel(
        link.createdByUserId,
      )}`}
      title={link.product.name}
      trailing={
        <StatusBadge
          icon={link.active ? "CircleCheck" : "Ban"}
          label={link.active ? "Active" : "Inactive"}
          tone={link.active ? "success" : "muted"}
        />
      }
    >
      <View className="flex-row gap-3">
        <ShareLinkMetricTile
          icon="Eye"
          label="Views"
          value={String(link.viewCount)}
        />
        <ShareLinkMetricTile
          icon="ReceiptText"
          label="Orders"
          value={String(link.orderCount)}
        />
      </View>

      <Text className="text-xs leading-4 text-muted-foreground">
        Last activity: {formatLinkTime(link.lastActivityAt)}
      </Text>

      <View className="gap-3">
        <View className="flex-row gap-3">
          <ShareLinkActionButton icon="Share" label="Share" onPress={onShare} />
          <ShareLinkActionButton
            icon={isCopied ? "ClipboardCheck" : "ClipboardList"}
            label={isCopied ? "Link copied" : "Copy link"}
            onPress={onCopy}
          />
        </View>
        {link.active ? (
          <ShareLinkActionButton
            destructive
            disabled={isUpdating}
            icon="Ban"
            isLoading={isDeactivating}
            label="Deactivate"
            loadingLabel="Deactivating"
            onPress={onDeactivate}
          />
        ) : null}
      </View>
    </ShareLinkRecordRow>
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
    <ShareLinkRecordRow
      detail={link.url}
      meta={`Created ${formatOrderTime(link.createdAt)} · ${formatCreatorLabel()}`}
      title={link.productName}
      trailing={
        <StatusBadge
          icon={isActive ? "CircleCheck" : "Ban"}
          label={isActive ? "Active" : "Inactive"}
          tone={isActive ? "success" : "muted"}
        />
      }
    >
      <Text className="text-xs leading-4 text-muted-foreground">
        Last activity: {formatLocalLinkActivity(link)}
      </Text>

      <View className="flex-row gap-3">
        <ShareLinkMetricTile
          icon="Eye"
          label="Views"
          value={String(link.views)}
        />
        <ShareLinkMetricTile
          icon="ReceiptText"
          label="Orders"
          value={String(link.orders)}
        />
      </View>

      <View className="gap-3">
        <View className="flex-row gap-3">
          <ShareLinkActionButton
            icon="Share"
            label="Share link"
            onPress={onShare}
          />
          <ShareLinkActionButton
            icon={isCopied ? "ClipboardCheck" : "ClipboardList"}
            label={isCopied ? "Link copied" : "Copy link"}
            onPress={onCopy}
          />
        </View>
        {isActive ? (
          <ShareLinkActionButton
            destructive
            icon="Ban"
            label="Deactivate"
            onPress={onDeactivate}
          />
        ) : null}
      </View>
    </ShareLinkRecordRow>
  )
}

export function ProductShareContent({
  onComplete,
  presentation = "sheet",
}: ProductShareContentProps) {
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

  const contentClassName =
    presentation === "screen" ? "gap-5 px-4 pb-6" : "gap-5 px-5 pb-6"

  const content = (
    <View className={contentClassName}>
      <View className="gap-2">
        <Text className="text-xl font-bold text-foreground">Product links</Text>
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
        <EmptyState
          icon="Warehouse"
          message="Create at least one item before generating a product link."
          title="Add inventory first"
        />
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
            leadingIcon="Search"
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
            <EmptyState
              icon="Search"
              message="Adjust the product search to generate a link."
              title="No products found"
            />
          )}
        </View>
      )}

      <ActionButton
        disabled={
          !selectedProduct || createProductionShareLinkMutation.isPending
        }
        isLoading={createProductionShareLinkMutation.isPending}
        loadingLabel="Generating production link"
        onPress={generateLink}
      >
        {!isOfflineMode && selectedProduct?.remoteId
          ? "Generate production link"
          : "Generate and share link"}
      </ActionButton>
      {!isOfflineMode && selectedProduct && !selectedProduct.remoteId ? (
        <StatusBanner
          icon="Clock"
          message="This product will use the local link flow until product setup has synced to production."
          title="Local link fallback"
          tone="warning"
        />
      ) : null}
      {createProductionShareLinkMutation.isError ? (
        <StatusBanner
          icon="TriangleAlert"
          message={createProductionShareLinkMutation.error.message}
          title="Link was not generated"
          tone="destructive"
        />
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
                onCopy={() => copyGeneratedLink(`local:${link.id}`, link.url)}
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
                Showing first {visibleShareLinks.length} of {shareLinks.length}{" "}
                generated links.
              </Text>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon="Share"
            message="Generated product links will appear here with views, orders, and deactivation controls."
            title="No generated links yet"
          />
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
              <Text className="text-xs font-bold text-primary">Refresh</Text>
            </Pressable>
          ) : null}
        </View>

        {isOfflineMode ? (
          <StatusBanner
            icon="Clock"
            message="Production link analytics will refresh when this device is back online."
            title="Analytics offline"
            tone="warning"
          />
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
              <ShareLinkAnalyticsPanel analytics={productionLinkAnalytics} />
            ) : productionLinkAnalyticsQuery.isFetching ? (
              <StatusBanner
                icon="Clock"
                message="Checking detailed generated-link analytics."
                title="Refreshing analytics"
                tone="muted"
              />
            ) : productionLinkAnalyticsQuery.isError ? (
              <StatusBanner
                icon="TriangleAlert"
                message="Detailed generated-link analytics are unavailable for this session."
                title="Analytics unavailable"
                tone="warning"
              />
            ) : null}
            {visibleProductionLinks.map((link) => (
              <ProductionShareLinkRow
                isCopied={copiedShareLinkKey === `production:${link.id}`}
                isDeactivating={deactivatingProductionShareLinkId === link.id}
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
          <StatusBanner
            icon="Clock"
            message="Checking production for generated product links."
            title="Refreshing links"
            tone="muted"
          />
        ) : productionLinksQuery.isError ? (
          <StatusBanner
            icon="TriangleAlert"
            message="Production link analytics are unavailable for this session."
            title="Links unavailable"
            tone="warning"
          />
        ) : (
          <EmptyState
            icon="Globe"
            message="Synced generated links will appear here with production views and order counts."
            title="No production links yet"
          />
        )}
        {deactivateProductionShareLinkMutation.isError ? (
          <StatusBanner
            icon="TriangleAlert"
            message={deactivateProductionShareLinkMutation.error.message}
            title="Link was not deactivated"
            tone="destructive"
          />
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
              <Text className="text-xs font-bold text-primary">Refresh</Text>
            </Pressable>
          ) : null}
        </View>

        {isOfflineMode ? (
          <StatusBanner
            icon="Clock"
            message="Link orders will refresh when this device is back online."
            title="Orders offline"
            tone="warning"
          />
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
                  orderFollowUps[order.id] ?? defaultSharedLinkFollowUpSelection
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
                onCancel={() => updateOrderRequestStatus(order.id, "cancelled")}
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
          <StatusBanner
            icon="Clock"
            message="Checking production for new link orders."
            title="Refreshing orders"
            tone="muted"
          />
        ) : orderRequestsQuery.isError ? (
          <StatusBanner
            icon="TriangleAlert"
            message="Production link orders are unavailable for this session."
            title="Orders unavailable"
            tone="warning"
          />
        ) : (
          <EmptyState
            icon="ReceiptText"
            message="No pending customer requests from shared links yet."
            title="No pending link orders"
          />
        )}
        {updateOrderRequestStatusMutation.isError ? (
          <StatusBanner
            icon="TriangleAlert"
            message={updateOrderRequestStatusMutation.error.message}
            title="Order follow-up failed"
            tone="destructive"
          />
        ) : null}
        {createDeliveryRequestMutation.isError ? (
          <StatusBanner
            icon="TriangleAlert"
            message={createDeliveryRequestMutation.error.message}
            title="Delivery request failed"
            tone="destructive"
          />
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
              <Text className="text-xs font-bold text-primary">Refresh</Text>
            </Pressable>
          ) : null}
        </View>

        {isOfflineMode ? (
          <StatusBanner
            icon="Clock"
            message="Delivery requests will refresh when this device is back online."
            title="Delivery offline"
            tone="warning"
          />
        ) : deliveryRequests.length > 0 ? (
          <>
            {visibleDeliveryRequests.map((request) => (
              <DeliveryRequestRow
                activeStatus={
                  deliveryRequestStatusAction?.deliveryRequestId === request.id
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
          <StatusBanner
            icon="Clock"
            message="Checking production for delivery requests."
            title="Refreshing delivery"
            tone="muted"
          />
        ) : deliveryRequestsQuery.isError ? (
          <StatusBanner
            icon="TriangleAlert"
            message="Delivery requests are unavailable for this session."
            title="Delivery unavailable"
            tone="warning"
          />
        ) : (
          <EmptyState
            icon="Truck"
            message="Delivery requests created from shared-link orders will appear here."
            title="No delivery requests yet"
          />
        )}
        {updateDeliveryRequestStatusMutation.isError ? (
          <StatusBanner
            icon="TriangleAlert"
            message={updateDeliveryRequestStatusMutation.error.message}
            title="Delivery update failed"
            tone="destructive"
          />
        ) : null}
      </View>

      <ActionButton onPress={onComplete} variant="outline">
        Done
      </ActionButton>
    </View>
  )

  if (presentation === "screen") {
    return (
      <KeyboardAwareScrollView
        className="flex-1"
        bottomOffset={320}
        contentContainerStyle={{ paddingBottom: 240 }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {content}
      </KeyboardAwareScrollView>
    )
  }

  return (
    <BottomSheetKeyboardAwareScrollView
      bottomOffset={320}
      contentContainerStyle={{ paddingBottom: 240 }}
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </BottomSheetKeyboardAwareScrollView>
  )
}

export const ProductShareSheet = forwardRef<
  BottomSheetModal,
  ProductShareSheetProps
>((props, ref) => {
  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["88%"]}
      title="Share product"
    >
      <ProductShareContent {...props} presentation="sheet" />
    </Modal>
  )
})

ProductShareSheet.displayName = "ProductShareSheet"
