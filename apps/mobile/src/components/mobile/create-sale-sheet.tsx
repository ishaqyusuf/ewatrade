import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import {
  type CommerceCustomer,
  buildCommerceCustomers,
} from "@/components/mobile/commerce"
import {
  CreateSaleCustomerSheet,
  type SaleCustomerDraft,
} from "@/components/mobile/create-sale-customer-sheet"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import {
  saleLineTotalMinor,
  salePaymentSummary,
} from "@/components/mobile/sale-checkout-model"
import {
  SaleSegmentOption,
  SaleTotalSummary,
} from "@/components/mobile/sale-flow"
import {
  CompactSaleItemPicker,
  FullScreenSaleItemPicker,
  SaleItemAvatar,
  type SaleOfferingChoice,
} from "@/components/mobile/sale-item-picker"
import {
  commitSaleItemPickerDraft,
  getSaleItemPickerPresentation,
  getSelectableSaleItemChoices,
  shouldFetchNextSaleItemPickerPage,
} from "@/components/mobile/sale-item-picker-model"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import {
  LIST_PAGE_SIZE,
  shouldFetchNextListPage,
  shouldShowListSearch,
} from "@/lib/list-pagination"
import { useOfflineCommandStore } from "@/store/offlineCommandStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import {
  formatMinorMoney,
  getSaleOfferingDisabledReasons,
  minorToMajorInput,
} from "@ewatrade/utils"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useDeferredValue, useMemo, useRef, useState } from "react"
import { FlatList, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type CatalogItem = RouterOutputs["catalog"]["listItems"][number]
type PaymentMethod = RouterInputs["orders"]["recordPayment"]["method"]
type SaleStep = "customer" | "items" | "review"

type SelectedCustomer = {
  email?: string
  id: string
  name: string
  phone?: string
}

const PAYMENT_METHODS: Array<[PaymentMethod, string]> = [
  ["cash", "Cash"],
  ["bank_transfer", "Transfer"],
  ["pos", "POS"],
]

function flatten(
  items: CatalogItem[],
  storeId: string | undefined,
  kind?: "service",
): SaleOfferingChoice[] {
  if (!storeId) return []

  const choices = items.flatMap((item) =>
    item.variants.flatMap((variant) =>
      item.kind === kind || !kind
        ? variant.offerings.flatMap((offering) => {
            if (
              offering.status !== "active" ||
              offering.pricingPolicy !== "fixed" ||
              !offering.stores.some(
                (row) => row.storeId === storeId && row.isAvailable,
              )
            )
              return []
            const inventoryUnit =
              item.product?.currentUnitConfiguration?.units.find(
                (unit) => unit.id === offering.productUnit?.inventoryUnitId,
              )
            const balance = item.product?.stockBalances.find(
              (row) =>
                row.storeId === storeId &&
                row.variantId === variant.id &&
                (inventoryUnit?.stockBehavior === "packaged_stock"
                  ? row.kind === "packaged_stock" &&
                    row.inventoryUnitId ===
                      offering.productUnit?.inventoryUnitId
                  : row.kind === "shared_pool"),
            )
            const disabledReasons = getSaleOfferingDisabledReasons({
              fixedPriceMinor: offering.fixedPriceMinor,
              kind:
                offering.kind === "product_unit" ? "product_unit" : "service",
              onHandQuantity: balance?.onHandQuantity,
              reservedQuantity: balance?.reservedQuantity,
            })
            return [
              {
                balanceRevision: balance?.revision,
                configurationVersionId:
                  item.product?.currentUnitConfiguration?.id,
                currencyCode: offering.currencyCode,
                displayName:
                  item.variants.length > 1
                    ? `${item.name} · ${variant.name}`
                    : item.name,
                disabledReason: disabledReasons.join(" · ") || undefined,
                fixedPriceMinor: offering.fixedPriceMinor,
                id: offering.id,
                imageUrl: variant.imageUrl ?? item.imageUrl,
                itemName: item.name,
                kind:
                  offering.kind === "product_unit"
                    ? ("product_unit" as const)
                    : ("service" as const),
                offeringName: offering.name,
              },
            ]
          })
        : [],
    ),
  )

  return getSelectableSaleItemChoices(choices)
}

type OfferingRow = SaleOfferingChoice

function SaleStageHeader({
  current,
  description,
  onBack,
  title,
}: {
  current: number
  description: string
  onBack?: () => void
  title: string
}) {
  return (
    <View className="gap-3 pb-5 pt-1">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-xs font-bold uppercase tracking-[1.4px] text-primary">
            Step {current} of 3
          </Text>
          <Text className="text-xl font-extrabold text-foreground">
            {title}
          </Text>
        </View>
        {onBack ? (
          <Pressable
            accessibilityLabel="Go to previous sale step"
            className="h-11 w-11 items-center justify-center rounded-full bg-muted active:bg-accent"
            haptic
            onPress={onBack}
            transition
          >
            <Icon className="size-sm text-foreground" name="ArrowLeft" />
          </Pressable>
        ) : null}
      </View>
      <Text className="text-sm leading-5 text-muted-foreground">
        {description}
      </Text>
    </View>
  )
}

function SelectedOrderLine({
  offering,
  onQuantityChange,
  onQuantityBlur,
  onQuantityFocus,
  onRemove,
  quantity,
}: {
  offering: OfferingRow
  onQuantityChange: (value: string) => void
  onQuantityBlur: () => void
  onQuantityFocus: () => void
  onRemove: () => void
  quantity?: string
}) {
  const lineTotalMinor = saleLineTotalMinor(offering.fixedPriceMinor, quantity)

  return (
    <View className="border-b border-border py-4">
      <View className="min-h-11 flex-row items-center gap-3">
        <SaleItemAvatar choice={offering} />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-extrabold text-foreground" numberOfLines={1}>
            {offering.displayName}
          </Text>
          <Text
            className="text-xs leading-4 text-muted-foreground"
            numberOfLines={1}
          >
            {offering.offeringName} ·{" "}
            {offering.fixedPriceMinor === null
              ? "Price not set"
              : formatMinorMoney(
                  offering.fixedPriceMinor,
                  offering.currencyCode,
                )}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={`Remove ${offering.displayName} from order`}
          className="h-11 w-11 items-center justify-center rounded-full bg-muted active:bg-accent"
          haptic
          onPress={onRemove}
          transition
        >
          <Icon className="size-sm text-muted-foreground" name="X" />
        </Pressable>
      </View>

      <View className="mt-3 flex-row items-center justify-end gap-3 pl-[56px]">
        <View className="gap-1">
          <Text className="text-[10px] font-bold uppercase tracking-[1px] text-muted-foreground">
            Quantity
          </Text>
          <FormField
            accessibilityLabel={`Quantity for ${offering.displayName}`}
            containerClassName="w-20"
            inputClassName="text-center font-extrabold"
            inputTextAlign="center"
            keyboardType="decimal-pad"
            label="Quantity"
            onBlur={onQuantityBlur}
            onChangeText={onQuantityChange}
            onFocus={onQuantityFocus}
            selectTextOnFocus
            value={quantity}
            variant="auth"
          />
        </View>
        <View className="min-w-[116px] items-end gap-1">
          <Text className="text-[10px] font-bold uppercase tracking-[1px] text-muted-foreground">
            Line total
          </Text>
          <Text className="text-lg font-extrabold text-foreground">
            {lineTotalMinor === null
              ? "—"
              : formatMinorMoney(lineTotalMinor, offering.currencyCode)}
          </Text>
        </View>
      </View>
    </View>
  )
}

function CustomerActionRow({
  description,
  icon,
  onPress,
  title,
}: {
  description: string
  icon: "UserPlus" | "UserX"
  onPress: () => void
  title: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-16 flex-row items-center gap-3 border-b border-border py-4 active:opacity-80"
      haptic
      onPress={onPress}
      transition
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-sm text-primary" name={icon} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground">{description}</Text>
      </View>
      <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
    </Pressable>
  )
}

function CustomerSuggestionRow({
  customer,
  onPress,
}: {
  customer: CommerceCustomer
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-16 flex-row items-center gap-3 border-b border-border py-4 active:opacity-80"
      haptic
      onPress={onPress}
      transition
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Text className="text-xs font-extrabold text-foreground">
          {customer.initials}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{customer.name}</Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {[customer.phone, customer.email].filter(Boolean).join(" · ") ||
            "Recent customer"}
        </Text>
      </View>
      <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
    </Pressable>
  )
}

function customerFromSuggestion(customer: CommerceCustomer): SelectedCustomer {
  return {
    email: customer.email ?? undefined,
    id: customer.id,
    name: customer.name,
    phone: customer.phone ?? undefined,
  }
}

export function CreateSaleContent({
  attendantName: _attendantName,
  itemKind,
  onComplete,
  presentation: _presentation,
}: {
  attendantName?: string
  itemKind?: "service"
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const customerModal = useModal()
  const compactItemModal = useModal()
  const insets = useSafeAreaInsets()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const queueCommand = useOfflineCommandStore((state) => state.queueCommand)
  const orderClientId = useRef(`order-${Crypto.randomUUID()}`)
  const paymentClientId = useRef(`payment-${Crypto.randomUUID()}`)
  const [amountReceived, setAmountReceived] = useState("")
  const [customerDraft, setCustomerDraft] = useState<SaleCustomerDraft>({
    email: "",
    name: "",
    phone: "",
  })
  const [customerDraftError, setCustomerDraftError] = useState<string | null>(
    null,
  )
  const [customerSearch, setCustomerSearch] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [productSearch, setProductSearch] = useState("")
  const [isResolvingPicker, setIsResolvingPicker] = useState(false)
  const [pickerChoiceCount, setPickerChoiceCount] = useState(0)
  const [compactPickerChoices, setCompactPickerChoices] = useState<
    OfferingRow[]
  >([])
  const [pickerDraft, setPickerDraft] = useState<Record<string, OfferingRow>>(
    {},
  )
  const [pickerVisible, setPickerVisible] = useState(false)
  const deferredCustomerSearch = useDeferredValue(customerSearch)
  const deferredProductSearch = useDeferredValue(productSearch)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [selectedOfferings, setSelectedOfferings] = useState<
    Record<string, OfferingRow>
  >({})
  const [focusedQuantityId, setFocusedQuantityId] = useState<string | null>(
    null,
  )
  const [selectedCustomer, setSelectedCustomer] =
    useState<SelectedCustomer | null>(null)
  const [step, setStep] = useState<SaleStep>("items")

  const catalog = useInfiniteQuery(
    trpc.catalog.listItemsPage.infiniteQueryOptions(
      {
        kind: itemKind,
        limit: LIST_PAGE_SIZE,
        query: isOffline ? undefined : deferredProductSearch || undefined,
        status: "active",
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
      },
    ),
  )
  const availability = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, { retry: false }),
  )
  const recentOrders = useInfiniteQuery(
    trpc.orders.listPage.infiniteQueryOptions(
      {
        limit: LIST_PAGE_SIZE,
        query: isOffline ? undefined : deferredCustomerSearch || undefined,
        queryMode: "customer",
      },
      {
        enabled: !isOffline,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
      },
    ),
  )
  const customerCount = useQuery(
    trpc.orders.customerCount.queryOptions(undefined, {
      enabled: !isOffline,
      retry: false,
    }),
  )
  const orderMutation = useMutation(trpc.orders.create.mutationOptions())
  const paymentMutation = useMutation(
    trpc.orders.recordPayment.mutationOptions(),
  )

  const loadedRows = useMemo(
    () =>
      flatten(
        catalog.data?.pages.flatMap((page) => page.items) ?? [],
        availability.data?.storeId,
        itemKind,
      ),
    [availability.data?.storeId, catalog.data?.pages, itemKind],
  )
  const allRows = useMemo(() => {
    const normalizedSearch = productSearch.trim().toLowerCase()
    if (!isOffline || !normalizedSearch) return loadedRows
    return loadedRows.filter((row) =>
      `${row.displayName} ${row.offeringName}`
        .toLowerCase()
        .includes(normalizedSearch),
    )
  }, [isOffline, loadedRows, productSearch])
  const selectedRows = useMemo(
    () =>
      Object.entries(quantities).flatMap(([offeringId, quantity]) => {
        const offering =
          selectedOfferings[offeringId] ??
          allRows.find((entry) => entry.id === offeringId)
        if (!offering || offering.disabledReason) return []
        const totalMinor = saleLineTotalMinor(
          offering.fixedPriceMinor,
          quantity,
        )
        return [{ offering, quantity, totalMinor }]
      }),
    [allRows, quantities, selectedOfferings],
  )
  const selectedChoiceIds = useMemo(
    () => new Set(Object.keys(selectedOfferings)),
    [selectedOfferings],
  )
  const totalMinor = selectedRows.reduce(
    (total, line) => total + (line.totalMinor ?? 0),
    0,
  )
  const currencyCode = selectedRows[0]?.offering.currencyCode ?? "NGN"
  const paymentSummary = salePaymentSummary(totalMinor, amountReceived)
  const loadedCustomers = useMemo(
    () =>
      buildCommerceCustomers(
        recentOrders.data?.pages.flatMap((page) => page.items) ?? [],
      ),
    [recentOrders.data?.pages],
  )
  const customers = useMemo(() => {
    const normalizedSearch = customerSearch.trim().toLowerCase()
    if (!isOffline || !normalizedSearch) return loadedCustomers
    return loadedCustomers.filter((customer) =>
      `${customer.name} ${customer.phone ?? ""} ${customer.email ?? ""}`
        .toLowerCase()
        .includes(normalizedSearch),
    )
  }, [customerSearch, isOffline, loadedCustomers])
  const showCustomerSearch = shouldShowListSearch(
    Math.max(customerCount.data ?? 0, loadedCustomers.length),
  )
  const isSubmitting = orderMutation.isPending || paymentMutation.isPending

  function updateQuantity(offeringId: string, value: string) {
    setQuantities((current) => ({ ...current, [offeringId]: value }))
  }

  function addOffering(offering: OfferingRow) {
    setError(null)
    setSelectedOfferings((selected) => ({
      ...selected,
      [offering.id]: offering,
    }))
    setQuantities((current) => ({
      ...current,
      [offering.id]: current[offering.id] ?? "1",
    }))
  }

  function removeOffering(offeringId: string) {
    setError(null)
    setSelectedOfferings((selected) => {
      const remaining = { ...selected }
      delete remaining[offeringId]
      return remaining
    })
    setQuantities((current) => {
      const remaining = { ...current }
      delete remaining[offeringId]
      return remaining
    })
  }

  async function openItemPicker() {
    setError(null)
    setIsResolvingPicker(true)

    try {
      let pages = catalog.data?.pages ?? []
      let choices = flatten(
        pages.flatMap((page) => page.items),
        availability.data?.storeId,
        itemKind,
      )
      let hasNextPage = Boolean(pages.at(-1)?.nextCursor)

      const attemptedCursors = new Set<string>()
      while (
        shouldFetchNextSaleItemPickerPage({
          attemptedCursors,
          choiceCount: choices.length,
          isOffline,
          nextCursor: pages.at(-1)?.nextCursor,
        })
      ) {
        const cursor = pages.at(-1)?.nextCursor
        if (!cursor) break
        attemptedCursors.add(cursor)

        const result = await catalog.fetchNextPage()
        if (result.isError) throw result.error

        const previousPageCount = pages.length
        pages = result.data?.pages ?? pages
        if (pages.length <= previousPageCount) break

        choices = flatten(
          pages.flatMap((page) => page.items),
          availability.data?.storeId,
          itemKind,
        )
        hasNextPage = Boolean(pages.at(-1)?.nextCursor)
      }

      setPickerChoiceCount(Math.max(choices.length, pages[0]?.totalCount ?? 0))

      const presentation = getSaleItemPickerPresentation({
        choiceCount: choices.length,
        hasUnloadedChoices: hasNextPage,
      })

      if (presentation === "screen") {
        setPickerDraft({ ...selectedOfferings })
        setPickerVisible(true)
      } else {
        setCompactPickerChoices(choices)
        requestAnimationFrame(() => compactItemModal.present())
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not load products or services.",
      )
    } finally {
      setIsResolvingPicker(false)
    }
  }

  function closeFullScreenPicker() {
    setPickerVisible(false)
    setPickerDraft({})
    setProductSearch("")
  }

  function commitFullScreenPicker() {
    const committed = commitSaleItemPickerDraft({
      currentQuantities: quantities,
      draft: pickerDraft,
    })
    setSelectedOfferings(committed.selectedChoices)
    setQuantities(committed.quantities)
    setError(null)
    closeFullScreenPicker()
  }

  function proceedToCustomer() {
    if (selectedRows.length === 0) {
      setError("Select at least one item and enter its quantity.")
      return
    }
    if (selectedRows.some((line) => line.totalMinor === null)) {
      setError("Every selected item needs a valid positive quantity.")
      return
    }
    if (
      new Set(selectedRows.map((line) => line.offering.currencyCode)).size > 1
    ) {
      setError("Selected items must use the same currency.")
      return
    }
    setError(null)
    setFocusedQuantityId(null)
    setStep("customer")
  }

  function selectCustomer(customer: SelectedCustomer | null) {
    setSelectedCustomer(customer)
    setError(null)
    setStep("review")
  }

  function presentCustomerSheet() {
    setCustomerDraft((current) => ({
      ...current,
      name: current.name || customerSearch.trim(),
    }))
    setCustomerDraftError(null)
    customerModal.present()
  }

  function saveCustomerDraft() {
    const name = customerDraft.name.trim()
    const email = customerDraft.email.trim()
    const phone = customerDraft.phone.trim()
    if (!name) {
      setCustomerDraftError("Enter the customer name.")
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setCustomerDraftError("Enter a valid email address.")
      return
    }
    selectCustomer({
      email: email || undefined,
      id: `draft:${name.toLowerCase()}:${phone || email}`,
      name,
      phone: phone || undefined,
    })
    customerModal.dismiss()
  }

  async function refreshOrderQueries() {
    await Promise.all([
      queryClient.invalidateQueries(trpc.orders.list.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.listPage.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.customerCount.queryFilter()),
      queryClient.invalidateQueries(trpc.services.queuePage.queryFilter()),
      queryClient.invalidateQueries(
        trpc.tenant.featureAvailability.queryFilter(),
      ),
    ])
  }

  async function submit() {
    if (paymentSummary.error) {
      setError(paymentSummary.error)
      return
    }
    const lines = selectedRows.flatMap(({ offering, quantity, totalMinor }) =>
      totalMinor === null || offering.fixedPriceMinor === null
        ? []
        : [
            {
              expectedBalanceRevision:
                offering.kind === "product_unit"
                  ? offering.balanceRevision
                  : undefined,
              expectedConfigurationVersionId:
                offering.kind === "product_unit"
                  ? offering.configurationVersionId
                  : undefined,
              expectedFixedPriceMinor: offering.fixedPriceMinor,
              offeringId: offering.id,
              quantity,
            },
          ],
    )
    if (lines.length === 0) {
      setError("Select at least one item and enter its quantity.")
      setStep("items")
      return
    }

    const payload = {
      customerEmail: selectedCustomer?.email,
      customerName: selectedCustomer?.name,
      customerPhone: selectedCustomer?.phone,
      lines,
    }
    setError(null)
    if (isOffline) {
      queueCommand({
        dependencyClientIds: [],
        eventVersion: 1,
        payload: { kind: "commercial_order", ...payload },
      })
      onComplete?.()
      return
    }

    try {
      const order = await orderMutation.mutateAsync({
        clientOrderId: orderClientId.current,
        schemaVersion: 1,
        ...payload,
      })
      if (paymentSummary.receivedMinor > 0) {
        await paymentMutation.mutateAsync({
          amountMinor: paymentSummary.receivedMinor,
          clientPaymentId: paymentClientId.current,
          method: paymentMethod,
          orderId: order.id,
        })
      }
      await refreshOrderQueries()
      onComplete?.()
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not confirm order.",
      )
    }
  }

  const itemsHeader = (
    <View>
      <SaleStageHeader
        current={1}
        description="Build the order one item at a time, then enter the quantity for each selection."
        title={itemKind === "service" ? "New service order" : "New order"}
      />
      {isOffline ? (
        <View className="pb-4">
          <StatusBanner
            icon="Wind"
            message="The order will be provisional until its Offering, price, configuration, and balance snapshots are accepted during sync."
            title="Offline order"
            tone="warning"
          />
        </View>
      ) : null}
      {error ? (
        <View className="pb-4">
          <StatusBanner
            icon="AlertCircle"
            message={error}
            title="Check selected items"
            tone="destructive"
          />
        </View>
      ) : null}
    </View>
  )

  return (
    <View className="flex-1">
      {step === "items" ? (
        <View className="flex-1">
          <FlatList
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: selectedRows.length > 0 ? 132 : 96,
              paddingHorizontal: 16,
            }}
            data={Object.values(selectedOfferings)}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            keyExtractor={(offering) => offering.id}
            ListEmptyComponent={
              <View className="flex-1 justify-center pb-24">
                <EmptyState
                  className="bg-transparent"
                  icon="ReceiptText"
                  message={
                    itemKind === "service"
                      ? "Tap the + button to add a service."
                      : "Tap the + button to add a product or service."
                  }
                  title="No items added yet"
                />
              </View>
            }
            ListHeaderComponent={itemsHeader}
            renderItem={({ item }) => (
              <SelectedOrderLine
                offering={item}
                onQuantityBlur={() =>
                  setFocusedQuantityId((current) =>
                    current === item.id ? null : current,
                  )
                }
                onQuantityChange={(value) => updateQuantity(item.id, value)}
                onQuantityFocus={() => setFocusedQuantityId(item.id)}
                onRemove={() => removeOffering(item.id)}
                quantity={quantities[item.id]}
              />
            )}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
          />

          {focusedQuantityId === null ? (
            <View
              pointerEvents="box-none"
              style={{
                bottom:
                  selectedRows.length > 0 ? 104 : Math.max(insets.bottom, 16),
                position: "absolute",
                right: 16,
                zIndex: 30,
              }}
            >
              <Pressable
                accessibilityLabel={
                  itemKind === "service"
                    ? "Add service"
                    : "Add product or service"
                }
                accessibilityRole="button"
                accessibilityState={{
                  busy: isResolvingPicker,
                  disabled:
                    catalog.isLoading ||
                    availability.isLoading ||
                    isResolvingPicker,
                }}
                className="h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg active:bg-primary/90"
                disabled={
                  catalog.isLoading ||
                  availability.isLoading ||
                  isResolvingPicker
                }
                haptic
                onPress={() => void openItemPicker()}
                testID="sale-add-item-fab"
                transition
              >
                <Icon
                  className="size-base text-primary-foreground"
                  name={isResolvingPicker ? "Loader2" : "Plus"}
                />
              </Pressable>
            </View>
          ) : null}

          {selectedRows.length > 0 ? (
            <BottomSearchFooter
              accessibilityLabel="Order actions"
              onChangeText={() => undefined}
              placeholder=""
              searchVisible={false}
              totalCount={0}
              value=""
            >
              <View className="flex-row items-center gap-3">
                <View className="min-w-[104px] gap-0.5">
                  <Text className="text-[10px] font-bold uppercase tracking-[1px] text-muted-foreground">
                    Total · {selectedRows.length} selected
                  </Text>
                  <Text className="text-xl font-extrabold text-foreground">
                    {formatMinorMoney(totalMinor, currencyCode)}
                  </Text>
                </View>
                <ActionButton
                  className="w-auto flex-1"
                  onPress={proceedToCustomer}
                  trailingIcon="ArrowRight"
                >
                  Proceed
                </ActionButton>
              </View>
            </BottomSearchFooter>
          ) : null}
        </View>
      ) : null}

      {step === "customer" ? (
        <View className="flex-1">
          <FlatList
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: showCustomerSearch ? 104 : 24,
              paddingHorizontal: 16,
            }}
            data={customers}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            keyExtractor={(customer) => customer.id}
            ListEmptyComponent={
              recentOrders.isPending && !isOffline ? (
                <Text className="py-10 text-center text-sm text-muted-foreground">
                  Loading recent customers.
                </Text>
              ) : customerSearch ? (
                <Text className="py-10 text-center text-sm text-muted-foreground">
                  No customer matches this search. Create a customer above to
                  use these details.
                </Text>
              ) : null
            }
            ListHeaderComponent={
              <View>
                <SaleStageHeader
                  current={2}
                  description="Select a recent customer, add a new contact, or continue as a guest."
                  onBack={() => {
                    setError(null)
                    setStep("items")
                  }}
                  title="Select customer"
                />
                {recentOrders.isError ? (
                  <View className="pb-4">
                    <StatusBanner
                      icon="AlertCircle"
                      message="Recent customers could not be loaded. You can still create a customer or continue as a guest."
                      tone="warning"
                    />
                  </View>
                ) : null}
                <CustomerActionRow
                  description="Add name and optional contact details"
                  icon="UserPlus"
                  onPress={presentCustomerSheet}
                  title="Create customer"
                />
                <CustomerActionRow
                  description="Register this sale as a walk-in order"
                  icon="UserX"
                  onPress={() => selectCustomer(null)}
                  title="Skip · Continue as guest"
                />
                <Text className="pb-2 pt-6 text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                  {customerSearch ? "Search results" : "Recent customers"}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <CustomerSuggestionRow
                customer={item}
                onPress={() => selectCustomer(customerFromSuggestion(item))}
              />
            )}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            onEndReached={() => {
              if (
                shouldFetchNextListPage({
                  hasNextPage: Boolean(recentOrders.hasNextPage),
                  isFetchingNextPage: recentOrders.isFetchingNextPage,
                })
              ) {
                void recentOrders.fetchNextPage()
              }
            }}
            onEndReachedThreshold={0.35}
            ListFooterComponent={
              recentOrders.isFetchingNextPage ? (
                <Text className="py-5 text-center text-xs font-semibold text-muted-foreground">
                  Loading more customers…
                </Text>
              ) : null
            }
          />
          {showCustomerSearch ? (
            <BottomSearchFooter
              accessibilityLabel="Search customer, phone, or email"
              onChangeText={setCustomerSearch}
              placeholder="Search customer, phone, or email"
              totalCount={Math.max(
                customerCount.data ?? 0,
                loadedCustomers.length,
              )}
              value={customerSearch}
            />
          ) : null}
        </View>
      ) : null}

      {step === "review" ? (
        <View className="flex-1">
          <KeyboardAwareScrollView
            className="flex-1"
            contentContainerClassName="gap-5 px-4 pb-36"
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            <SaleStageHeader
              current={3}
              description="Check the details, record payment, then confirm the sale."
              onBack={() => {
                setError(null)
                setStep("customer")
              }}
              title="Checkout"
            />
            {error ? (
              <StatusBanner
                icon="AlertCircle"
                message={error}
                title="Could not confirm order"
                tone="destructive"
              />
            ) : null}
            {isOffline ? (
              <StatusBanner
                icon="Wind"
                message="The order can be queued now, but payment is online-only and must be recorded after sync."
                title="Payment not available offline"
                tone="warning"
              />
            ) : null}

            <SaleTotalSummary
              helper={`${selectedRows.length} item${selectedRows.length === 1 ? "" : "s"}`}
              label="Total to collect"
              value={formatMinorMoney(totalMinor, currencyCode)}
            />

            <View>
              <View className="min-h-11 flex-row items-center justify-between gap-3">
                <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                  Sale details
                </Text>
                <Pressable
                  accessibilityLabel="Edit sale items"
                  className="min-h-11 justify-center px-1"
                  haptic
                  onPress={() => setStep("items")}
                >
                  <Text className="text-xs font-bold text-primary">
                    Edit items
                  </Text>
                </Pressable>
              </View>
              {selectedRows.map(
                ({ offering, quantity, totalMinor: lineTotal }) => (
                  <View
                    className="flex-row items-start justify-between gap-3 border-b border-border py-3"
                    key={offering.id}
                  >
                    <View className="min-w-0 flex-1 gap-1">
                      <Text className="font-bold text-foreground">
                        {offering.displayName}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {offering.offeringName} · {quantity} ×{" "}
                        {formatMinorMoney(
                          offering.fixedPriceMinor ?? 0,
                          offering.currencyCode,
                        )}
                      </Text>
                    </View>
                    <Text className="font-extrabold text-foreground">
                      {formatMinorMoney(lineTotal ?? 0, offering.currencyCode)}
                    </Text>
                  </View>
                ),
              )}
              <View className="flex-row items-center gap-3 py-4">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Icon
                    className="size-sm text-muted-foreground"
                    name={selectedCustomer ? "User" : "UserX"}
                  />
                </View>
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="font-extrabold text-foreground">
                    {selectedCustomer?.name ?? "Guest customer"}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {selectedCustomer
                      ? [selectedCustomer.phone, selectedCustomer.email]
                          .filter(Boolean)
                          .join(" · ") || "No contact details"
                      : "No customer attached to this sale"}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Change customer"
                  className="min-h-11 justify-center px-1"
                  haptic
                  onPress={() => setStep("customer")}
                >
                  <Text className="text-xs font-bold text-primary">Change</Text>
                </Pressable>
              </View>
            </View>

            <View className="gap-4 border-t border-border pt-5">
              <View className="gap-1">
                <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                  Payment
                </Text>
                <Text className="text-sm text-muted-foreground">
                  Choose the method and enter what the customer paid.
                </Text>
              </View>
              <View className="flex-row gap-2">
                {PAYMENT_METHODS.map(([value, label]) => (
                  <SaleSegmentOption
                    icon={
                      value === "cash"
                        ? "Wallet"
                        : value === "bank_transfer"
                          ? "Building"
                          : "CreditCard"
                    }
                    key={value}
                    label={label}
                    onPress={() => setPaymentMethod(value)}
                    selected={paymentMethod === value}
                  />
                ))}
              </View>

              <MoneyField
                actionLabel={isOffline ? undefined : "All amount paid"}
                currencyCode={currencyCode}
                editable={!isOffline}
                error={paymentSummary.error ?? undefined}
                helper={
                  isOffline
                    ? "Reconnect to record payment."
                    : "Leave empty for an unpaid sale, or enter a part payment."
                }
                label="Amount received"
                onActionPress={
                  isOffline
                    ? undefined
                    : () => setAmountReceived(minorToMajorInput(totalMinor))
                }
                onChangeValue={setAmountReceived}
                placeholder="0.00"
                value={amountReceived}
              />

              <View className="gap-3 rounded-2xl bg-muted/60 p-4">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-sm text-muted-foreground">
                    Amount received
                  </Text>
                  <Text className="font-bold text-foreground">
                    {formatMinorMoney(
                      paymentSummary.receivedMinor,
                      currencyCode,
                    )}
                  </Text>
                </View>
                <View className="h-px bg-border" />
                <View className="flex-row items-end justify-between gap-3">
                  <View className="gap-1">
                    <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
                      Balance due
                    </Text>
                    <Text className="text-xs font-semibold text-primary">
                      {paymentSummary.paymentState === "paid"
                        ? "Paid in full"
                        : paymentSummary.paymentState === "partially_paid"
                          ? "Part payment"
                          : "Payment pending"}
                    </Text>
                  </View>
                  <Text className="text-2xl font-extrabold text-foreground">
                    {formatMinorMoney(
                      paymentSummary.balanceDueMinor,
                      currencyCode,
                    )}
                  </Text>
                </View>
              </View>
            </View>
          </KeyboardAwareScrollView>

          <BottomSearchFooter
            accessibilityLabel="Checkout actions"
            onChangeText={() => undefined}
            placeholder=""
            searchVisible={false}
            totalCount={0}
            value=""
          >
            <View className="flex-row items-center gap-3">
              <View className="min-w-[104px] gap-0.5">
                <Text className="text-[10px] font-bold uppercase tracking-[1px] text-muted-foreground">
                  {paymentSummary.paymentState === "paid"
                    ? "Paid in full"
                    : "Balance due"}
                </Text>
                <Text className="text-xl font-extrabold text-foreground">
                  {formatMinorMoney(
                    paymentSummary.balanceDueMinor,
                    currencyCode,
                  )}
                </Text>
              </View>
              <ActionButton
                className="w-auto flex-1"
                isLoading={isSubmitting}
                loadingLabel="Confirming sale"
                onPress={() => void submit()}
                trailingIcon="ArrowRight"
              >
                {isOffline ? "Queue order" : "Confirm sale"}
              </ActionButton>
            </View>
          </BottomSearchFooter>
        </View>
      ) : null}

      <CreateSaleCustomerSheet
        draft={customerDraft}
        error={customerDraftError}
        onChange={(draft) => {
          setCustomerDraft(draft)
          setCustomerDraftError(null)
        }}
        onSave={saveCustomerDraft}
        ref={customerModal.ref}
      />
      <CompactSaleItemPicker
        choices={compactPickerChoices}
        itemKind={itemKind}
        onToggle={(choice) => {
          if (selectedChoiceIds.has(choice.id)) {
            removeOffering(choice.id)
          } else {
            addOffering(choice)
          }
          compactItemModal.dismiss()
        }}
        ref={compactItemModal.ref}
        selectedChoiceIds={selectedChoiceIds}
      />
      <FullScreenSaleItemPicker
        choices={allRows}
        draft={pickerDraft}
        hasNextPage={!isOffline && Boolean(catalog.hasNextPage)}
        isFetchingNextPage={catalog.isFetchingNextPage}
        itemKind={itemKind}
        onAdd={(choice) =>
          setPickerDraft((current) => ({
            ...current,
            [choice.id]: choice,
          }))
        }
        onClose={closeFullScreenPicker}
        onFetchNextPage={() => {
          if (
            !isOffline &&
            shouldFetchNextListPage({
              hasNextPage: Boolean(catalog.hasNextPage),
              isFetchingNextPage: catalog.isFetchingNextPage,
            })
          ) {
            void catalog.fetchNextPage()
          }
        }}
        onProceed={commitFullScreenPicker}
        onQueryChange={setProductSearch}
        onRemove={(choiceId) =>
          setPickerDraft((current) => {
            const remaining = { ...current }
            delete remaining[choiceId]
            return remaining
          })
        }
        query={productSearch}
        searchChoiceCount={pickerChoiceCount}
        visible={pickerVisible}
      />
    </View>
  )
}
