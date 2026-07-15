import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { QuantityStepper } from "@/components/mobile/quantity-stepper"
import {
  SaleSegmentOption,
  SaleSelectableRow,
  SaleTotalSummary,
} from "@/components/mobile/sale-flow"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { Icon } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { parseWholeQuantity } from "@/lib/quantity"
import { cn } from "@/lib/utils"
import { useBusinessStore } from "@/store/businessStore"
import {
  type RetailOpsCustomer,
  type RetailOpsPaymentMethod,
  type RetailOpsProduct,
  useRetailOpsStore,
} from "@/store/retailOpsStore"
import { useTRPC } from "@/trpc/client"
import { formatMoney } from "@ewatrade/utils"
import {
  type BottomSheetModal,
  BottomSheetSectionList,
  type BottomSheetSectionListMethods,
} from "@gorhom/bottom-sheet"
import { useMutation, useQuery } from "@tanstack/react-query"
import { forwardRef, useMemo, useRef, useState } from "react"
import { SectionList, View } from "react-native"

type CreateSaleSheetProps = {
  attendantName?: string
  onComplete?: () => void
}

type CreateSaleContentProps = CreateSaleSheetProps & {
  presentation?: "screen" | "sheet"
}

type SellableItem = {
  id: string
  productId: string
  productName: string
  remoteVariantId?: string
  stock: number
  unitName: string
  unitPrice: number
  variantId?: string
}

type SellableSection = {
  data: SellableItem[]
  product: RetailOpsProduct
}

type SaleListItem =
  | { item: SellableItem; kind: "sellable" }
  | {
      kind:
        | "customer"
        | "payment"
        | "quantity"
        | "session-warning"
        | "stock-warning"
        | "submit"
        | "submit-error"
        | "total"
    }

type SaleListSection = {
  data: SaleListItem[]
  id: string
  product?: RetailOpsProduct
  type: "checkout" | "product"
}

type ProductionCustomerBookEntry = {
  email: string | null
  id: string
  lastOrder?: {
    orderNumber: string
  } | null
  lastSeenAt: Date | string
  name: string
  orderCount: number
  phone: string | null
}

type CustomerOption = {
  detail: string
  email?: string
  id: string
  name: string
  phone?: string
  source: "local" | "production"
  status?: RetailOpsCustomer["syncStatus"]
}

function getProductStock(product: RetailOpsProduct) {
  return product.currentStock ?? product.startingStock ?? 0
}

function getPrimarySellableItem(product: RetailOpsProduct): SellableItem {
  return {
    id: `${product.id}-primary`,
    productId: product.id,
    productName: product.name,
    remoteVariantId: product.remoteVariantId,
    stock: getProductStock(product),
    unitName: product.unitName,
    unitPrice: product.price,
  }
}

function getSellableItems(product: RetailOpsProduct): SellableItem[] {
  const primaryItem = getPrimarySellableItem(product)

  if (product.variants.length > 0) {
    return product.variants.map((variant) => ({
      id: `${product.id}-${variant.id}`,
      productId: product.id,
      productName: product.name,
      remoteVariantId: variant.remoteId,
      stock: variant.currentStock ?? variant.startingStock ?? 0,
      unitName: variant.name,
      unitPrice: variant.price,
      variantId: variant.id,
    }))
  }

  return [primaryItem]
}

function PaymentOption({
  label,
  onPress,
  selected,
}: {
  label: string
  onPress: () => void
  selected: boolean
}) {
  return (
    <SaleSegmentOption label={label} onPress={onPress} selected={selected} />
  )
}

function SellableOption({
  item,
  onPress,
  selected,
}: {
  item: SellableItem
  onPress: () => void
  selected: boolean
}) {
  const isOutOfStock = item.stock <= 0

  if (selected) {
    return (
      <SaleSelectableRow
        accessory="Selected"
        meta={`${item.productName} - ${item.stock} available`}
        onPress={onPress}
        selected
        title={item.unitName}
        value={formatMoney(item.unitPrice, "NGN")}
      />
    )
  }

  return (
    <SaleSelectableRow
      accessory={`${item.stock} available`}
      disabled={isOutOfStock}
      meta={item.productName}
      onPress={onPress}
      title={item.unitName}
      value={formatMoney(item.unitPrice, "NGN")}
    >
      {selected ? (
        <View className="self-start rounded-full bg-primary/10 px-3 py-1">
          <Text className="text-xs font-bold text-primary">Selected</Text>
        </View>
      ) : null}
    </SaleSelectableRow>
  )
}

