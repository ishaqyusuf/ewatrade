import { buildCommerceCustomers } from "@/components/mobile/commerce"
import type { SaleCustomerDraft } from "@/components/mobile/create-sale-customer-sheet"
import { CUSTOMER_SHEET_PRESENT_DELAY_MS } from "@/components/mobile/create-sale-customer-sheet-model"
import {
  getSaleFulfillmentOption,
  saleLineTotalMinor,
  salePaymentSummary,
} from "@/components/mobile/sale-checkout-model"
import {
  type SaleItemPickerLine,
  addSaleItemPickerLine,
  getSaleItemPickerLineCounts,
  getSelectableSaleItemChoices,
  openSaleItemPicker,
  removeSaleItemPickerLine,
  selectInitialCatalogItemLine,
  updateSaleItemPickerLineQuantity,
} from "@/components/mobile/sale-item-picker-model"
import { useModal } from "@/components/ui/modal"
import { useAuthContext } from "@/hooks/use-auth"
import { createOrderFixture } from "@/internal-tooling/fixture-recipes"
import {
  LIST_PAGE_SIZE,
  shouldFetchNextListPage,
  shouldShowListSearch,
} from "@/lib/list-pagination"
import { buildOfflineOrderCommand } from "@/lib/offline-order"
import { useOfflineCommandStore } from "@/store/offlineCommandStore"
import {
  isOfflineAccessAllowed,
  useOperationalModeStore,
} from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import type { DateTimePickerEvent } from "@react-native-community/datetimepicker"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import {
  type Dispatch,
  type SetStateAction,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Keyboard, Platform } from "react-native"
import {
  type CreateSaleContentProps,
  type CreateSaleCompletion,
  type PaymentMethod,
  type SaleStep,
  type SelectedCustomer,
  type OfferingRow,
  flattenSaleOfferings,
} from "./create-sale-model"
import { useSaleFulfillment } from "./use-sale-fulfillment"

