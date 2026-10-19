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
  getSelectableSaleItemChoices,
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
import { classifyOperationFailure } from "@/lib/operation-failure"
import { useCheckoutPaymentAccountStore } from "@/store/checkoutPaymentAccountStore"
import { useOfflineCommandStore } from "@/store/offlineCommandStore"
import {
  isOfflineAccessAllowed,
  useOperationalModeStore,
} from "@/store/operationalModeStore"
import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import {
  type CatalogFreeLineDraft,
  type CatalogFreeLineKind,
  catalogFreeLinesError,
  catalogFreeLinesTotalMinor,
  catalogFreeOrderLines,
} from "@ewatrade/utils/catalog-free-lines"
import { rankBySearch } from "@ewatrade/utils/search-rank"
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
  type CheckoutAccountChoice,
  type CheckoutAccountRead,
  type CheckoutMoneyAccount,
  checkoutAccountForSubmit,
  resolveCheckoutAccount,
} from "./checkout-money-account-model"
import {
  type CreateSaleCompletion,
  type CreateSaleContentProps,
  type OfferingRow,
  type PaymentMethod,
  type SaleStep,
  type SelectedCustomer,
  flattenSaleOfferings,
} from "./create-sale-model"
import { buildSaleCustomerSuggestions } from "./sale-customer-suggestions"
import { saleUnitCount } from "./sale-unit-count"
import type { SaleSubmissionOutcome } from "./use-sale-activity"
import { useSaleFulfillment } from "./use-sale-fulfillment"