function ProductSectionHeader({ product }: { product: RetailOpsProduct }) {
  return (
    <View className="gap-3 bg-background pt-2 pb-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-bold text-foreground">{product.name}</Text>
          <Text className="text-xs text-muted-foreground">
            {product.variants.length > 0
              ? "Choose a unit or variant"
              : "Primary unit"}
          </Text>
        </View>
        <StatusBadge
          label={`${getProductStock(product)} ${product.unitName}`}
          tone="muted"
        />
      </View>
    </View>
  )
}

function getCustomerOptionKey(customer: CustomerOption) {
  return (
    customer.email?.trim().toLowerCase() ??
    customer.phone?.trim() ??
    customer.name.trim().toLowerCase()
  )
}

function mapProductionCustomerOption(
  customer: ProductionCustomerBookEntry,
): CustomerOption {
  const orderLabel =
    customer.orderCount === 1 ? "1 order" : `${customer.orderCount} orders`

  return {
    detail: customer.lastOrder?.orderNumber
      ? `${orderLabel} - last ${customer.lastOrder.orderNumber}`
      : orderLabel,
    email: customer.email ?? undefined,
    id: `production-${customer.id}`,
    name: customer.name,
    phone: customer.phone ?? undefined,
    source: "production",
    status: "synced",
  }
}

function mapLocalCustomerOption(customer: RetailOpsCustomer): CustomerOption {
  const saleLabel =
    customer.saleCount === 1
      ? "1 local sale"
      : `${customer.saleCount} local sales`

  return {
    detail: customer.remoteId ? `${saleLabel} - synced` : saleLabel,
    id: `local-${customer.id}`,
    name: customer.name,
    source: "local",
    status: customer.syncStatus,
  }
}

function CustomerOptionChip({
  customer,
  onPress,
  selected,
}: {
  customer: CustomerOption
  onPress: () => void
  selected: boolean
}) {
  return (
    <Pressable
      className={cn(
        "max-w-full gap-1 border-t border-border py-3 active:bg-accent",
        selected && "border-primary",
      )}
      haptic
      onPress={onPress}
      transition
    >
      <View className="flex-row items-center gap-2">
        {selected ? <View className="h-2 w-2 rounded-full bg-primary" /> : null}
        <Text
          className={cn(
            "text-xs font-bold text-foreground",
            selected && "text-primary",
          )}
        >
          {customer.name}
        </Text>
      </View>
      <Text className="text-xs text-muted-foreground">{customer.detail}</Text>
      {customer.email || customer.phone ? (
        <Text className="text-xs text-muted-foreground">
          {[customer.email, customer.phone].filter(Boolean).join(" - ")}
        </Text>
      ) : null}
      {customer.status === "pending" ? (
        <StatusBadge icon="Clock" label="Pending sync" tone="warning" />
      ) : null}
    </Pressable>
  )
}

