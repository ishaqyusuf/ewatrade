import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { QuantityStepper } from "@/components/mobile/quantity-stepper"
import {
  SecondaryOperationalRow,
  SecondarySheetHeader,
} from "@/components/mobile/secondary-operations"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { isSalesRepRole } from "@/lib/mobile-roles"
import { parseWholeQuantity } from "@/lib/quantity"
import { cn } from "@/lib/utils"
import { useRetailOpsStore } from "@/store/retailOpsStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatMoney } from "@ewatrade/utils"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as ImagePicker from "expo-image-picker"
import { useMemo, useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

type ServiceItem = RouterOutputs["retailOps"]["dryCleaningServiceItems"][number]
type ServiceOrder =
  RouterOutputs["retailOps"]["dryCleaningServiceOrders"][number]
type ServiceOrderStatus = ServiceOrder["status"]
type PaymentStatus = ServiceOrder["paymentStatus"]

type ServiceOption = {
  detail: string
  id: string
  priceMinor: number
  serviceItemId: string
  title: string
  variantId?: string
}

type EvidenceCapture = {
  id: string
  label: string
  type: "photo" | "video"
  uri: string
}

const paymentOptions: Array<{
  label: string
  status: PaymentStatus
}> = [
  { label: "Paid", status: "paid" },
  { label: "After service", status: "pay_on_collection" },
  { label: "On delivery", status: "pay_on_delivery" },
  { label: "Partial", status: "partial" },
]

function parseCurrencyMinor(value: string) {
  const amount = Number(value.replace(/[^\d.]/g, ""))

  if (!Number.isFinite(amount) || amount <= 0) return null

  return Math.round(amount * 100)
}

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

function formatDue(value: Date | string | null | undefined) {
  if (!value) return "No due date"

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return "No due date"

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
}

function getStatusLabel(status: ServiceOrderStatus) {
  if (status === "delivery_pending") return "Delivery"
  if (status === "in_progress") return "In progress"
  if (status === "pickup_pending") return "Pickup"

  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getStatusTone(status: ServiceOrderStatus) {
  if (status === "completed") return "success"
  if (status === "delayed" || status === "cancelled") return "warning"
  if (status === "ready") return "primary"

  return "muted"
}

function getPaymentLabel(status: PaymentStatus) {
  if (status === "pay_on_collection") return "Pay after service"
  if (status === "pay_on_delivery") return "Pay on delivery"

  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getNextStatus(status: ServiceOrderStatus): ServiceOrderStatus | null {
  if (status === "received") return "in_progress"
  if (status === "in_progress") return "ready"
  if (status === "ready") return "completed"
  if (status === "delayed") return "in_progress"

  return null
}

function getCapturedEvidenceDetail(uri: string) {
  return uri.split("/").filter(Boolean).at(-1) ?? uri
}

function toServiceOptions(serviceItems: ServiceItem[]): ServiceOption[] {
  return serviceItems.flatMap((item) => {
    if (item.variants.length > 0) {
      return item.variants.map((variant) => ({
        detail: `${item.name} - ${formatMoney(variant.priceMinor, "NGN")}`,
        id: `${item.id}:${variant.id}`,
        priceMinor: variant.priceMinor,
        serviceItemId: item.id,
        title: variant.name,
        variantId: variant.id,
      }))
    }

    return [
      {
        detail: formatMoney(item.priceMinor, "NGN"),
        id: item.id,
        priceMinor: item.priceMinor,
        serviceItemId: item.id,
        title: item.name,
      },
    ]
  })
}

function OrderStatusAction({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      className="min-h-10 flex-row items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 active:bg-primary/20"
      haptic
      onPress={onPress}
      transition
    >
      <Icon className="size-sm text-primary" name="CheckCircle2" />
      <Text className="text-xs font-bold text-primary">{label}</Text>
    </Pressable>
  )
}

export function ServiceOrdersContent() {
  const trpc = useTRPC()
  const { profile } = useAuthContext()
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
  const isSalesRep = isSalesRepRole(profile?.role)
  const [serviceName, setServiceName] = useState("")
  const [standardPrice, setStandardPrice] = useState("")
  const [smallPrice, setSmallPrice] = useState("")
  const [expressPercent, setExpressPercent] = useState("25")
  const [selectedOptionId, setSelectedOptionId] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [dueInDays, setDueInDays] = useState("2")
  const [evidenceUrl, setEvidenceUrl] = useState("")
  const [capturedEvidence, setCapturedEvidence] = useState<EvidenceCapture[]>(
    [],
  )
  const [capturingEvidenceType, setCapturingEvidenceType] = useState<
    "photo" | "video" | null
  >(null)
  const [notes, setNotes] = useState("")
  const [paymentStatus, setPaymentStatus] =
    useState<PaymentStatus>("pay_on_collection")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const canUseProduction = !isOfflineMode
  const serviceItemsQuery = useQuery(
    trpc.retailOps.dryCleaningServiceItems.queryOptions(
      { includeArchived: false },
      {
        enabled: canUseProduction,
        retry: false,
      },
    ),
  )
  const settingsQuery = useQuery(
    trpc.retailOps.dryCleaningSettings.queryOptions(
      {},
      {
        enabled: canUseProduction,
        retry: false,
      },
    ),
  )
  const ordersQuery = useQuery(
    trpc.retailOps.dryCleaningServiceOrders.queryOptions(
      { limit: 25 },
      {
        enabled: canUseProduction,
        retry: false,
      },
    ),
  )
  const createServiceItemMutation = useMutation(
    trpc.retailOps.createDryCleaningServiceItem.mutationOptions({
      onError: (error) => setSubmitError(error.message),
      onSuccess: () => {
        setServiceName("")
        setStandardPrice("")
        setSmallPrice("")
        setSubmitError(null)
        void serviceItemsQuery.refetch()
      },
    }),
  )
  const updateSettingsMutation = useMutation(
    trpc.retailOps.updateDryCleaningSettings.mutationOptions({
      onError: (error) => setSubmitError(error.message),
      onSuccess: () => {
        setSubmitError(null)
        void settingsQuery.refetch()
      },
    }),
  )
  const createOrderMutation = useMutation(
    trpc.retailOps.createDryCleaningServiceOrder.mutationOptions({
      onError: (error) => setSubmitError(error.message),
      onSuccess: () => {
        setCustomerName("")
        setCustomerPhone("")
        setCustomerEmail("")
        setEvidenceUrl("")
        setCapturedEvidence([])
        setNotes("")
        setQuantity("1")
        setSubmitError(null)
        void ordersQuery.refetch()
      },
    }),
  )
  const updateOrderStatusMutation = useMutation(
    trpc.retailOps.updateDryCleaningServiceOrderStatus.mutationOptions({
      onError: (error) => setSubmitError(error.message),
      onSuccess: () => {
        setSubmitError(null)
        void ordersQuery.refetch()
      },
    }),
  )
  const serviceItems = (serviceItemsQuery.data ?? []) as ServiceItem[]
  const serviceOptions = useMemo(
    () => toServiceOptions(serviceItems),
    [serviceItems],
  )
  const orders = (ordersQuery.data ?? []) as ServiceOrder[]
  const selectedOption =
    serviceOptions.find((option) => option.id === selectedOptionId) ??
    serviceOptions[0] ??
    null
  const selectedQuantity = parseWholeQuantity(quantity) || 1
  const orderTotalMinor = selectedOption
    ? selectedOption.priceMinor * selectedQuantity
    : 0
  const currentExpressPercent = settingsQuery.data?.expressSurchargePercent ?? 0
  const unsupportedStoreMessage =
    serviceItemsQuery.error?.message ??
    ordersQuery.error?.message ??
    settingsQuery.error?.message

  const createService = () => {
    const priceMinor = parseCurrencyMinor(standardPrice)
    const serviceNameValue = serviceName.trim()

    if (!priceMinor || !serviceNameValue) {
      setSubmitError("Enter a service name and standard price.")
      return
    }

    const smallPriceMinor =
      parseCurrencyMinor(smallPrice) ?? Math.round(priceMinor * 0.8)

    createServiceItemMutation.mutate({
      category: "Dry cleaning",
      name: serviceNameValue,
      priceMinor,
      variants: [
        {
          name: "SM",
          priceMinor: smallPriceMinor,
        },
        {
          name: "LG",
          priceMinor,
        },
      ],
    })
  }

  const updateExpressSettings = () => {
    const value = Number(expressPercent.replace(/[^\d]/g, ""))

    if (!Number.isFinite(value) || value < 0) {
      setSubmitError("Enter a valid express percentage.")
      return
    }

    updateSettingsMutation.mutate({
      expressSurchargePercent: Math.min(value, 500),
    })
  }

  const captureEvidence = async (type: "photo" | "video") => {
    setSubmitError(null)
    setCapturingEvidenceType(type)

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync()

      if (!permission.granted) {
        setSubmitError("Allow camera access to snap or record intake evidence.")
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: type === "photo",
        mediaTypes: [type === "photo" ? "images" : "videos"],
        quality: type === "photo" ? 0.75 : 0.6,
        videoMaxDuration: type === "video" ? 20 : undefined,
      })

      if (result.canceled) return

      const asset = result.assets[0]

      if (!asset?.uri) {
        setSubmitError("The camera did not return an evidence file.")
        return
      }

      setCapturedEvidence((current) =>
        [
          ...current,
          {
            id: `${type}-${Date.now()}-${current.length}`,
            label: type === "photo" ? "Intake photo" : "Intake video",
            type,
            uri: asset.uri,
          },
        ].slice(-6),
      )
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Could not capture intake evidence.",
      )
    } finally {
      setCapturingEvidenceType(null)
    }
  }

  const createOrder = () => {
    if (!selectedOption) {
      setSubmitError("Add or select a service first.")
      return
    }

    const customerNameValue = customerName.trim()
    if (!customerNameValue) {
      setSubmitError("Enter the customer name.")
      return
    }

    const evidence = [
      ...capturedEvidence.map((item) => ({
        label: item.label,
        url: item.uri,
      })),
      ...(evidenceUrl.trim()
        ? [
            {
              label: "Intake evidence link",
              url: evidenceUrl.trim(),
            },
          ]
        : []),
    ]
    const dueDays = Number(dueInDays.replace(/[^\d]/g, ""))

    createOrderMutation.mutate({
      customer: {
        email: customerEmail.trim() || undefined,
        name: customerNameValue,
        phone: customerPhone.trim() || undefined,
      },
      dueAt: Number.isFinite(dueDays) ? addDays(dueDays) : undefined,
      evidence,
      lines: [
        {
          quantity: selectedQuantity,
          serviceItemId: selectedOption.serviceItemId,
          unitPriceMinor: selectedOption.priceMinor,
          variantId: selectedOption.variantId,
        },
      ],
      notes: notes.trim() || undefined,
      paymentStatus,
    })
  }

  const updateOrderStatus = (
    order: ServiceOrder,
    status: ServiceOrderStatus,
  ) => {
    updateOrderStatusMutation.mutate({
      note: `Updated from mobile by ${profile?.name ?? "staff"}.`,
      notifyCustomer: false,
      orderId: order.id,
      status,
    })
  }

  return (
    <KeyboardAwareScrollView
      className="flex-1"
      contentContainerClassName="gap-5 px-4 pb-10"
      disableScrollOnKeyboardHide
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      <SecondarySheetHeader
        description="Set up dry-cleaning services, receive customer items, and update due work from the app."
        icon="ClipboardList"
        title="Service orders"
      />

      {isOfflineMode ? (
        <StatusBanner
          icon="Wind"
          message="Dry-cleaning service orders need a live connection in this first mobile pass. Product sales still keep the existing offline queue."
          title="Offline mode"
          tone="warning"
        />
      ) : null}

      {unsupportedStoreMessage ? (
        <StatusBanner
          icon="TriangleAlert"
          message={unsupportedStoreMessage}
          title="Service workspace unavailable"
          tone="warning"
        />
      ) : null}

      {submitError ? (
        <StatusBanner
          icon="TriangleAlert"
          message={submitError}
          title="Service operation failed"
          tone="destructive"
        />
      ) : null}

      {!isSalesRep ? (
        <View className="gap-4 rounded-2xl bg-muted/40 p-4">
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="font-extrabold text-foreground">
                Service setup
              </Text>
              <Text className="text-xs leading-4 text-muted-foreground">
                New services get SM and LG variants for quick intake.
              </Text>
            </View>
            <StatusBadge
              label={`${currentExpressPercent}% express`}
              tone="primary"
            />
          </View>

          <FormField
            autoCapitalize="words"
            label="Service name"
            leadingIcon="ClipboardList"
            onChangeText={setServiceName}
            placeholder="Enter service name"
            value={serviceName}
          />
          <View className="flex-row gap-3">
            <View className="min-w-0 flex-1">
              <FormField
                inputMode="decimal"
                keyboardType="decimal-pad"
                label="SM price"
                onChangeText={setSmallPrice}
                placeholder="Enter small price"
                value={smallPrice}
              />
            </View>
            <View className="min-w-0 flex-1">
              <FormField
                inputMode="decimal"
                keyboardType="decimal-pad"
                label="LG price"
                onChangeText={setStandardPrice}
                placeholder="Enter standard price"
                value={standardPrice}
              />
            </View>
          </View>
          <ActionButton
            disabled={!canUseProduction}
            icon="Plus"
            isLoading={createServiceItemMutation.isPending}
            loadingLabel="Adding service"
            onPress={createService}
          >
            Add service
          </ActionButton>

          <View className="border-t border-border pt-4">
            <View className="flex-row items-end gap-3">
              <View className="min-w-0 flex-1">
                <FormField
                  inputMode="numeric"
                  keyboardType="number-pad"
                  label="Express surcharge"
                  onChangeText={setExpressPercent}
                  placeholder="Enter percentage"
                  trailingIcon="Zap"
                  value={expressPercent}
                />
              </View>
              <View className="w-28">
                <ActionButton
                  disabled={!canUseProduction}
                  isLoading={updateSettingsMutation.isPending}
                  loadingLabel="Saving"
                  onPress={updateExpressSettings}
                  variant="outline"
                >
                  Save
                </ActionButton>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      <View className="gap-4 rounded-2xl bg-muted/40 p-4">
        <View className="gap-1">
          <Text className="font-extrabold text-foreground">New intake</Text>
          <Text className="text-xs leading-4 text-muted-foreground">
            Select the variant, quantity, customer, payment state, and due date.
          </Text>
        </View>

        {serviceOptions.length > 0 ? (
          <View className="gap-3">
            {serviceOptions.slice(0, 8).map((option) => (
              <SecondaryOperationalRow
                detail={option.detail}
                icon="ReceiptText"
                key={option.id}
                onPress={() => setSelectedOptionId(option.id)}
                selected={selectedOption?.id === option.id}
                title={option.title}
                trailing={
                  selectedOption?.id === option.id ? (
                    <StatusBadge label="Selected" tone="primary" />
                  ) : null
                }
              />
            ))}
          </View>
        ) : (
          <EmptyState
            icon="ClipboardList"
            message={
              isSalesRep
                ? "Ask an admin to add dry-cleaning services first."
                : "Add a service above before receiving customer items."
            }
            title="No services yet"
          />
        )}

        <QuantityStepper
          helper={selectedOption ? formatMoney(orderTotalMinor, "NGN") : ""}
          onChangeText={setQuantity}
          value={quantity}
        />

        <FormField
          autoCapitalize="words"
          label="Customer name"
          leadingIcon="User"
          onChangeText={setCustomerName}
          placeholder="Enter customer name"
          value={customerName}
        />
        <View className="flex-row gap-3">
          <View className="min-w-0 flex-1">
            <FormField
              inputMode="tel"
              keyboardType="phone-pad"
              label="Phone"
              leadingIcon="Phone"
              onChangeText={setCustomerPhone}
              placeholder="Enter phone"
              value={customerPhone}
            />
          </View>
          <View className="min-w-0 flex-1">
            <FormField
              inputMode="numeric"
              keyboardType="number-pad"
              label="Due days"
              leadingIcon="Calendar"
              onChangeText={setDueInDays}
              placeholder="Enter days"
              value={dueInDays}
            />
          </View>
        </View>
        <FormField
          autoCapitalize="none"
          inputMode="email"
          keyboardType="email-address"
          label="Email"
          leadingIcon="Mail"
          onChangeText={setCustomerEmail}
          placeholder="Enter email address"
          value={customerEmail}
        />
        <FormField
          autoCapitalize="none"
          inputMode="url"
          keyboardType="url"
          label="Evidence link fallback"
          leadingIcon="Camera"
          onChangeText={setEvidenceUrl}
          placeholder="Enter photo or video link"
          value={evidenceUrl}
        />
        <View className="gap-3 rounded-2xl bg-card p-4">
          <View className="gap-1">
            <Text className="font-extrabold text-foreground">Intake media</Text>
            <Text className="text-xs leading-4 text-muted-foreground">
              Snap the clothes or record a short bag video before creating the
              order.
            </Text>
          </View>
          <View className="flex-row gap-3">
            <View className="min-w-0 flex-1">
              <ActionButton
                icon="Camera"
                isLoading={capturingEvidenceType === "photo"}
                loadingLabel="Opening"
                onPress={() => void captureEvidence("photo")}
                variant="outline"
              >
                Snap photo
              </ActionButton>
            </View>
            <View className="min-w-0 flex-1">
              <ActionButton
                icon="Camera"
                isLoading={capturingEvidenceType === "video"}
                loadingLabel="Opening"
                onPress={() => void captureEvidence("video")}
                variant="outline"
              >
                Record video
              </ActionButton>
            </View>
          </View>
          {capturedEvidence.length > 0 ? (
            <View className="gap-2">
              {capturedEvidence.map((item) => (
                <SecondaryOperationalRow
                  detail={getCapturedEvidenceDetail(item.uri)}
                  icon="Camera"
                  key={item.id}
                  metadata={
                    item.type === "photo" ? "Photo evidence" : "Video evidence"
                  }
                  title={item.label}
                  trailing={
                    <Pressable
                      accessibilityLabel={`Remove ${item.label.toLowerCase()}`}
                      className="h-9 w-9 items-center justify-center rounded-full bg-muted active:bg-accent"
                      haptic
                      onPress={() =>
                        setCapturedEvidence((current) =>
                          current.filter((entry) => entry.id !== item.id),
                        )
                      }
                      transition
                    >
                      <Icon
                        className="size-sm text-muted-foreground"
                        name="X"
                      />
                    </Pressable>
                  }
                />
              ))}
            </View>
          ) : null}
        </View>
        <FormField
          label="Notes"
          multiline
          onChangeText={setNotes}
          placeholder="Enter intake notes"
          value={notes}
        />

        <View className="flex-row flex-wrap gap-2">
          {paymentOptions.map((option) => (
            <Pressable
              className={cn(
                "min-h-10 rounded-full px-4 py-2 active:opacity-90",
                paymentStatus === option.status ? "bg-primary" : "bg-card",
              )}
              haptic
              key={option.status}
              onPress={() => setPaymentStatus(option.status)}
              transition
            >
              <Text
                className={cn(
                  "text-xs font-bold",
                  paymentStatus === option.status
                    ? "text-primary-foreground"
                    : "text-foreground",
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <ActionButton
          disabled={!canUseProduction || serviceOptions.length === 0}
          icon="ReceiptText"
          isLoading={createOrderMutation.isPending}
          loadingLabel="Creating order"
          onPress={createOrder}
        >
          Create order
        </ActionButton>
      </View>

      <View className="gap-3">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="font-extrabold text-foreground">Due work</Text>
          <StatusBadge label={`${orders.length} orders`} tone="muted" />
        </View>

        {orders.length > 0 ? (
          orders.slice(0, 10).map((order) => {
            const nextStatus = getNextStatus(order.status)

            return (
              <SecondaryOperationalRow
                detail={`${getPaymentLabel(order.paymentStatus)} - due ${formatDue(
                  order.dueAt,
                )}`}
                icon="ClipboardCheck"
                key={order.id}
                metadata={order.customer.phone ?? order.customer.email ?? ""}
                title={order.customer.name}
                trailing={
                  <StatusBadge
                    label={getStatusLabel(order.status)}
                    tone={getStatusTone(order.status)}
                  />
                }
              >
                {nextStatus ? (
                  <OrderStatusAction
                    label={`Mark ${getStatusLabel(nextStatus)}`}
                    onPress={() => updateOrderStatus(order, nextStatus)}
                  />
                ) : null}
                {order.status !== "completed" && order.status !== "delayed" ? (
                  <OrderStatusAction
                    label="Delay"
                    onPress={() => updateOrderStatus(order, "delayed")}
                  />
                ) : null}
              </SecondaryOperationalRow>
            )
          })
        ) : (
          <EmptyState
            icon="ClipboardCheck"
            message="Created service orders and public requests will appear here."
            title="No service orders yet"
          />
        )}
      </View>
    </KeyboardAwareScrollView>
  )
}