export function useCreateSale({
  initialCatalogItemId,
  initialOfferingId,
  initialCustomer,
  itemKind,
  onComplete,
  onRecorded,
}: CreateSaleContentProps) {
  const submissionPending = useRef(false)
  // The current checkout lifetime (set below) and the lifetime whose sale
  // settled. A settled sale only locks the draft of the owner who made it.
  const lifetimeRef = useRef<string | null>(null)
  const settledLifetime = useRef<string | null>(null)
  const submitted = {
    get current() {
      return (
        settledLifetime.current !== null &&
        settledLifetime.current === lifetimeRef.current
      )
    },
  }
  const mounted = useRef(true)
  const [isConfirming, setIsConfirming] = useState(false)
  const [completionState, setCompletionState] = useState<{
    lifetime: string
    value: CreateSaleCompletion
  } | null>(null)
  const [postSubmitWarning, setPostSubmitWarning] = useState<string | null>(
    null,
  )
  // Observation only (M11): one private object per accepted confirmation and
  // its authoritative or classified outcome, for the owner that made it.
  const [submissionState, setSubmissionState] = useState<{
    owner: string
    attempt: object
    outcome?: SaleSubmissionOutcome
  } | null>(null)
  // The operation identity whose last attempt ended with an unknown outcome:
  // a later rejection of that same operation can't prove it never applied.
  const priorUnknownOperation = useRef<string | null>(null)
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
  // Untouched (null) means on for eligible Product stock due now; an explicit
  // choice (on or off) is kept through steps and ineligible spells.
  const [fulfillPreference, setFulfillPreference] = useState<boolean | null>(
    null,
  )
  const fulfillNowRequested = fulfillPreference ?? true
  // Field-level catalog-free errors appear once Continue/Confirm is blocked.
  const [catalogFreeErrorsVisible, setCatalogFreeErrorsVisible] =
    useState(false)
  const [productSearch, setProductSearch] = useState("")
  const deferredCustomerSearch = useDeferredValue(customerSearch)
  const deferredProductSearch = useDeferredValue(productSearch)
  const [selectedLines, setSelectedLines] = useState<
    SaleItemPickerLine<OfferingRow>[]
  >([])
  // Typed-price lines (Quick sale / Additional cost) that skip the Catalog.
  const [catalogFreeLines, setCatalogFreeLines] = useState<
    CatalogFreeLineDraft[]
  >([])
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
  const profile = useAuthContext().profile
  const businessId = profile?.businessId
  const scopedStaff =
    profile?.staffAccessMode === "SCOPED" &&
    !["OWNER", "ADMIN"].includes(profile?.role?.toUpperCase() ?? "")
  const isOffline =
    offlineMode && isOfflineAccessAllowed(offlineAccessByBusinessId, businessId)

  const catalog = useInfiniteQuery(
    trpc.catalog.listItemsPage.infiniteQueryOptions(
      {
        kind: itemKind,
        limit: LIST_PAGE_SIZE,
        query: isOffline ? undefined : deferredProductSearch || undefined,
        // A to Z, like the Catalog.
        sort: { field: "name", direction: "asc" },
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
        enabled: !isOffline && !scopedStaff,
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
      enabled: !isOffline && !scopedStaff,
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
    // Offline: deep search over saved items, best match first.
    return rankBySearch(loadedRows, normalizedSearch, (row) => [
      { text: row.itemName },
      { text: row.displayName, weight: 0.9 },
      { text: row.offeringName, weight: 0.9 },
      { text: row.unitName, weight: 0.8 },
    ])
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
      (settledLifetime.current !== null &&
        settledLifetime.current === lifetimeRef.current) ||
      !allRows.some((row) => row.catalogItemId === initialCatalogItemId)
    )
      return
    initialCatalogSelectionApplied.current = true
    const lineId = Crypto.randomUUID()
    setSelectedLines((lines) =>
      selectInitialCatalogItemLine({
        catalogItemId: initialCatalogItemId,
        offeringId: initialOfferingId,
        choices: allRows,
        lineId,
        lines,
      }),
    )
  }, [
    allRows,
    initialCatalogItemId,
    initialOfferingId,
    selectedLines.length,
    step,
  ])
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
  const totalMinor =
    selectedRows.reduce((total, line) => total + (line.totalMinor ?? 0), 0) +
    catalogFreeLinesTotalMinor(catalogFreeLines)
  const currencyCode =
    selectedRows[0]?.offering.currencyCode ?? profile?.currencyCode ?? "NGN"
  const hasSaleLines = selectedRows.length + catalogFreeLines.length > 0
  const saleUnits = [
    ...selectedRows.map((row) => row.quantity),
    ...catalogFreeLines
      .filter((line) => line.kind === "quick_sale")
      .map(() => "1"),
  ]
  const paymentSummary = salePaymentSummary(totalMinor, amountReceived)
  // Destination Money Account (M05). The read, any choice and every retained
  // handler belong to one checkout lifetime: actor, business, profile Store,
  // role, access mode and data-cache generation (so A→B→A is a new lifetime).
  const checkoutStoreId = profile?.storeId
  const storeAgrees =
    Boolean(checkoutStoreId) && availability.data?.storeId === checkoutStoreId
  const checkoutOwner = JSON.stringify([
    profile?.id ?? null,
    businessId ?? null,
    checkoutStoreId ?? null,
    profile?.role ?? null,
    profile?.staffAccessMode ?? null,
    getDataCacheGeneration(),
  ])
  const checkoutOwnerRef = lifetimeRef
  checkoutOwnerRef.current = checkoutOwner
  // A completion is only ever shown to the lifetime that recorded it.
  const completion =
    completionState?.lifetime === checkoutOwner ? completionState.value : null
  const paymentAccountOptions = trpc.orders.paymentAccounts.queryOptions()
  const paymentAccountCacheArgs = {
    ...paymentAccountOptions.queryKey[1],
    // Cache ownership only; tRPC's path/input tuple stays intact.
    checkoutOwner: {
      actorId: profile?.id,
      businessId,
      storeId: checkoutStoreId,
    },
  }
  const basePaymentAccountsQuery = paymentAccountOptions.queryFn
  const paymentAccounts = useQuery({
    ...paymentAccountOptions,
    queryKey: [paymentAccountOptions.queryKey[0], paymentAccountCacheArgs],
    // Capture the owner partition before this exact request; record only a
    // valid fresh answer for it, and forget it on an explicit denial. Network
    // failures leave any earlier snapshot alone.
    // A queryFn retained from an older lifetime never captures, records or
    // forgets anything for whoever is signed in now.
    queryFn: basePaymentAccountsQuery
      ? async (context) => {
          const queryLifetime = checkoutOwner
          const current = () => queryLifetime === checkoutOwnerRef.current
          if (!current())
            throw new Error("This account read belongs to another session.")
          const ticket = useCheckoutPaymentAccountStore
            .getState()
            .capture(currencyCode)
          try {
            const data = await basePaymentAccountsQuery(context)
            if (ticket && current())
              useCheckoutPaymentAccountStore.getState().record(ticket, data)
            return data
          } catch (failure) {
            const code = (failure as { data?: { code?: string } } | null)?.data
              ?.code
            if (
              ticket &&
              current() &&
              (code === "FORBIDDEN" || code === "UNAUTHORIZED")
            )
              useCheckoutPaymentAccountStore.getState().forget(ticket)
            throw failure
          }
        }
      : undefined,
    enabled:
      !isOffline && Boolean(profile?.id && businessId && checkoutStoreId),
    refetchOnMount: "always",
    retry: false,
  })
  const paymentAccountCode = (
    paymentAccounts.error as { data?: { code?: string } } | null
  )?.data?.code
  // Only a settled read from this mount, for the profile's own Store and in
  // this sale's currency, may supply a destination.
  const accountRead: CheckoutAccountRead = paymentAccounts.isError
    ? {
        status:
          paymentAccountCode === "FORBIDDEN" ||
          paymentAccountCode === "UNAUTHORIZED"
            ? "denied"
            : "error",
      }
    : !storeAgrees ||
        !paymentAccounts.isFetchedAfterMount ||
        paymentAccounts.isFetching ||
        !paymentAccounts.data
      ? { status: "loading" }
      : paymentAccounts.data.book &&
          paymentAccounts.data.book.currencyCode !== currencyCode
        ? { status: "error" }
        : {
            status: "ready",
            book: paymentAccounts.data.book,
            accounts: paymentAccounts.data.accounts,
          }
  const [accountChoice, setAccountChoice] =
    useState<CheckoutAccountChoice | null>(null)
  // Offline: only this owner's previously checked snapshot for this currency
  // (subscribed so a fresh record re-renders; read() applies scope fences).
  useCheckoutPaymentAccountStore((state) => state.snapshots)
  const offlineSnapshot = isOffline
    ? (useCheckoutPaymentAccountStore.getState().read(currencyCode)?.data ??
      null)
    : null
  const accountState = resolveCheckoutAccount({
    receivedMinor: paymentSummary.receivedMinor,
    method: paymentMethod,
    offline: isOffline,
    read: accountRead,
    owner: checkoutOwner,
    choice: accountChoice,
    offlineSnapshot,
  })
  const accountStateRef = useRef(accountState)
  accountStateRef.current = accountState
  // Every fact the submit sends. A retained submit from an older draft (other
  // amount, method, lines, customer or delivery) is inert.
  const submitDraftKey = JSON.stringify([
    // Online vs offline is part of the operation: a click from the other
    // mode (order vs queued command) is retired.
    isOffline,
    amountReceived,
    paymentMethod,
    selectedRows.map((row) => [row.offering.id, row.quantity]),
    catalogFreeLines,
    selectedCustomer?.id ?? null,
    selectedCustomer?.directoryId ?? null,
    deliveryDueAt.toISOString(),
    fulfillNowRequested,
  ])
  const submitDraftKeyRef = useRef(submitDraftKey)
  submitDraftKeyRef.current = submitDraftKey
  // Idempotency ids belong to one lifetime: retries reuse them, another
  // owner's sale never does.
  const clientIdsLifetime = useRef<string | null>(null)
  const chooseAccount = (account: CheckoutMoneyAccount) => {
    // A row handler from an earlier lifetime or read is inert.
    if (checkoutOwner !== checkoutOwnerRef.current) return
    const current = accountStateRef.current
    if (
      !("eligible" in current) ||
      !current.eligible.some((entry) => entry.id === account.id)
    )
      return
    setAccountChoice({
      owner: checkoutOwner,
      id: account.id,
      name: account.name,
    })
  }
  // Catalog-free lines have nothing to pick, so they can be handed over now too.
  const hasFulfillableLines =
    catalogFreeLines.length > 0 ||
    selectedRows.some((line) => line.offering.kind === "product_unit")
  const fulfillmentOption = useSaleFulfillment({
    deliveryDueAt,
    hasProductLines: hasFulfillableLines,
    requested: fulfillNowRequested,
  })
  const loadedCustomers = useMemo(
    () =>
      buildSaleCustomerSuggestions(
        recentOrders.data?.pages.flatMap((page) => page.items) ?? [],
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
      (!scopedStaff && customerDirectory.isPending) ||
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
    if (!scopedStaff) void customerDirectory.refetch()
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

  function addCatalogFreeLine(kind: CatalogFreeLineKind) {
    if (submissionPending.current || submitted.current) return
    setError(null)
    setCatalogFreeLines((lines) => [
      ...lines,
      { amount: "", description: "", id: Crypto.randomUUID(), kind },
    ])
  }

  function updateCatalogFreeLine(
    lineId: string,
    patch: Partial<Pick<CatalogFreeLineDraft, "amount" | "description">>,
  ) {
    if (submissionPending.current || submitted.current) return
    setCatalogFreeLines((lines) =>
      lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    )
  }

  function removeCatalogFreeLine(lineId: string) {
    if (submissionPending.current || submitted.current) return
    setError(null)
    setCatalogFreeLines((lines) => lines.filter((line) => line.id !== lineId))
  }

  function proceedToCustomer() {
    if (submissionPending.current || submitted.current) return
    if (!hasSaleLines) {
      setError("Add an item, or type a price to sell without the catalog.")
      return
    }
    const catalogFreeError = catalogFreeLinesError(catalogFreeLines)
    if (catalogFreeError) {
      setError(catalogFreeError)
      setCatalogFreeErrorsVisible(true)
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
    Keyboard.dismiss()
    setStep("customer")
  }

  function selectCustomer(customer: SelectedCustomer | null, advance = true) {
    if (submissionPending.current || submitted.current) return
    Keyboard.dismiss()
    setSelectedCustomer(customer)
    setError(null)
    if (advance) setStep("review")
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
      if (isOffline || scopedStaff) {
        // Scoped staff capture the order contact snapshot without reading or
        // creating a business-wide Customer directory identity.
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
        queryClient.invalidateQueries(trpc.customers.listPage.pathFilter()),
      ])
      selectCustomer({
        email: customer.email ?? undefined,
        directoryId: customer.id,
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
      queryClient.invalidateQueries(trpc.orders.listPage.pathFilter()),
      queryClient.invalidateQueries(trpc.orders.customerCount.queryFilter()),
      queryClient.invalidateQueries(trpc.catalog.listItems.queryFilter()),
      queryClient.invalidateQueries(trpc.catalog.listItemsPage.pathFilter()),
      queryClient.invalidateQueries(trpc.inventory.balanceReport.queryFilter()),
      queryClient.invalidateQueries(trpc.customers.count.queryFilter()),
      queryClient.invalidateQueries(trpc.customers.listPage.pathFilter()),
      queryClient.invalidateQueries(trpc.services.queuePage.pathFilter()),
      queryClient.invalidateQueries(
        trpc.tenant.featureAvailability.queryFilter(),
      ),
    ])
  }

  async function submit() {
    if (submissionPending.current || submitted.current) return
    // A handler from an older draft or lifetime never sends anything.
    if (
      submitDraftKey !== submitDraftKeyRef.current ||
      checkoutOwner !== checkoutOwnerRef.current
    )
      return
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
    const catalogFreeError = catalogFreeLinesError(catalogFreeLines)
    if (catalogFreeError) {
      setError(catalogFreeError)
      setCatalogFreeErrorsVisible(true)
      setStep("items")
      return
    }
    if (paymentSummary.error) {
      setError(paymentSummary.error)
      return
    }
    // Validate at invocation: this handler's lifetime must still be current
    // and the *current* account read must still allow this destination.
    const submitLifetime = checkoutOwner
    const currentAccount = accountStateRef.current
    const destination = checkoutAccountForSubmit(currentAccount)
    if (!destination.ok || submitLifetime !== checkoutOwnerRef.current) {
      setError("Choose where the money goes before confirming.")
      return
    }
    const moneyAccountName =
      currentAccount.kind === "selected"
        ? currentAccount.account.name
        : undefined
    if (clientIdsLifetime.current !== submitLifetime) {
      if (clientIdsLifetime.current !== null) {
        orderClientId.current = `order-${Crypto.randomUUID()}`
        paymentClientId.current = `payment-${Crypto.randomUUID()}`
      }
      clientIdsLifetime.current = submitLifetime
    }
    const catalogLines = selectedRows.flatMap(
      ({ offering, quantity, totalMinor }) =>
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
    const lines = [...catalogLines, ...catalogFreeOrderLines(catalogFreeLines)]
    if (lines.length === 0) {
      setError("Select at least one item and enter its quantity.")
      setStep("items")
      return
    }

    const payload = {
      customerId: selectedCustomer?.directoryId,
      customerEmail: selectedCustomer?.email,
      customerName: selectedCustomer?.name,
      customerPhone: selectedCustomer?.phone,
      lines,
    }
    setError(null)
    submissionPending.current = true
    setIsConfirming(true)
    const attempt = {}
    setSubmissionState({ owner: submitLifetime, attempt })
    Keyboard.dismiss()
    const fulfillNow = getSaleFulfillmentOption({
      deliveryDueAt,
      hasProductLines: hasFulfillableLines,
      now: new Date(),
      requested: fulfillNowRequested,
    }).fulfillNow
    try {
      if (isOffline) {
        queueCommand({
          displayTotal: { amountMinor: totalMinor, currencyCode },
          ...buildOfflineOrderCommand({
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
                    // From the saved snapshot; checked again when it syncs.
                    moneyAccountId: destination.id,
                  }
                : undefined,
          }),
        })
        const result: CreateSaleCompletion = {
          amount: formatMinorMoney(totalMinor, currencyCode),
          customer: selectedCustomer?.name ?? "Guest customer",
          itemCount: selectedRows.length + catalogFreeLines.length,
          paymentState: paymentSummary.paymentState,
          paymentMethod:
            paymentSummary.receivedMinor > 0 ? paymentMethod : undefined,
          unitCount: saleUnitCount(saleUnits),
          balance: formatMinorMoney(
            paymentSummary.balanceDueMinor,
            currencyCode,
          ),
          // The account chosen for the money received; none when pending.
          moneyAccount:
            paymentSummary.receivedMinor > 0 ? moneyAccountName : undefined,
          status: "queued",
        }
        settledLifetime.current = submitLifetime
        if (mounted.current) {
          setCompletionState({ lifetime: submitLifetime, value: result })
          setSubmissionState({
            owner: submitLifetime,
            attempt,
            outcome: "queued",
          })
        }
        if (mounted.current) onRecorded?.(result)
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
                moneyAccountId: destination.id,
              }
            : undefined,
        schemaVersion: 1,
        ...payload,
      })
      const result: CreateSaleCompletion = {
        amount: formatMinorMoney(totalMinor, currencyCode),
        customer: selectedCustomer?.name ?? "Guest customer",
        itemCount: selectedRows.length + catalogFreeLines.length,
        paymentState: paymentSummary.paymentState,
        paymentMethod:
          paymentSummary.receivedMinor > 0 ? paymentMethod : undefined,
        unitCount: saleUnitCount(saleUnits),
        balance: formatMinorMoney(paymentSummary.balanceDueMinor, currencyCode),
        reference: order.orderNumber,
        orderId: order.id,
        moneyAccount:
          paymentSummary.receivedMinor > 0 ? moneyAccountName : undefined,
        status: "created",
      }
      // Settled for the lifetime that made it (never resubmitted there), but
      // another owner/lifetime is not shown it, locked by it or called back.
      settledLifetime.current = submitLifetime
      const present = () =>
        mounted.current && submitLifetime === checkoutOwnerRef.current
      if (mounted.current) {
        setCompletionState({ lifetime: submitLifetime, value: result })
        setSubmissionState({ owner: submitLifetime, attempt, outcome: "saved" })
      }
      if (present()) onRecorded?.(result)
      try {
        await refreshOrderQueries()
      } catch {
        if (present())
          setPostSubmitWarning(
            "Order recorded. Some lists could not refresh; reload them when connected.",
          )
      }
      if (present()) onComplete?.(result)
    } catch (failure) {
      if (
        settledLifetime.current === submitLifetime ||
        !mounted.current ||
        submitLifetime !== checkoutOwnerRef.current
      )
        return
      // Only a structured rejection proves this attempt failed; a lost
      // response stays unknown, as does any later retry of that operation.
      const operation = orderClientId.current
      const unknown =
        classifyOperationFailure(failure, {
          previousOutcomeUnknown: priorUnknownOperation.current === operation,
        }) === "unknown"
      if (unknown) priorUnknownOperation.current = operation
      setSubmissionState({
        owner: submitLifetime,
        attempt,
        outcome: unknown ? "unknown" : "failed",
      })
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
    /** The current owner's latest confirmation attempt (observation only). */
    submission:
      submissionState?.owner === checkoutOwner
        ? {
            attempt: submissionState.attempt,
            outcome: submissionState.outcome,
          }
        : null,
    postSubmitWarning,
    isOffline,
    error,
    setError,
    amountReceived,
    setAmountReceived: guardEdit(setAmountReceived),
    paymentMethod,
    setPaymentMethod: guardEdit(setPaymentMethod),
    accountState,
    chooseAccount: (account: CheckoutMoneyAccount) => {
      if (!submissionPending.current && !submitted.current)
        chooseAccount(account)
    },
    accountBlocksConfirm: !checkoutAccountForSubmit(accountState).ok,
    paymentAccountList:
      accountRead.status === "ready" && accountRead.book
        ? accountRead.accounts
        : [],
    retryPaymentAccounts: () => {
      if (!isOffline) void paymentAccounts.refetch()
    },
    deliveryDueAt,
    deliveryPickerMode,
    setDeliveryPickerMode: guardEdit(setDeliveryPickerMode),
    setFulfillNowRequested: guardEdit<boolean | null>(setFulfillPreference),
    catalogFreeErrorsVisible,
    changeDeliveryDueAt,
    selectedLines,
    selectedRows,
    catalogFreeLines,
    hasSaleLines,
    saleUnits,
    addCatalogFreeLine,
    updateCatalogFreeLine,
    removeCatalogFreeLine,
    selectedCustomer,
    step,
    setStep: guardEdit(setStep),
    totalMinor,
    currencyCode,
    paymentSummary,
    fulfillmentOption,
    allRows,
    choicesLoading,
    choicesError,
    retryChoices,
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
    productSearch,
    setProductSearch: guardEdit(setProductSearch),
    updateQuantity,
    removeOffering,
    addOffering,
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
      isPending: !scopedStaff && customerDirectory.isPending,
      isError: !scopedStaff && customerDirectory.isError,
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