export function useCreateSale({
  initialCatalogItemId,
  initialCustomer,
  itemKind,
  onComplete,
}: CreateSaleContentProps) {
  const submissionPending = useRef(false)
  const submitted = useRef(false)
  const mounted = useRef(true)
  const [isConfirming, setIsConfirming] = useState(false)
  const [completion, setCompletion] = useState<CreateSaleCompletion | null>(
    null,
  )
  const [postSubmitWarning, setPostSubmitWarning] = useState<string | null>(
    null,
  )
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  function guardEdit<T>(setter: Dispatch<SetStateAction<T>>) {
    return (value: SetStateAction<T>) => {
      if (!submissionPending.current && !submitted.current) setter(value)
    }
  }
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const customerModal = useModal()
  const [isSavingCustomer, setIsSavingCustomer] = useState(false)
  const customerSavePending = useRef(false)
  const customerPresentationTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  useEffect(
    () => () => {
      if (customerPresentationTimer.current)
        clearTimeout(customerPresentationTimer.current)
    },
    [],
  )
  const offlineMode = useOperationalModeStore((state) => state.isOfflineMode)
  const offlineAccessByBusinessId = useOperationalModeStore(
    (state) => state.offlineAccessByBusinessId,
  )
  const queueCommand = useOfflineCommandStore((state) => state.queueCommand)
  const orderClientId = useRef(`order-${Crypto.randomUUID()}`)
  const paymentClientId = useRef(`payment-${Crypto.randomUUID()}`)
  const initialCatalogSelectionApplied = useRef(false)
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
  const [deliveryDueAt, setDeliveryDueAt] = useState(() => new Date())
  const [deliveryPickerMode, setDeliveryPickerMode] = useState<
    "date" | "time" | null
  >(null)
  const [fulfillNowRequested, setFulfillNowRequested] = useState(false)
  const [productSearch, setProductSearch] = useState("")
  const [pickerChoiceCount, setPickerChoiceCount] = useState(0)
  const [compactPickerChoices, setCompactPickerChoices] = useState<
    OfferingRow[]
  >([])
  const [compactPickerVisible, setCompactPickerVisible] = useState(false)
  const [pickerDraft, setPickerDraft] = useState<
    SaleItemPickerLine<OfferingRow>[]
  >([])
  const [pickerVisible, setPickerVisible] = useState(false)
  const deferredCustomerSearch = useDeferredValue(customerSearch)
  const deferredProductSearch = useDeferredValue(productSearch)
  const [selectedLines, setSelectedLines] = useState<
    SaleItemPickerLine<OfferingRow>[]
  >([])
  const [focusedQuantityId, setFocusedQuantityId] = useState<string | null>(
    null,
  )
  const [selectedCustomer, setSelectedCustomer] =
    useState<SelectedCustomer | null>(initialCustomer ?? null)
  const [step, setStep] = useState<SaleStep>("items")
  const quickFillSnapshot = useRef<{
    paymentMethod: PaymentMethod
    selectedCustomer: SelectedCustomer | null
    selectedLines: SaleItemPickerLine<OfferingRow>[]
    step: SaleStep
  } | null>(null)
  const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)
  const businessId = useAuthContext().profile?.businessId
  const isOffline =
    offlineMode && isOfflineAccessAllowed(offlineAccessByBusinessId, businessId)

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
  const initialCatalogItem = useQuery(
    trpc.catalog.getItem.queryOptions(
      { itemId: initialCatalogItemId ?? "" },
      {
        enabled: !isOffline && Boolean(initialCatalogItemId),
        retry: false,
      },
    ),
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
  const customerDirectory = useInfiniteQuery(
    trpc.customers.listPage.infiniteQueryOptions(
      {
        limit: LIST_PAGE_SIZE,
        query: isOffline ? undefined : deferredCustomerSearch || undefined,
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
  const directoryCustomerCount = useQuery(
    trpc.customers.count.queryOptions(undefined, {
      enabled: !isOffline,
      retry: false,
    }),
  )
  const customerMutation = useMutation(trpc.customers.create.mutationOptions())
  const orderMutation = useMutation(trpc.orders.create.mutationOptions())

  const loadedRows = useMemo(() => {
    const items = catalog.data?.pages.flatMap((page) => page.items) ?? []
    const initialItem = deferredProductSearch.trim()
      ? undefined
      : initialCatalogItem.data
    return flattenSaleOfferings(
      initialItem
        ? [initialItem, ...items.filter((item) => item.id !== initialItem.id)]
        : items,
      availability.data?.storeId,
      itemKind,
    )
  }, [
    availability.data?.storeId,
    catalog.data?.pages,
    deferredProductSearch,
    initialCatalogItem.data,
    itemKind,
  ])
  const allRows = useMemo(() => {
    const normalizedSearch = productSearch.trim().toLowerCase()
    if (
      !isOffline &&
      (productSearch !== deferredProductSearch || catalog.isPlaceholderData)
    )
      return []
    if (!isOffline || !normalizedSearch) return loadedRows
    return loadedRows.filter((row) =>
      `${row.displayName} ${row.offeringName}`
        .toLowerCase()
        .includes(normalizedSearch),
    )
  }, [
    isOffline,
    loadedRows,
    productSearch,
    deferredProductSearch,
    catalog.isPlaceholderData,
  ])
  useEffect(() => {
    if (initialCatalogSelectionApplied.current || !initialCatalogItemId) {
      return
    }
    if (step !== "items" || selectedLines.length > 0) {
      initialCatalogSelectionApplied.current = true
      return
    }
    if (
      submissionPending.current ||
      submitted.current ||
      !allRows.some((row) => row.catalogItemId === initialCatalogItemId)
    )
      return
    initialCatalogSelectionApplied.current = true
    const lineId = Crypto.randomUUID()
    setSelectedLines((lines) =>
      selectInitialCatalogItemLine({
        catalogItemId: initialCatalogItemId,
        choices: allRows,
        lineId,
        lines,
      }),
    )
  }, [allRows, initialCatalogItemId, selectedLines.length, step])
  const selectedRows = useMemo(
    () =>
      selectedLines.flatMap(({ id, offering, quantity }) => {
        if (!offering || offering.disabledReason) return []
        const totalMinor = saleLineTotalMinor(
          offering.fixedPriceMinor,
          quantity,
        )
        return [{ id, offering, quantity, totalMinor }]
      }),
    [selectedLines],
  )
  const lineCountsByOfferingId = useMemo(() => {
    return getSaleItemPickerLineCounts(selectedLines)
  }, [selectedLines])
  const totalMinor = selectedRows.reduce(
    (total, line) => total + (line.totalMinor ?? 0),
    0,
  )
  const currencyCode = selectedRows[0]?.offering.currencyCode ?? "NGN"
  const paymentSummary = salePaymentSummary(totalMinor, amountReceived)
  const fulfillmentOption = useSaleFulfillment({
    deliveryDueAt,
    hasProductLines: selectedRows.some(
      (line) => line.offering.kind === "product_unit",
    ),
    requested: fulfillNowRequested,
  })
  const loadedCustomers = useMemo(
    () =>
      buildCommerceCustomers(
        recentOrders.data?.pages.flatMap((page) => page.items) ?? [],
        [],
        customerDirectory.data?.pages.flatMap((page) => page.items) ?? [],
      ),
    [customerDirectory.data?.pages, recentOrders.data?.pages],
  )
  const customers = useMemo(() => {
    const normalizedSearch = customerSearch.trim().toLowerCase()
    if (!isOffline && customerSearch !== deferredCustomerSearch) return []
    if (!isOffline || !normalizedSearch) return loadedCustomers
    return loadedCustomers.filter((customer) =>
      `${customer.name} ${customer.phone ?? ""} ${customer.email ?? ""}`
        .toLowerCase()
        .includes(normalizedSearch),
    )
  }, [customerSearch, deferredCustomerSearch, isOffline, loadedCustomers])
  const showCustomerSearch =
    Boolean(customerSearch) ||
    shouldShowListSearch(
      Math.max(
        (customerCount.data ?? 0) + (directoryCustomerCount.data ?? 0),
        loadedCustomers.length,
      ),
    )
  const isSubmitting = isConfirming || orderMutation.isPending
  const customersLoading =
    !isOffline &&
    (recentOrders.isPending ||
      customerDirectory.isPending ||
      customerSearch !== deferredCustomerSearch)
  const choicesLoading =
    !isOffline &&
    (catalog.isLoading ||
      availability.isLoading ||
      productSearch !== deferredProductSearch)
  const choicesError =
    availability.error?.message ?? catalog.error?.message ?? null

  function retryChoices() {
    if (isOffline) return
    void catalog.refetch()
    void availability.refetch()
    if (initialCatalogItemId) void initialCatalogItem.refetch()
  }

  function retryCustomers() {
    if (isOffline) return
    void recentOrders.refetch()
    void customerDirectory.refetch()
  }

  function addPickerChoice(offering: OfferingRow) {
    if (submissionPending.current || submitted.current) return
    const lineId = Crypto.randomUUID()
    setPickerDraft((lines) =>
      addSaleItemPickerLine({ lineId, lines, offering }),
    )
  }

  function removePickerLine(lineId: string) {
    if (submissionPending.current || submitted.current) return
    setPickerDraft((lines) => removeSaleItemPickerLine(lines, lineId))
  }

  function fetchNextChoices() {
    if (
      isOffline ||
      !shouldFetchNextListPage({
        hasNextPage: Boolean(catalog.hasNextPage),
        isFetchingNextPage: catalog.isFetchingNextPage,
      })
    )
      return
    void catalog.fetchNextPage()
  }

  function changeDeliveryDueAt(
    event: DateTimePickerEvent,
    selectedValue?: Date,
  ) {
    if (Platform.OS !== "ios") setDeliveryPickerMode(null)
    if (
      submissionPending.current ||
      submitted.current ||
      event.type !== "set" ||
      !selectedValue
    )
      return
    setDeliveryDueAt((current) => {
      const next = new Date(current)
      if (deliveryPickerMode === "date") {
        next.setFullYear(
          selectedValue.getFullYear(),
          selectedValue.getMonth(),
          selectedValue.getDate(),
        )
      } else {
        next.setHours(
          selectedValue.getHours(),
          selectedValue.getMinutes(),
          0,
          0,
        )
      }
      return next.getTime() < Date.now() ? new Date() : next
    })
  }

  function updateQuantity(lineId: string, value: string) {
    if (submissionPending.current || submitted.current) return
    setSelectedLines((current) =>
      updateSaleItemPickerLineQuantity(current, lineId, value),
    )
  }

  function addOffering(offering: OfferingRow) {
    if (submissionPending.current || submitted.current) return
    setError(null)
    setSelectedLines((lines) =>
      addSaleItemPickerLine({
        lineId: Crypto.randomUUID(),
        lines,
        offering,
      }),
    )
  }

  function removeOffering(lineId: string) {
    if (submissionPending.current || submitted.current) return
    setError(null)
    setSelectedLines((lines) => removeSaleItemPickerLine(lines, lineId))
  }

  function openItemPicker() {
    if (submissionPending.current || submitted.current) return
    Keyboard.dismiss()
    setError(null)
    const pages = catalog.data?.pages ?? []
    const choices = flattenSaleOfferings(
      pages.flatMap((page) => page.items),
      availability.data?.storeId,
      itemKind,
    )
    setPickerChoiceCount(Math.max(choices.length, pages[0]?.totalCount ?? 0))

    if (choicesLoading || choicesError || !availability.data?.storeId) {
      setPickerDraft([...selectedLines])
      setPickerVisible(true)
      return
    }

    openSaleItemPicker({
      choices,
      hasUnloadedChoices: Boolean(catalog.hasNextPage),
      onOpenScreen: () => {
        setPickerDraft([...selectedLines])
        setPickerVisible(true)
      },
      onOpenSheet: (loadedChoices) => {
        setCompactPickerChoices(loadedChoices)
        setCompactPickerVisible(true)
      },
    })
  }

  function closeFullScreenPicker() {
    setPickerVisible(false)
    setPickerDraft([])
    setProductSearch("")
  }

  function commitFullScreenPicker() {
    if (submissionPending.current || submitted.current) return
    setSelectedLines([...pickerDraft])
    setError(null)
    closeFullScreenPicker()
  }

  function proceedToCustomer() {
    if (submissionPending.current || submitted.current) return
    if (selectedRows.length === 0) {
      setError("Select at least one item and enter its quantity.")
      return
    }
    if (
      !Number.isSafeInteger(totalMinor) ||
      selectedRows.length !== selectedLines.length ||
      selectedRows.some((line) => line.totalMinor === null)
    ) {
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
    Keyboard.dismiss()
    setStep("customer")
  }

  function selectCustomer(customer: SelectedCustomer | null) {
    if (submissionPending.current || submitted.current) return
    Keyboard.dismiss()
    setSelectedCustomer(customer)
    setError(null)
    setStep("review")
  }

  function presentCustomerSheet() {
    if (submissionPending.current || submitted.current) return
    setCustomerDraft((current) => ({
      ...current,
      name: current.name || customerSearch.trim(),
    }))
    setCustomerDraftError(null)
    Keyboard.dismiss()
    if (customerPresentationTimer.current)
      clearTimeout(customerPresentationTimer.current)
    customerPresentationTimer.current = setTimeout(() => {
      customerPresentationTimer.current = null
      if (mounted.current && !submissionPending.current && !submitted.current)
        customerModal.present()
    }, CUSTOMER_SHEET_PRESENT_DELAY_MS)
  }

  async function saveCustomerDraft() {
    if (
      customerSavePending.current ||
      submissionPending.current ||
      submitted.current
    )
      return
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
    customerSavePending.current = true
    setIsSavingCustomer(true)
    setCustomerDraftError(null)
    try {
      if (isOffline) {
        selectCustomer({
          email: email || undefined,
          id: `offline:${name.toLowerCase()}:${phone || email}`,
          name,
          phone: phone || undefined,
        })
        setCustomerDraft({ email: "", name: "", phone: "" })
        customerModal.dismiss()
        return
      }
      const customer = await customerMutation.mutateAsync({
        email: email || undefined,
        name,
        phone: phone || undefined,
      })
      await Promise.all([
        queryClient.invalidateQueries(trpc.customers.count.queryFilter()),
        queryClient.invalidateQueries(trpc.customers.listPage.queryFilter()),
      ])
      selectCustomer({
        email: customer.email ?? undefined,
        id: customer.id,
        name: customer.name,
        phone: customer.phone ?? undefined,
      })
      setCustomerDraft({ email: "", name: "", phone: "" })
      customerModal.dismiss()
    } catch (failure) {
      setCustomerDraftError(
        failure instanceof Error ? failure.message : "Could not save customer.",
      )
    } finally {
      customerSavePending.current = false
      setIsSavingCustomer(false)
    }
  }

  async function refreshOrderQueries() {
    await Promise.all([
      queryClient.invalidateQueries(trpc.orders.list.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.listPage.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.customerCount.queryFilter()),
      queryClient.invalidateQueries(trpc.catalog.listItems.queryFilter()),
      queryClient.invalidateQueries(trpc.catalog.listItemsPage.queryFilter()),
      queryClient.invalidateQueries(trpc.inventory.balanceReport.queryFilter()),
      queryClient.invalidateQueries(trpc.customers.count.queryFilter()),
      queryClient.invalidateQueries(trpc.customers.listPage.queryFilter()),
      queryClient.invalidateQueries(trpc.services.queuePage.queryFilter()),
      queryClient.invalidateQueries(
        trpc.tenant.featureAvailability.queryFilter(),
      ),
    ])
  }

  async function submit() {
    if (submissionPending.current || submitted.current) return
    if (
      !Number.isSafeInteger(totalMinor) ||
      selectedRows.length !== selectedLines.length ||
      selectedRows.some((line) => line.totalMinor === null) ||
      new Set(selectedRows.map((line) => line.offering.currencyCode)).size > 1
    ) {
      setError(
        "Every selected line needs a valid quantity and price in the same currency.",
      )
      setStep("items")
      return
    }
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
    submissionPending.current = true
    setIsConfirming(true)
    Keyboard.dismiss()
    const fulfillNow = getSaleFulfillmentOption({
      deliveryDueAt,
      hasProductLines: selectedRows.some(
        (line) => line.offering.kind === "product_unit",
      ),
      now: new Date(),
      requested: fulfillNowRequested,
    }).fulfillNow
    try {
      if (isOffline) {
        queueCommand(
          buildOfflineOrderCommand({
            clientCommandId: orderClientId.current,
            customer: selectedCustomer,
            deliveryDueAt,
            fulfillNow,
            lines,
            payment:
              paymentSummary.receivedMinor > 0
                ? {
                    amountMinor: paymentSummary.receivedMinor,
                    clientPaymentId: paymentClientId.current,
                    method: paymentMethod,
                  }
                : undefined,
          }),
        )
        const result: CreateSaleCompletion = {
          amount: formatMinorMoney(totalMinor, currencyCode),
          customer: selectedCustomer?.name ?? "Guest customer",
          itemCount: selectedRows.length,
          paymentState: paymentSummary.paymentState,
          status: "queued",
        }
        submitted.current = true
        if (mounted.current) setCompletion(result)
        if (mounted.current) onComplete?.(result)
        return
      }

      const order = await orderMutation.mutateAsync({
        clientOrderId: orderClientId.current,
        deliveryDueAt,
        fulfillNow,
        initialPayment:
          paymentSummary.receivedMinor > 0
            ? {
                amountMinor: paymentSummary.receivedMinor,
                clientPaymentId: paymentClientId.current,
                method: paymentMethod,
              }
            : undefined,
        schemaVersion: 1,
        ...payload,
      })
      const result: CreateSaleCompletion = {
        amount: formatMinorMoney(totalMinor, currencyCode),
        customer: selectedCustomer?.name ?? "Guest customer",
        itemCount: selectedRows.length,
        paymentState: paymentSummary.paymentState,
        reference: order.orderNumber,
        status: "created",
      }
      submitted.current = true
      if (mounted.current) setCompletion(result)
      try {
        await refreshOrderQueries()
      } catch {
        if (mounted.current)
          setPostSubmitWarning(
            "Order recorded. Some lists could not refresh; reload them when connected.",
          )
      }
      if (mounted.current) onComplete?.(result)
    } catch (failure) {
      if (submitted.current || !mounted.current) return
      setError(
        failure instanceof Error ? failure.message : "Could not confirm order.",
      )
    } finally {
      submissionPending.current = false
      if (mounted.current) setIsConfirming(false)
    }
  }

  function fillDraft(
    ...[context, sequence]: Parameters<typeof createOrderFixture>
  ) {
    if (submissionPending.current || submitted.current) return
    const offering = getSelectableSaleItemChoices(allRows)[0]
    if (!offering) {
      setError("Add an eligible Product or Service before filling this draft.")
      return
    }
    quickFillSnapshot.current = {
      paymentMethod,
      selectedCustomer,
      selectedLines,
      step,
    }
    const fixture = createOrderFixture(context, sequence)
    setSelectedLines([{ id: Crypto.randomUUID(), offering, quantity: "1" }])
    setSelectedCustomer({
      id: `draft:${Crypto.randomUUID()}`,
      email: fixture.customerEmail,
      name: fixture.customerName,
      phone: fixture.customerPhone,
    })
    setPaymentMethod("cash")
    setStep("review")
    setCanUndoQuickFill(true)
    setError(null)
  }
  function undoFill() {
    if (submissionPending.current || submitted.current) return
    if (!quickFillSnapshot.current) return
    setPaymentMethod(quickFillSnapshot.current.paymentMethod)
    setSelectedCustomer(quickFillSnapshot.current.selectedCustomer)
    setSelectedLines(quickFillSnapshot.current.selectedLines)
    setStep(quickFillSnapshot.current.step)
    quickFillSnapshot.current = null
    setCanUndoQuickFill(false)
  }
  return {
    itemKind,
    actionsLocked: isSubmitting || completion !== null,
    completion,
    postSubmitWarning,
    isOffline,
    error,
    setError,
    amountReceived,
    setAmountReceived: guardEdit(setAmountReceived),
    paymentMethod,
    setPaymentMethod: guardEdit(setPaymentMethod),
    deliveryDueAt,
    deliveryPickerMode,
    setDeliveryPickerMode: guardEdit(setDeliveryPickerMode),
    setFulfillNowRequested: guardEdit(setFulfillNowRequested),
    changeDeliveryDueAt,
    selectedLines,
    selectedRows,
    selectedCustomer,
    step,
    setStep: guardEdit(setStep),
    focusedQuantityId,
    setFocusedQuantityId,
    totalMinor,
    currencyCode,
    paymentSummary,
    fulfillmentOption,
    allRows,
    choicesLoading,
    choicesError,
    retryChoices,
    addPickerChoice,
    removePickerLine,
    fetchNextChoices,
    customers,
    customersLoading,
    retryCustomers,
    loadedCustomers,
    customerSearch,
    setCustomerSearch: guardEdit(setCustomerSearch),
    showCustomerSearch,
    customerDraft,
    setCustomerDraft: guardEdit(setCustomerDraft),
    customerDraftError,
    setCustomerDraftError,
    isSavingCustomer,
    customerModal,
    compactPickerChoices,
    compactPickerVisible,
    setCompactPickerVisible,
    lineCountsByOfferingId,
    pickerDraft,
    pickerVisible,
    productSearch,
    setProductSearch: guardEdit(setProductSearch),
    pickerChoiceCount,
    updateQuantity,
    removeOffering,
    openItemPicker,
    addOffering,
    closeFullScreenPicker,
    commitFullScreenPicker,
    proceedToCustomer,
    selectCustomer,
    presentCustomerSheet,
    saveCustomerDraft,
    submit,
    isSubmitting,
    canUndoQuickFill,
    fillDraft,
    undoFill,
    catalog: {
      isLoading: catalog.isLoading,
      hasNextPage: catalog.hasNextPage,
      isFetchingNextPage: catalog.isFetchingNextPage,
      fetchNextPage: () => catalog.fetchNextPage(),
    },
    availability: { isLoading: availability.isLoading },
    recentOrders: {
      isPending: recentOrders.isPending,
      isError: recentOrders.isError,
      hasNextPage: recentOrders.hasNextPage,
      isFetchingNextPage: recentOrders.isFetchingNextPage,
      fetchNextPage: () => recentOrders.fetchNextPage(),
    },
    customerDirectory: {
      isPending: customerDirectory.isPending,
      isError: customerDirectory.isError,
      error: {
        message:
          customerDirectory.error?.message ?? "Saved customers unavailable",
      },
      hasNextPage: customerDirectory.hasNextPage,
      isFetchingNextPage: customerDirectory.isFetchingNextPage,
      fetchNextPage: () => customerDirectory.fetchNextPage(),
    },
    customerCount: { data: customerCount.data },
    directoryCustomerCount: { data: directoryCustomerCount.data },
  }
}