export function CreateSaleContent({
  attendantName = "Store Owner",
  onComplete,
  presentation = "sheet",
}: CreateSaleContentProps) {
  const trpc = useTRPC()
  const checkoutBottomSheetListRef =
    useRef<BottomSheetSectionListMethods>(null)
  const checkoutScreenListRef =
    useRef<SectionList<SaleListItem, SaleListSection>>(null)
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const createSale = useRetailOpsStore((state) => state.createSale)
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
  const allCustomers = useRetailOpsStore((state) => state.customers)
  const allProducts = useRetailOpsStore((state) => state.products)
  const customers = useMemo(
    () =>
      allCustomers.filter(
        (customer) =>
          !activeBusinessId ||
          (customer.businessId ?? activeBusinessId) === activeBusinessId,
      ),
    [activeBusinessId, allCustomers],
  )
  const products = useMemo(
    () =>
      allProducts.filter(
        (product) =>
          !activeBusinessId ||
          (product.businessId ?? activeBusinessId) === activeBusinessId,
      ),
    [activeBusinessId, allProducts],
  )
  const currentOpenSession = useRetailOpsStore(
    (state) =>
      state.repSessions.find(
        (session) =>
          session.status === "open" &&
          session.attendantName === attendantName &&
          (!activeBusinessId ||
            (session.businessId ?? activeBusinessId) === activeBusinessId),
      ) ?? null,
  )
  const [customerName, setCustomerName] = useState("")
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerOption | null>(null)
  const [paymentMethod, setPaymentMethod] =
    useState<RetailOpsPaymentMethod>("cash")
  const [quantity, setQuantity] = useState("1")
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const createProductionSaleMutation = useMutation(
    trpc.retailOps.createSale.mutationOptions({
      onError: (error) => {
        setSubmitError(error.message)
      },
    }),
  )
  const normalizedCustomerSearch = customerName.trim()
  const productionCustomersQuery = useQuery(
    trpc.retailOps.customerBook.queryOptions(
      {
        limit: 8,
        search: normalizedCustomerSearch || undefined,
      },
      {
        enabled: !isOfflineMode,
        retry: false,
      },
    ),
  )

  const sellableItems = useMemo(
    () => products.flatMap((product) => getSellableItems(product)),
    [products],
  )
  const sellableSections = useMemo<SaleListSection[]>(
    () =>
      products.map((product) => ({
        data: getSellableItems(product).map((item) => ({
          item,
          kind: "sellable" as const,
        })),
        id: product.id,
        product,
        type: "product",
      })),
    [products],
  )
  const selectedItem = sellableItems.find((item) => item.id === selectedItemId)
  const quantityValue = parseWholeQuantity(quantity)
  const total = selectedItem ? selectedItem.unitPrice * quantityValue : 0
  const hasEnoughStock = selectedItem
    ? quantityValue <= selectedItem.stock
    : true
  const hasOpenSession = !!currentOpenSession
  const canCreateProductionSale =
    !isOfflineMode &&
    !!selectedItem?.remoteVariantId &&
    !!currentOpenSession?.remoteId
  const canSubmit =
    hasOpenSession &&
    !!selectedItem &&
    quantityValue > 0 &&
    hasEnoughStock &&
    !createProductionSaleMutation.isPending
  const sourceLabel = canCreateProductionSale
    ? "Online"
    : isOfflineMode
      ? "Local"
      : "Local queue"
  const sourceDetail = canCreateProductionSale
    ? "This sale will be recorded in production immediately."
    : isOfflineMode
      ? "This sale will be queued locally and synced later."
      : "Waiting for the product unit or rep session to sync before direct production sale."
  const localCustomerOptions = useMemo(() => {
    const normalizedSearch = normalizedCustomerSearch.toLowerCase()
    const localCustomers = normalizedSearch
      ? customers.filter((customer) =>
          customer.name.toLowerCase().includes(normalizedSearch),
        )
      : customers

    return localCustomers.map(mapLocalCustomerOption)
  }, [customers, normalizedCustomerSearch])
  const productionCustomerOptions = useMemo(
    () =>
      (
        (productionCustomersQuery.data ?? []) as ProductionCustomerBookEntry[]
      ).map(mapProductionCustomerOption),
    [productionCustomersQuery.data],
  )
  const visibleCustomerOptions = useMemo(() => {
    if (isOfflineMode || productionCustomersQuery.isError) {
      return localCustomerOptions.slice(0, 8)
    }

    const seen = new Set(productionCustomerOptions.map(getCustomerOptionKey))
    const mergedCustomers = [...productionCustomerOptions]

    for (const localCustomer of localCustomerOptions) {
      const key = getCustomerOptionKey(localCustomer)

      if (!seen.has(key)) {
        seen.add(key)
        mergedCustomers.push(localCustomer)
      }
    }

    return mergedCustomers.slice(0, 8)
  }, [
    isOfflineMode,
    localCustomerOptions,
    productionCustomerOptions,
    productionCustomersQuery.isError,
  ])
  const checkoutRows = useMemo<SaleListItem[]>(() => {
    const rows: SaleListItem[] = [{ kind: "quantity" }]

    if (!hasEnoughStock && selectedItem) {
      rows.push({ kind: "stock-warning" })
    }

    if (!hasOpenSession) {
      rows.push({ kind: "session-warning" })
    }

    if (submitError) {
      rows.push({ kind: "submit-error" })
    }

    rows.push(
      { kind: "total" },
      { kind: "payment" },
      { kind: "customer" },
      { kind: "submit" },
    )

    return rows
  }, [hasEnoughStock, hasOpenSession, selectedItem, submitError])
  const saleSections = useMemo<SaleListSection[]>(
    () => [
      ...sellableSections,
      {
        data: checkoutRows,
        id: "checkout",
        type: "checkout",
      },
    ],
    [checkoutRows, sellableSections],
  )
  const checkoutSectionIndex = saleSections.length - 1
  const quantityRowIndex = checkoutRows.findIndex(
    (row) => row.kind === "quantity",
  )
  const paymentRowIndex = checkoutRows.findIndex(
    (row) => row.kind === "payment",
  )
  const customerRowIndex = checkoutRows.findIndex(
    (row) => row.kind === "customer",
  )
  const updateCustomerName = (value: string) => {
    setCustomerName(value)
    setSelectedCustomer(null)
  }

  const selectCustomer = (customer: CustomerOption) => {
    setCustomerName(customer.name)
    setSelectedCustomer(customer)
  }

  const scrollToCheckoutRow = (
    itemIndex: number,
    viewPosition = 0.15,
    delay = 120,
  ) => {
    setTimeout(() => {
      if (checkoutSectionIndex >= 0 && itemIndex >= 0) {
        const checkoutList =
          presentation === "screen"
            ? checkoutScreenListRef.current
            : checkoutBottomSheetListRef.current

        checkoutList?.scrollToLocation({
          animated: true,
          itemIndex,
          sectionIndex: checkoutSectionIndex,
          viewPosition,
        })
      }
    }, delay)
  }

  const scrollToQuantityInput = () => {
    const quantityScrollTarget =
      paymentRowIndex >= 0
        ? paymentRowIndex
        : Math.min(quantityRowIndex + 2, checkoutRows.length - 1)

    scrollToCheckoutRow(quantityScrollTarget, 0.65)
    scrollToCheckoutRow(quantityScrollTarget, 0.65, 360)
  }

  const scrollToCustomerInput = () => {
    scrollToCheckoutRow(customerRowIndex, 0.15)
  }

  const selectItem = (item: SellableItem) => {
    setSelectedItemId(item.id)
    setQuantity("1")
    scrollToQuantityInput()
  }

  const resetForm = () => {
    setCustomerName("")
    setSelectedCustomer(null)
    setPaymentMethod("cash")
    setQuantity("1")
    setSelectedItemId(null)
    setSubmitError(null)
  }

  const submit = () => {
    if (!selectedItem || !canSubmit) return

    const resolvedCustomerName =
      selectedCustomer?.name.trim() || customerName.trim()
    const localSaleInput = {
      attendantName,
      businessId: activeBusinessId ?? undefined,
      customerName: resolvedCustomerName,
      paymentMethod,
      productId: selectedItem.productId,
      productName: selectedItem.productName,
      quantity: quantityValue,
      unitName: selectedItem.unitName,
      unitPrice: selectedItem.unitPrice,
      variantId: selectedItem.variantId,
    }

    setSubmitError(null)

    if (canCreateProductionSale && selectedItem.remoteVariantId) {
      createProductionSaleMutation.mutate(
        {
          cashierSessionId: currentOpenSession?.remoteId,
          customerEmail: selectedCustomer?.email,
          customerName: resolvedCustomerName || undefined,
          customerPhone: selectedCustomer?.phone,
          paymentMethod,
          productVariantId: selectedItem.remoteVariantId,
          quantity: quantityValue,
        },
        {
          onSuccess: (sale) => {
            createSale({
              ...localSaleInput,
              remoteId: sale.order.id,
              syncStatus: "synced",
            })
            resetForm()
            onComplete?.()
          },
        },
      )
      return
    }

    createSale(localSaleInput)
    resetForm()
    onComplete?.()
  }

  const listProps = {
    contentContainerStyle: { paddingBottom: 240, paddingHorizontal: 20 },
    keyExtractor: (item: SaleListItem) =>
      item.kind === "sellable" ? item.item.id : item.kind,
    keyboardShouldPersistTaps: "handled" as const,
    ListHeaderComponent: (
            <View className="gap-5 pt-1 pb-4">
              <View className="gap-2">
                <Text className="text-xl font-bold text-foreground">
                  Select item
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  Choose a product unit or variant, set quantity, then confirm
                  payment and customer.
                </Text>
              </View>

              <StatusBanner
                icon={canCreateProductionSale ? "CircleCheck" : "Clock"}
                message={sourceDetail}
                title={`Sale source: ${sourceLabel}`}
                tone={canCreateProductionSale ? "success" : "warning"}
              />

              {products.length === 0 ? (
                <EmptyState
                  icon="Warehouse"
                  message="Create at least one item before recording a sale."
                  title="Add inventory first"
                />
              ) : null}
            </View>
    ),
    renderItem: ({ item }: { item: SaleListItem }) => {
            if (item.kind === "sellable") {
              return (
                <View className="pb-3">
                  <SellableOption
                    item={item.item}
                    onPress={() => selectItem(item.item)}
                    selected={selectedItemId === item.item.id}
                  />
                </View>
              )
            }

            if (item.kind === "quantity") {
              return (
                <View className="pt-5 pb-3">
                  <QuantityStepper
                    helper={selectedItem ? selectedItem.unitName : undefined}
                    onChangeText={setQuantity}
                    onFocus={scrollToQuantityInput}
                    value={quantity}
                  />
                </View>
              )
            }

            if (item.kind === "stock-warning" && selectedItem) {
              return (
                <View className="pb-3">
                  <StatusBanner
                    icon="TriangleAlert"
                    message={`Only ${selectedItem.stock} ${selectedItem.unitName} available.`}
                    title="Insufficient stock"
                    tone="destructive"
                  />
                </View>
              )
            }

            if (item.kind === "session-warning") {
              return (
                <View className="pb-3">
                  <StatusBanner
                    icon="TriangleAlert"
                    message="Clock in and confirm opening stock before completing a sale."
                    title="Rep session required"
                    tone="warning"
                  />
                </View>
              )
            }

            if (item.kind === "submit-error" && submitError) {
              return (
                <View className="pb-3">
                  <StatusBanner
                    icon="TriangleAlert"
                    message={submitError}
                    title="Sale was not completed"
                    tone="destructive"
                  />
                </View>
              )
            }

            if (item.kind === "total") {
              return (
                <View className="pb-5">
                  <SaleTotalSummary
                    helper={selectedItem?.unitName}
                    label="Total"
                    value={formatMoney(total, "NGN")}
                  />
                </View>
              )
            }

            if (item.kind === "payment") {
              return (
                <View className="gap-3 pb-5">
                  <Text className="text-sm font-semibold text-foreground">
                    Payment method
                  </Text>
                  <View className="flex-row gap-3">
                    <PaymentOption
                      label="Cash"
                      onPress={() => setPaymentMethod("cash")}
                      selected={paymentMethod === "cash"}
                    />
                    <PaymentOption
                      label="Transfer"
                      onPress={() => setPaymentMethod("transfer")}
                      selected={paymentMethod === "transfer"}
                    />
                  </View>
                </View>
              )
            }

            if (item.kind === "customer") {
              return (
                <View className="gap-3 pb-5">
                  <FormField
                    autoCapitalize="words"
                    helper={
                      isOfflineMode
                        ? "Searching customers saved on this device."
                        : productionCustomersQuery.isError
                          ? "Production customer search is unavailable, showing local customers."
                          : "Type a new name or pick a saved customer."
                    }
                    label="Customer"
                    onChangeText={updateCustomerName}
                    onFocus={scrollToCustomerInput}
                    placeholder="Enter customer name"
                    value={customerName}
                  />
                  {visibleCustomerOptions.length > 0 ? (
                    <View className="gap-2">
                      <View className="flex-row items-center justify-between gap-3">
                        <Text className="text-xs font-bold uppercase text-muted-foreground">
                          Customer book
                        </Text>
                        <StatusBadge
                          label={
                            isOfflineMode || productionCustomersQuery.isError
                              ? "Local"
                              : productionCustomersQuery.isFetching
                                ? "Refreshing"
                                : "Online"
                          }
                          tone={
                            isOfflineMode || productionCustomersQuery.isError
                              ? "warning"
                              : "success"
                          }
                        />
                      </View>
                      <View className="flex-row flex-wrap gap-2">
                        {visibleCustomerOptions.map((customer) => (
                          <CustomerOptionChip
                            customer={customer}
                            key={customer.id}
                            onPress={() => selectCustomer(customer)}
                            selected={selectedCustomer?.id === customer.id}
                          />
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              )
            }

            if (item.kind === "submit") {
              return (
                <View className="pb-6">
                  <ActionButton disabled={!canSubmit} onPress={submit}>
                    {createProductionSaleMutation.isPending
                      ? "Recording sale..."
                      : "Complete transaction"}
                  </ActionButton>
                </View>
              )
            }

            return null
          },
    renderSectionHeader: ({ section }: { section: SaleListSection }) =>
            section.product &&
            !section.data.some(
              (row) =>
                row.kind === "sellable" && row.item.id === selectedItemId,
            ) ? (
              <ProductSectionHeader product={section.product} />
            ) : null,
    sections: saleSections,
    stickySectionHeadersEnabled: false,
  }

  if (presentation === "screen") {
    return (
      <SectionList<SaleListItem, SaleListSection>
        {...listProps}
        className="flex-1"
        ref={checkoutScreenListRef}
      />
    )
  }

  return (
    <BottomSheetInputProvider>
      <BottomSheetSectionList<SaleListItem, SaleListSection>
        {...listProps}
        ref={checkoutBottomSheetListRef}
      />
    </BottomSheetInputProvider>
  )
}

export const CreateSaleSheet = forwardRef<
  BottomSheetModal,
  CreateSaleSheetProps
>((props, ref) => {
  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["90%"]}
      title="Create sale"
    >
      <CreateSaleContent {...props} presentation="sheet" />
    </Modal>
  )
})

CreateSaleSheet.displayName = "CreateSaleSheet"
