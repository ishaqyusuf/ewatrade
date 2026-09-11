import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { TRPCClientError } from "@trpc/client"
import { canManageMobileOperations } from "@/lib/mobile-roles"
import type { CatalogVariantDraft } from "./catalog-variant-model"
import type { KeyboardInlineComposerPill } from "@/components/mobile/keyboard-inline-composer"
import { useModal } from "@/components/ui/modal"
import { useAuthContext } from "@/hooks/use-auth"
import { createCatalogFixture } from "@/internal-tooling/fixture-recipes"
import { getCatalogItemSaveReadiness } from "@/lib/catalog-item-save-readiness"
import { resolveCatalogOptionUnitPriceMinor } from "@/lib/catalog-option-pricing"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import {
  type CatalogSetupHelper,
  type CatalogUnitRelationDirection,
  buildCatalogSetupHelperApplication,
  buildCatalogVariantCombinations,
  catalogUnitFactorToRelation,
  catalogUnitRelationToFactor,
  findBusinessProfile,
  findCatalogSetupHelper,
  getCatalogSetupReplacementAction,
  isCatalogFixedPriceMissing,
  majorToMinor,
  transposeCatalogUnitRelation,
} from "@ewatrade/utils"
import { EXACT_CANONICAL_MAX_SCALE } from "@ewatrade/utils/exact-decimal"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Keyboard, type TextInput } from "react-native"
import {
  type CatalogItemKind,
  type SimpleCatalogItemScreenProps,
  type MobileOptionGroup,
  type MobileUnitDraft,
  type VariantComposerMode,
  VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT,
  DEFAULT_UNIT_TRANSACTION_SCALE,
  PRODUCT_VARIANT_TYPES,
  SERVICE_OPTION_TYPES,
  getVariantValueSuggestions,
  newUnit,
  unitKey,
  catalogCreateErrorMessage,
  requirePriceMinor,
  getExactOpeningStock,
} from "./catalog-setup-model"

type SetupConfirmation =
  | { kind: "replace"; helper: CatalogSetupHelper | null }
  | { kind: "options" }
  | { kind: "option-pricing" }
  | { kind: "remove-options" }
  | { kind: "remove-unit"; id: string; name: string }
  | { kind: "remove-units" }
  | { kind: "remove-group"; id: string; name: string }

type SetupCommand =
  | { mode: "simple"; input: RouterInputs["catalog"]["createSimpleItem"] }
  | { mode: "advanced"; input: RouterInputs["catalog"]["createItem"] }
type SetupAttempt = SetupCommand & {
  businessId: string
  userId: string
  storeId: string
}

export function useCatalogSetup({
  initialKind,
  onComplete,
}: SimpleCatalogItemScreenProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const canManage = canManageMobileOperations(profile?.role)
  const busy = useRef(false)
  const completed = useRef(false)
  const mounted = useRef(true)
  const attempt = useRef<SetupAttempt | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [completion, setCompletion] = useState<{
    kind: CatalogItemKind
    name: string
  } | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftScope = useRef<{
    businessId: string | undefined
    userId: string | undefined
    storeId: string | undefined
  }>({
    businessId: profile?.businessId,
    userId: profile?.id,
    storeId: undefined,
  })
  const availability = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, {
      enabled: canManage && !isOffline,
      retry: false,
    }),
  )
  const activeStoreId = availability.data?.storeId
  if (
    !draftScope.current.storeId &&
    draftScope.current.businessId === profile?.businessId &&
    draftScope.current.userId === profile?.id &&
    activeStoreId
  )
    draftScope.current.storeId = activeStoreId
  const scopeChanged =
    draftScope.current.businessId !== profile?.businessId ||
    draftScope.current.userId !== profile?.id ||
    Boolean(
      draftScope.current.storeId &&
        activeStoreId &&
        draftScope.current.storeId !== activeStoreId,
    )
  const currentScope = useRef({
    businessId: profile?.businessId,
    userId: profile?.id,
    storeId: activeStoreId,
    canManage,
    offline: isOffline,
    scopeChanged,
  })
  currentScope.current = {
    businessId: profile?.businessId,
    userId: profile?.id,
    storeId: activeStoreId,
    canManage,
    offline: isOffline,
    scopeChanged,
  }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (focusTimer.current) clearTimeout(focusTimer.current)
    }
  }, [])
  function editsLocked() {
    return (
      busy.current ||
      completed.current ||
      Boolean(attempt.current) ||
      !currentScope.current.canManage ||
      currentScope.current.scopeChanged
    )
  }
  function guardEdit<T>(setter: Dispatch<SetStateAction<T>>) {
    return (value: SetStateAction<T>) => {
      if (!editsLocked()) setter(value)
    }
  }
  const replacementModal = useModal()
  const [confirmation, setConfirmation] = useState<SetupConfirmation | null>(
    null,
  )
  const afterConfirmationDismissal = useRef<(() => void) | null>(null)
  const confirmationFrame = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (confirmationFrame.current !== null)
        cancelAnimationFrame(confirmationFrame.current)
      afterConfirmationDismissal.current = null
    },
    [],
  )
  function requestConfirmation(next: SetupConfirmation) {
    if (editsLocked()) return
    Keyboard.dismiss()
    setConfirmation(next)
    if (confirmationFrame.current !== null)
      cancelAnimationFrame(confirmationFrame.current)
    confirmationFrame.current = requestAnimationFrame(() => {
      confirmationFrame.current = null
      if (mounted.current && !editsLocked()) replacementModal.present()
    })
  }
  const clientOperationIdRef = useRef(Crypto.randomUUID())
  const qaSnapshotRef = useRef<{
    activeGroupId: string | null
    additionalUnits: MobileUnitDraft[]
    canonicalTransactionScale: number
    composerText: string
    defaultQuoteRequired: boolean
    description: string
    editingGroupId: string | null
    helperPickerOpen: boolean
    multiplePriceOptions: boolean
    name: string
    openingStock: string
    optionGroups: MobileOptionGroup[]
    pendingHelperReplacement: { helper: CatalogSetupHelper | null } | null
    price: string
    selectedHelperKey: string | null
    serviceAuthorization:
      | "after_required_payment"
      | "manual_release"
      | "on_order_confirmation"
    serviceGuidance: string
    serviceQuantityScale: number
    showAdvanced: boolean
    showDescription: boolean
    showOpeningStock: boolean
    trackServiceWork: boolean
    unitEditorDraft: MobileUnitDraft | null
    unitEditorError: string | null
    unitName: string
    variantComposerMode: VariantComposerMode | null
    variantDrafts: Record<string, CatalogVariantDraft>
  } | null>(null)
  const variantComposerInputRef = useRef<TextInput>(null)
  const [kind, setKind] = useState<CatalogItemKind | null>(initialKind ?? null)
  const [helperPickerOpen, setHelperPickerOpen] = useState(false)
  const [pendingHelperReplacement, setPendingHelperReplacement] = useState<{
    helper: CatalogSetupHelper | null
  } | null>(null)
  const [selectedHelperKey, setSelectedHelperKey] = useState<string | null>(
    null,
  )
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [multiplePriceOptions, setMultiplePriceOptions] = useState(false)
  const [unitName, setUnitName] = useState("")
  const [openingStock, setOpeningStock] = useState("")
  const [description, setDescription] = useState("")
  const [showOpeningStock, setShowOpeningStock] = useState(false)
  const [showDescription, setShowDescription] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [canonicalTransactionScale, setCanonicalTransactionScale] = useState(
    DEFAULT_UNIT_TRANSACTION_SCALE,
  )
  const [trackServiceWork, setTrackServiceWork] = useState(false)
  const [defaultQuoteRequired, setDefaultQuoteRequired] = useState(false)
  const [serviceAuthorization, setServiceAuthorization] = useState<
    "after_required_payment" | "manual_release" | "on_order_confirmation"
  >("on_order_confirmation")
  const [serviceQuantityScale, setServiceQuantityScale] = useState(0)
  const [serviceGuidance, setServiceGuidance] = useState("")
  const [optionGroups, setOptionGroups] = useState<MobileOptionGroup[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [variantComposerMode, setVariantComposerMode] =
    useState<VariantComposerMode | null>(null)
  const [composerText, setComposerText] = useState("")
  const [variantDrafts, setVariantDrafts] = useState<
    Record<string, CatalogVariantDraft>
  >({})
  const [additionalUnits, setAdditionalUnits] = useState<MobileUnitDraft[]>([])
  const [unitEditorDraft, setUnitEditorDraft] =
    useState<MobileUnitDraft | null>(null)
  const [unitEditorError, setUnitEditorError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const currencyCode = profile?.currencyCode ?? "NGN"
  const storesQuery = useQuery(
    trpc.tenant.stores.queryOptions(undefined, {
      enabled: canManage && !isOffline,
      retry: false,
    }),
  )
  const stores = canManage && !scopeChanged ? (storesQuery.data ?? []) : []
  const isEditingUnit = unitEditorDraft
    ? additionalUnits.some((unit) => unit.id === unitEditorDraft.id)
    : false
  const businessProfileKey =
    stores.find((store) => store.id === activeStoreId)?.businessProfileKey ??
    null
  const businessProfile = findBusinessProfile(businessProfileKey)
  const selectedHelper = selectedHelperKey
    ? findCatalogSetupHelper(selectedHelperKey)
    : undefined
  const variantIdentities = useRef(new Map<string, string>())
  const optionCount = optionGroups.reduce(
    (count, group) => count * group.values.length,
    1,
  )
  const optionIssue =
    optionGroups.length > 12
      ? "Use no more than 12 option groups."
      : optionGroups.some((group) => group.values.length > 100)
        ? "Use no more than 100 values in an option group."
        : optionGroups.length > 0 && optionCount > 96
          ? "Keep the item within 96 option combinations. Remove a group or some values."
          : null
  const normalizedOptionGroups = useMemo(
    () =>
      optionGroups.map((group) => ({
        key: group.id,
        name: group.name.trim(),
        values: group.values.map((value) => ({
          key: value.id,
          label: value.label,
        })),
      })),
    [optionGroups],
  )
  const combinations = useMemo(
    () =>
      optionIssue
        ? []
        : buildCatalogVariantCombinations(normalizedOptionGroups).map(
            (combination) => {
              const signature = combination.selections
                .map(
                  (selection) => `${selection.groupKey}:${selection.valueKey}`,
                )
                .sort()
                .join("|")
              let key = variantIdentities.current.get(signature)
              if (!key) {
                key = Crypto.randomUUID()
                variantIdentities.current.set(signature, key)
              }
              return { ...combination, key }
            },
          ),
    [normalizedOptionGroups, optionIssue],
  )
  const activeGroup = optionGroups.find((group) => group.id === activeGroupId)
  const inlineVariantTypeSuggestions = useMemo(() => {
    const knownOptionTypes =
      kind === "service" ? SERVICE_OPTION_TYPES : PRODUCT_VARIANT_TYPES
    const defaultSuggestions = knownOptionTypes.slice(
      0,
      VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT,
    )
    const normalizedSearch = composerText.trim().toLowerCase()

    if (!normalizedSearch) return defaultSuggestions

    const matches = knownOptionTypes
      .filter((variantType) =>
        variantType.toLowerCase().includes(normalizedSearch),
      )
      .slice(0, VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT)

    return matches.length > 0 ? matches : defaultSuggestions
  }, [composerText, kind])
  const availableVariantValueSuggestions = useMemo(() => {
    if (!activeGroup || !kind) return []

    const selectedValues = new Set(
      activeGroup.values.map((value) => value.label.trim().toLowerCase()),
    )
    const suggestions = getVariantValueSuggestions(
      activeGroup.name,
      kind,
    ).filter((value) => !selectedValues.has(value.trim().toLowerCase()))
    const defaultSuggestions = suggestions.slice(
      0,
      VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT,
    )
    const normalizedSearch = composerText.trim().toLowerCase()

    if (!normalizedSearch) return defaultSuggestions

    const matches = suggestions
      .filter((value) => value.toLowerCase().includes(normalizedSearch))
      .slice(0, VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT)

    return matches.length > 0 ? matches : defaultSuggestions
  }, [activeGroup, composerText, kind])
  const composerPills = useMemo<KeyboardInlineComposerPill[]>(() => {
    if (variantComposerMode === "variant-type") {
      return inlineVariantTypeSuggestions.map((variantType) => ({
        id: `type-${variantType}`,
        label: variantType,
      }))
    }

    if (variantComposerMode === "variant-value" && activeGroup) {
      return [
        ...activeGroup.values.map((value) => ({
          id: value.id,
          label: value.label,
          removable: true,
          selected: true,
        })),
        ...availableVariantValueSuggestions.map((value) => ({
          id: `value-${activeGroup.id}-${value}`,
          label: value,
        })),
      ]
    }

    return []
  }, [
    activeGroup,
    availableVariantValueSuggestions,
    inlineVariantTypeSuggestions,
    variantComposerMode,
  ])
  const createItemMutation = useMutation(
    trpc.catalog.createSimpleItem.mutationOptions(),
  )
  const createAdvancedMutation = useMutation(
    trpc.catalog.createItem.mutationOptions(),
  )
  const defaultStoreId = stores.find(
    (store) => store.id === draftScope.current.storeId,
  )?.id
  const storesLoading =
    !isOffline && canManage && (availability.isPending || storesQuery.isPending)
  const storesError =
    availability.error?.message ?? storesQuery.error?.message ?? null
  const storeReady = Boolean(
    defaultStoreId &&
      activeStoreId === defaultStoreId &&
      !storesError &&
      !storesLoading,
  )
  function retryStores() {
    if (isOffline || busy.current || !canManage) return
    void availability.refetch()
    void storesQuery.refetch()
  }
  function attemptScopeMatches(request: SetupAttempt) {
    const scope = currentScope.current
    return (
      scope.businessId === request.businessId &&
      scope.userId === request.userId &&
      scope.storeId === request.storeId &&
      scope.canManage &&
      !scope.scopeChanged
    )
  }
  async function executeAttempt(request: SetupAttempt) {
    if (busy.current || completed.current || !mounted.current) return
    if (currentScope.current.offline || !attemptScopeMatches(request)) {
      setSubmitError(
        "Reconnect with the original business, Store and account before retrying this item.",
      )
      return
    }
    busy.current = true
    attempt.current = request
    setIsSaving(true)
    setSubmitError(null)
    Keyboard.dismiss()
    try {
      if (request.mode === "simple")
        await createItemMutation.mutateAsync(request.input)
      else await createAdvancedMutation.mutateAsync(request.input)
    } catch (error) {
      // BAD_REQUEST rejects validation within the atomic Catalog transaction.
      // Unknown transport outcomes retain the exact request for safe retry.
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "BAD_REQUEST"
      )
        attempt.current = null
      busy.current = false
      if (mounted.current) {
        setIsSaving(false)
        setSubmitError(
          catalogCreateErrorMessage(
            error instanceof Error
              ? error.message
              : "Item creation was not confirmed. Retry the same request.",
          ),
        )
      }
      return
    }
    completed.current = true
    const result = { kind: request.input.kind, name: request.input.name }
    if (mounted.current) setCompletion(result)
    // A successful create stays successful even when follow-up reads fail.
    try {
      await Promise.all([
        queryClient.invalidateQueries({
          ...trpc.catalog.listItems.queryFilter(),
          refetchType: "all",
        }),
        queryClient.invalidateQueries({
          ...trpc.catalog.listItemsPage.queryFilter(),
          refetchType: "all",
        }),
        queryClient.invalidateQueries({
          ...trpc.tenant.featureAvailability.queryFilter(),
          refetchType: "all",
        }),
      ])
    } catch {
      if (mounted.current)
        setSaveNotice("Item saved. Refresh the Catalog to see the latest list.")
    }
    busy.current = false
    if (mounted.current) {
      setIsSaving(false)
      if (attemptScopeMatches(request)) {
        try {
          onComplete?.(result)
        } catch {
          setSaveNotice("Item saved. Return to the Catalog to continue.")
        }
      }
    }
  }
  function dispatchCreate(command: SetupCommand) {
    const businessId = profile?.businessId
    const userId = profile?.id
    if (
      !businessId ||
      !userId ||
      !defaultStoreId ||
      !storeReady ||
      !canManage ||
      scopeChanged
    ) {
      setSubmitError(
        "A current Store and Catalog management permission are required.",
      )
      return
    }
    void executeAttempt({
      ...command,
      businessId,
      userId,
      storeId: defaultStoreId,
    })
  }
  const dispatchSimple = (input: RouterInputs["catalog"]["createSimpleItem"]) =>
    dispatchCreate({
      mode: "simple",
      input: { ...input, storeId: defaultStoreId },
    })
  const dispatchAdvanced = (input: RouterInputs["catalog"]["createItem"]) =>
    dispatchCreate({
      mode: "advanced",
      input: { ...input, storeId: defaultStoreId },
    })

  const makeDefaultVariantDraft = (): CatalogVariantDraft => ({
    barcode: "",
    description: "",
    enabled: true,
    imageUrl: "",
    price: "",
    quantity: "",
    quoteRequired: defaultQuoteRequired,
    sku: "",
    storeIds: defaultStoreId ? [defaultStoreId] : [],
    unitPrices: {},
  })

  const variantDraft = (key: string): CatalogVariantDraft =>
    variantDrafts[key] ?? {
      ...makeDefaultVariantDraft(),
    }

  const hasStructuralDraft = () =>
    selectedHelperKey !== null ||
    showAdvanced ||
    showOpeningStock ||
    trackServiceWork ||
    additionalUnits.length > 0 ||
    Object.keys(variantDrafts).length > 0 ||
    openingStock.trim().length > 0 ||
    (kind === "product" && unitName.trim().length > 0) ||
    serviceGuidance.trim().length > 0 ||
    optionGroups.some(
      (group) =>
        group.name.trim() || group.values.some((value) => value.label.trim()),
    )

  const commitHelper = (helper: CatalogSetupHelper | null) => {
    if (editsLocked()) return
    if (helper && helper.kind !== kind) return

    setSubmitError(null)
    setSelectedHelperKey(helper?.key ?? null)
    setVariantDrafts({})
    setActiveGroupId(null)
    setVariantComposerMode(null)
    setComposerText("")
    setServiceGuidance("")
    setDefaultQuoteRequired(false)
    setOpeningStock("")
    setShowOpeningStock(false)

    if (!helper) {
      setMultiplePriceOptions(false)
      setShowAdvanced(false)
      setOptionGroups([])
      setAdditionalUnits([])
      setCanonicalTransactionScale(DEFAULT_UNIT_TRANSACTION_SCALE)
      setTrackServiceWork(false)
      setServiceAuthorization("on_order_confirmation")
      setServiceQuantityScale(0)
      if (kind === "product") setUnitName("")
      setHelperPickerOpen(false)
      return
    }

    const application = buildCatalogSetupHelperApplication(helper)
    const groups = application.optionGroups.map((group) => ({
      id: Crypto.randomUUID(),
      name: group.name,
      values: group.values.map((label) => ({
        id: Crypto.randomUUID(),
        label,
      })),
    }))
    setOptionGroups(groups)
    setShowAdvanced(groups.length > 0)
    if (!name.trim() && application.suggestedName)
      setName(application.suggestedName)

    if (application.kind === "product") {
      setUnitName(application.canonicalUnit.name)
      setCanonicalTransactionScale(application.canonicalUnit.transactionScale)
      setAdditionalUnits(
        application.additionalUnits.map((unit) => {
          const relation = catalogUnitFactorToRelation(unit.factor)

          return {
            id: Crypto.randomUUID(),
            name: unit.name,
            price: "",
            relationCount: relation.count,
            relationDirection: relation.direction,
            stockBehavior:
              unit.stockBehavior === "packaged_stock"
                ? "packaged_stock"
                : "alternate_transaction",
            transactionScale: unit.transactionScale,
          }
        }),
      )
      setTrackServiceWork(false)
    } else {
      setUnitName("")
      setAdditionalUnits([])
      setCanonicalTransactionScale(DEFAULT_UNIT_TRANSACTION_SCALE)
      setTrackServiceWork(application.workPolicy === "tracked")
      setServiceAuthorization(application.authorizationPolicy)
      setServiceQuantityScale(application.quantityScale)
      setDefaultQuoteRequired(application.pricingPolicy === "quote_required")
    }

    setHelperPickerOpen(false)
  }

  const applyHelper = (helper: CatalogSetupHelper | null) => {
    if (editsLocked()) return
    const replacementAction = getCatalogSetupReplacementAction({
      currentKey: selectedHelperKey,
      hasStructuralDraft: hasStructuralDraft(),
      nextKey: helper?.key ?? null,
    })
    if (replacementAction === "close") {
      setHelperPickerOpen(false)
      return
    }

    if (replacementAction === "apply") {
      commitHelper(helper)
      return
    }

    setHelperPickerOpen(false)
    setPendingHelperReplacement({ helper })
    requestConfirmation({ kind: "replace", helper })
  }

  const submitAdvanced = (
    itemKind: CatalogItemKind,
    trimmedName: string,
    priceMinor: number | undefined,
  ) => {
    if (showAdvanced && optionIssue) {
      setSubmitError(optionIssue)
      return
    }
    const activeCombinations = showAdvanced
      ? combinations
      : [{ key: "default", name: trimmedName, selections: [] }]
    if (
      showAdvanced &&
      (normalizedOptionGroups.some(
        (group) => !group.name || group.values.length === 0,
      ) ||
        activeCombinations.length === 0)
    ) {
      setSubmitError("Add a name and at least one value for every option.")
      return
    }

    const firstEnabledIndex = activeCombinations.findIndex(
      (combination) => variantDraft(combination.key).enabled,
    )
    if (firstEnabledIndex < 0) {
      setSubmitError("Keep at least one option combination enabled.")
      return
    }

    const invalidPrice = activeCombinations.find((combination) => {
      const draft = variantDraft(combination.key)
      if (!draft.enabled) return false
      if (itemKind === "service" && draft.quoteRequired) return false

      const override = draft.price.trim()
      return override ? majorToMinor(override) === null : false
    })
    if (invalidPrice) {
      setSubmitError(`Enter a valid price for ${invalidPrice.name}.`)
      return
    }

    const missingFixedServicePrice =
      itemKind === "service" && majorToMinor(price) === null
        ? activeCombinations.find((combination) => {
            const draft = variantDraft(combination.key)
            return isCatalogFixedPriceMissing({
              enabled: draft.enabled,
              hasBasePrice: false,
              hasOverridePrice: Boolean(draft.price.trim()),
              quoteRequired: draft.quoteRequired,
            })
          })
        : undefined
    if (missingFixedServicePrice) {
      setSubmitError(`Enter a price for ${missingFixedServicePrice.name}.`)
      return
    }

    const invalidVariantUnitPrice =
      itemKind === "product"
        ? activeCombinations
            .filter((combination) => variantDraft(combination.key).enabled)
            .flatMap((combination) =>
              additionalUnits.map((unit) => ({
                combination,
                unit,
                value:
                  variantDraft(combination.key).unitPrices[unit.id]?.trim() ??
                  "",
              })),
            )
            .find(({ value }) => value && majorToMinor(value) === null)
        : undefined
    if (invalidVariantUnitPrice) {
      setSubmitError(
        `Enter a valid ${invalidVariantUnitPrice.unit.name} price for ${invalidVariantUnitPrice.combination.name}.`,
      )
      return
    }
    const missingVariantUnitPrice =
      itemKind === "product"
        ? activeCombinations
            .filter((combination) => variantDraft(combination.key).enabled)
            .flatMap((combination) =>
              additionalUnits.map((unit) => ({
                combination,
                unit,
                value: resolveCatalogOptionUnitPriceMinor({
                  basePriceMinor: undefined,
                  optionPrice: variantDraft(combination.key).price,
                  optionPricingOnly: multiplePriceOptions,
                  unitDefaultPrice: unit.price,
                  unitOverridePrice:
                    variantDraft(combination.key).unitPrices[unit.id] ?? "",
                }),
              })),
            )
            .find(({ value }) => value === undefined)
        : undefined
    if (missingVariantUnitPrice) {
      setSubmitError(
        `Enter a separate ${missingVariantUnitPrice.unit.name} price for ${missingVariantUnitPrice.combination.name}.`,
      )
      return
    }

    const invalidProductQuantity =
      itemKind === "product" && showAdvanced
        ? activeCombinations.find((combination) => {
            const draft = variantDraft(combination.key)
            if (!draft.enabled || !draft.quantity.trim()) return false

            try {
              return (
                getExactOpeningStock(
                  draft.quantity,
                  canonicalTransactionScale,
                ) === undefined
              )
            } catch {
              return true
            }
          })
        : undefined
    if (invalidProductQuantity) {
      setSubmitError(
        `Enter a valid quantity for ${invalidProductQuantity.name}.`,
      )
      return
    }

    try {
      for (const unit of additionalUnits) {
        if (!unit.name.trim())
          throw new Error("Enter a name for every selling unit.")
        catalogUnitRelationToFactor({
          count: unit.relationCount,
          direction: unit.relationDirection,
        })
        if (unit.price.trim() && majorToMinor(unit.price) === null) {
          throw new Error(`Enter a valid price for ${unit.name}.`)
        }
      }
    } catch (unitError) {
      setSubmitError(
        unitError instanceof Error
          ? unitError.message
          : "Review the selling units.",
      )
      return
    }

    const rows = activeCombinations.map((combination, index) => {
      const draft = variantDraft(combination.key)
      const storeAvailability = stores.map((store) => ({
        isAvailable: draft.storeIds.includes(store.id),
        storeId: store.id,
      }))
      return {
        commonOffering: {
          enabled: draft.enabled,
          key: `offering-${index + 1}`,
          name: combination.name,
          storeAvailability:
            storeAvailability.length > 0 ? storeAvailability : undefined,
        },
        draft,
        enabled: draft.enabled,
        ...(draft.description.trim()
          ? { description: draft.description.trim() }
          : {}),
        ...(draft.imageUrl.trim() ? { imageUrl: draft.imageUrl.trim() } : {}),
        isDefault: index === firstEnabledIndex,
        key: combination.key,
        name: combination.name,
        priceMinor: draft.price.trim()
          ? (majorToMinor(draft.price) ?? undefined)
          : multiplePriceOptions
            ? undefined
            : priceMinor,
        selections: combination.selections,
      }
    })

    if (itemKind === "product") {
      const canonicalUnitName = unitName.trim()
      if (!canonicalUnitName) {
        setSubmitError("Enter the Product's main unit.")
        return
      }

      dispatchAdvanced({
        clientOperationId: clientOperationIdRef.current,
        description: description.trim() || undefined,
        kind: "product",
        name: trimmedName,
        openingStockQuantity: showOpeningStock
          ? showAdvanced
            ? undefined
            : getExactOpeningStock(openingStock, canonicalTransactionScale)
          : undefined,
        optionGroups: showAdvanced ? normalizedOptionGroups : undefined,
        unitConfiguration: {
          canonicalBalanceScale: EXACT_CANONICAL_MAX_SCALE,
          units: [
            {
              factor: "1",
              key: "canonical",
              name: canonicalUnitName,
              stockBehavior: "canonical_shared",
              transactionScale: canonicalTransactionScale,
            },
            ...additionalUnits.map((unit, unitIndex) => ({
              factor: catalogUnitRelationToFactor({
                count: unit.relationCount,
                direction: unit.relationDirection,
              }),
              key: unitKey(unitIndex),
              name: unit.name.trim(),
              stockBehavior: unit.stockBehavior,
              transactionScale: unit.transactionScale,
            })),
          ],
        },
        variants: rows.map(
          (
            { commonOffering, draft, priceMinor: rowPrice, ...variant },
            variantIndex,
          ) => {
            const openingStockQuantity =
              showAdvanced && draft.quantity.trim()
                ? getExactOpeningStock(
                    draft.quantity,
                    canonicalTransactionScale,
                  )
                : undefined

            return {
              ...variant,
              ...(openingStockQuantity !== undefined
                ? { openingStockQuantity }
                : {}),
              offerings: [
                {
                  ...commonOffering,
                  barcode: draft.barcode.trim() || undefined,
                  ...(rowPrice !== undefined
                    ? { fixedPriceMinor: rowPrice }
                    : {}),
                  inventoryUnitKey: "canonical",
                  pricingPolicy: "fixed" as const,
                  sku: draft.sku.trim() || undefined,
                },
                ...additionalUnits.map((unit, unitIndex) => {
                  const fixedPriceMinor = resolveCatalogOptionUnitPriceMinor({
                    basePriceMinor: rowPrice,
                    optionPrice: draft.price,
                    optionPricingOnly: multiplePriceOptions,
                    unitDefaultPrice: unit.price,
                    unitOverridePrice: draft.unitPrices[unit.id] ?? "",
                  })

                  return {
                    ...commonOffering,
                    barcode: undefined,
                    ...(fixedPriceMinor !== undefined
                      ? { fixedPriceMinor }
                      : {}),
                    inventoryUnitKey: unitKey(unitIndex),
                    key: `offering-${variantIndex + 1}-${unitIndex + 2}`,
                    name: `${variant.name} · ${unit.name.trim()}`,
                    pricingPolicy: "fixed" as const,
                    sku: undefined,
                  }
                }),
              ],
            }
          },
        ),
      })
      return
    }

    dispatchAdvanced({
      clientOperationId: clientOperationIdRef.current,
      description: description.trim() || undefined,
      kind: "service",
      name: trimmedName,
      optionGroups: showAdvanced ? normalizedOptionGroups : undefined,
      variants: rows.map(
        ({ commonOffering, draft, priceMinor: rowPrice, ...variant }) => ({
          ...variant,
          offerings: [
            draft.quoteRequired
              ? {
                  ...commonOffering,
                  authorizationPolicy: serviceAuthorization,
                  guidance: serviceGuidance.trim() || undefined,
                  pricingPolicy: "quote_required" as const,
                  quantityScale: serviceQuantityScale,
                  workPolicy: trackServiceWork
                    ? ("tracked" as const)
                    : ("charge_only" as const),
                }
              : {
                  ...commonOffering,
                  authorizationPolicy: serviceAuthorization,
                  fixedPriceMinor: requirePriceMinor(rowPrice, variant.name),
                  guidance: serviceGuidance.trim() || undefined,
                  pricingPolicy: "fixed" as const,
                  quantityScale: serviceQuantityScale,
                  workPolicy: trackServiceWork
                    ? ("tracked" as const)
                    : ("charge_only" as const),
                },
          ],
        }),
      ),
    })
  }

  const submit = () => {
    if (busy.current || completed.current || !kind) return
    if (attempt.current) {
      void executeAttempt(attempt.current)
      return
    }
    if (!canManage || scopeChanged || !storeReady) {
      setSubmitError(
        scopeChanged
          ? "Business, account or Store changed. Reopen setup in the intended Store."
          : "Wait for the current Store and Catalog permission before saving.",
      )
      return
    }
    if (isOffline) {
      setSubmitError(
        "Products and Services cannot be created offline. Reconnect before saving this item.",
      )
      return
    }

    const trimmedName = name.trim()
    const quoteOnlyService = kind === "service" && defaultQuoteRequired
    const parsedPriceMinor = majorToMinor(price)

    if (!trimmedName) {
      setSubmitError("Enter an item name.")
      return
    }
    const invalidEnteredPrice =
      Boolean(price.trim()) && parsedPriceMinor === null
    const missingServicePrice =
      kind === "service" &&
      !showAdvanced &&
      !quoteOnlyService &&
      parsedPriceMinor === null
    if (invalidEnteredPrice || missingServicePrice) {
      setSubmitError("Enter a valid price.")
      return
    }
    const priceMinor = parsedPriceMinor ?? undefined

    try {
      if (
        showAdvanced ||
        (kind === "product" &&
          (additionalUnits.length > 0 || selectedHelperKey !== null)) ||
        quoteOnlyService
      ) {
        submitAdvanced(kind, trimmedName, priceMinor)
        return
      }

      if (kind === "product") {
        const canonicalUnitName = unitName.trim()
        if (!canonicalUnitName) {
          setSubmitError("Enter the Product's main unit.")
          return
        }

        dispatchSimple({
          canonicalUnitName,
          clientOperationId: clientOperationIdRef.current,
          description: description.trim() || undefined,
          kind,
          name: trimmedName,
          openingStockQuantity: showOpeningStock
            ? getExactOpeningStock(openingStock, canonicalTransactionScale)
            : undefined,
          priceMinor,
        })
        return
      }

      dispatchSimple({
        authorizationPolicy: serviceAuthorization,
        clientOperationId: clientOperationIdRef.current,
        description: description.trim() || undefined,
        guidance: serviceGuidance.trim() || undefined,
        kind,
        name: trimmedName,
        priceMinor: requirePriceMinor(priceMinor, trimmedName),
        quantityScale: serviceQuantityScale,
        workPolicy: trackServiceWork ? "tracked" : "charge_only",
      })
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Review the item details.",
      )
    }
  }

  const openUnitEditor = (unit?: MobileUnitDraft) => {
    if (editsLocked()) return
    Keyboard.dismiss()
    setUnitEditorDraft(unit ? { ...unit } : newUnit())
    setUnitEditorError(null)
  }

  const updateUnitEditorDraft = (update: Partial<MobileUnitDraft>) => {
    if (editsLocked()) return
    setUnitEditorDraft((current) =>
      current ? { ...current, ...update } : current,
    )
    setUnitEditorError(null)
  }

  const saveUnitEditorDraft = () => {
    if (editsLocked()) return
    if (!unitEditorDraft) return

    const trimmedName = unitEditorDraft.name.trim()
    if (!trimmedName) {
      setUnitEditorError("Enter a unit name, such as Bag, Carton, or Piece.")
      return
    }

    if (
      additionalUnits.some(
        (unit) =>
          unit.id !== unitEditorDraft.id &&
          unit.name.trim().toLowerCase() === trimmedName.toLowerCase(),
      )
    ) {
      setUnitEditorError(`${trimmedName} is already in the unit list.`)
      return
    }

    try {
      catalogUnitRelationToFactor({
        count: unitEditorDraft.relationCount,
        direction: unitEditorDraft.relationDirection,
      })
    } catch {
      setUnitEditorError(
        "Enter a positive count that can be converted exactly without rounding.",
      )
      return
    }

    if (
      unitEditorDraft.price.trim() &&
      majorToMinor(unitEditorDraft.price) === null
    ) {
      setUnitEditorError(`Enter a valid selling price for ${trimmedName}.`)
      return
    }

    const nextUnit = { ...unitEditorDraft, name: trimmedName }
    setAdditionalUnits((current) =>
      current.some((unit) => unit.id === nextUnit.id)
        ? current.map((unit) => (unit.id === nextUnit.id ? nextUnit : unit))
        : [...current, nextUnit],
    )
    Keyboard.dismiss()
    setUnitEditorDraft(null)
    setUnitEditorError(null)
  }

  const removeUnit = (unitId: string) => {
    if (editsLocked()) return
    setAdditionalUnits((current) =>
      current.filter((unit) => unit.id !== unitId),
    )
    setVariantDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, draft]) => {
          const { [unitId]: _removedPrice, ...unitPrices } = draft.unitPrices
          return [key, { ...draft, unitPrices }]
        }),
      ),
    )
  }

  const removeAllAdditionalUnits = () => {
    if (editsLocked()) return
    setAdditionalUnits([])
    setVariantDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, draft]) => [
          key,
          { ...draft, unitPrices: {} },
        ]),
      ),
    )
  }

  const changeUnitEditorDirection = (
    nextDirection: CatalogUnitRelationDirection,
  ) => {
    if (editsLocked()) return
    if (!unitEditorDraft) return
    if (!unitEditorDraft.relationCount.trim()) {
      updateUnitEditorDraft({ relationDirection: nextDirection })
      return
    }

    try {
      const relation = transposeCatalogUnitRelation(
        {
          count: unitEditorDraft.relationCount,
          direction: unitEditorDraft.relationDirection,
        },
        nextDirection,
      )
      updateUnitEditorDraft({
        relationCount: relation.count,
        relationDirection: relation.direction,
      })
    } catch {
      setUnitEditorError(
        "This relationship cannot be transposed exactly. Keep the current direction.",
      )
    }
  }

  const focusVariantComposerInput = () => {
    if (focusTimer.current) clearTimeout(focusTimer.current)
    focusTimer.current = setTimeout(() => {
      focusTimer.current = null
      if (mounted.current && !editsLocked())
        variantComposerInputRef.current?.focus()
    }, 80)
  }

  const hideVariantComposer = () => {
    if (focusTimer.current) {
      clearTimeout(focusTimer.current)
      focusTimer.current = null
    }
    if (!variantComposerMode) return

    setVariantComposerMode(null)
    setComposerText("")
    setEditingGroupId(null)
  }

  useEffect(() => {
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      if (focusTimer.current) {
        clearTimeout(focusTimer.current)
        focusTimer.current = null
      }
      setVariantComposerMode(null)
      setComposerText("")
      setEditingGroupId(null)
    })

    return () => {
      hideSubscription.remove()
    }
  }, [])

  const beginVariantComposer = () => {
    if (editsLocked()) return
    setShowOpeningStock(false)
    setOpeningStock("")
    setVariantComposerMode("variant-type")
    setEditingGroupId(null)
    setComposerText("")
    focusVariantComposerInput()
  }

  const openVariantComposer = () => {
    if (editsLocked()) return
    if (!showAdvanced && openingStock.trim()) {
      requestConfirmation({ kind: "options" })
      return
    }

    beginVariantComposer()
  }

  const selectVariantLabel = (rawLabel: string) => {
    if (editsLocked()) return
    const label = rawLabel.trim()
    if (!label) return
    if (label.length > 80) {
      setSubmitError("Keep option names within 80 characters.")
      return
    }
    const normalizedLabel = label.toLowerCase()
    if (editingGroupId) {
      const duplicateGroup = optionGroups.find(
        (group) =>
          group.id !== editingGroupId &&
          group.name.trim().toLowerCase() === normalizedLabel,
      )
      if (duplicateGroup) {
        setSubmitError(`An option named ${label} already exists.`)
        return
      }

      setOptionGroups((current) =>
        current.map((group) =>
          group.id === editingGroupId ? { ...group, name: label } : group,
        ),
      )
      setEditingGroupId(null)
      setVariantComposerMode(null)
      setComposerText("")
      Keyboard.dismiss()
      return
    }

    const existingGroup = optionGroups.find(
      (group) => group.name.trim().toLowerCase() === normalizedLabel,
    )
    const groupId = existingGroup?.id ?? Crypto.randomUUID()

    setOptionGroups((current) => {
      if (
        current.some(
          (group) => group.name.trim().toLowerCase() === normalizedLabel,
        )
      ) {
        return current
      }

      return [...current, { id: groupId, name: label, values: [] }]
    })
    setShowAdvanced(true)
    setActiveGroupId(groupId)
    setVariantComposerMode(null)
    setComposerText("")
    Keyboard.dismiss()
  }

  const openVariantValueComposer = (groupId: string) => {
    if (editsLocked()) return
    setEditingGroupId(null)
    setActiveGroupId(groupId)
    setVariantComposerMode("variant-value")
    setComposerText("")
    focusVariantComposerInput()
  }

  const openOptionNameEditor = (group: MobileOptionGroup) => {
    if (editsLocked()) return
    setActiveGroupId(group.id)
    setEditingGroupId(group.id)
    setVariantComposerMode("variant-type")
    setComposerText(group.name)
    focusVariantComposerInput()
  }

  const removeOptionValue = (groupId: string, valueId: string) => {
    if (editsLocked()) return
    setOptionGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              values: group.values.filter((value) => value.id !== valueId),
            }
          : group,
      ),
    )
  }

  const addComposerValueByName = (rawLabel: string) => {
    if (editsLocked()) return
    const label = rawLabel.trim()
    if (!label || !activeGroupId) return
    if (label.length > 80) {
      setSubmitError("Keep each option value within 80 characters.")
      return
    }

    setOptionGroups((current) =>
      current.map((group) =>
        group.id === activeGroupId &&
        !group.values.some(
          (value) => value.label.toLowerCase() === label.toLowerCase(),
        )
          ? {
              ...group,
              values: [...group.values, { id: Crypto.randomUUID(), label }],
            }
          : group,
      ),
    )
  }

  const submitVariantComposer = () => {
    if (editsLocked()) return
    const value = composerText.trim()

    if (variantComposerMode === "variant-type") {
      if (!value) return
      selectVariantLabel(value)
      return
    }

    if (value) {
      for (const part of value.split(",")) {
        addComposerValueByName(part)
      }
    }
    setVariantComposerMode(null)
    setComposerText("")
  }

  const changeVariantComposerText = (value: string) => {
    if (editsLocked()) return
    if (variantComposerMode !== "variant-value" || !value.includes(",")) {
      setComposerText(value)
      return
    }

    const parts = value.split(",")
    const unfinishedValue = parts.pop() ?? ""

    for (const part of parts) {
      addComposerValueByName(part)
    }
    setComposerText(unfinishedValue)
  }

  const pressVariantComposerPill = (pill: KeyboardInlineComposerPill) => {
    if (editsLocked()) return
    if (variantComposerMode === "variant-type") {
      selectVariantLabel(pill.label)
      return
    }

    addComposerValueByName(pill.label)
    setComposerText("")
    focusVariantComposerInput()
  }

  const removeComposerValue = (pill: KeyboardInlineComposerPill) => {
    if (editsLocked()) return
    if (!activeGroupId) return
    setOptionGroups((current) =>
      current.map((group) =>
        group.id === activeGroupId
          ? {
              ...group,
              values: group.values.filter((value) => value.id !== pill.id),
            }
          : group,
      ),
    )
    focusVariantComposerInput()
  }

  function clearOptions() {
    if (editsLocked()) return
    setMultiplePriceOptions(false)
    setShowAdvanced(false)
    setActiveGroupId(null)
    setEditingGroupId(null)
    setVariantComposerMode(null)
    setComposerText("")
    setOptionGroups([])
    setVariantDrafts({})
  }
  function enableOptionPricing() {
    if (editsLocked()) return
    setMultiplePriceOptions(true)
    setShowAdvanced(true)
    setShowOpeningStock(false)
    setOpeningStock("")
    setSubmitError(null)
  }
  function toggleOptionPricing() {
    if (editsLocked()) return
    if (multiplePriceOptions) {
      setMultiplePriceOptions(false)
      setSubmitError(null)
      return
    }
    if (openingStock.trim()) requestConfirmation({ kind: "option-pricing" })
    else enableOptionPricing()
  }
  function confirmSetupChange() {
    if (!confirmation || editsLocked() || afterConfirmationDismissal.current)
      return
    const change = confirmation
    afterConfirmationDismissal.current = () => {
      if (editsLocked()) return
      switch (change.kind) {
        case "replace":
          commitHelper(change.helper)
          break
        case "options":
          beginVariantComposer()
          break
        case "option-pricing":
          enableOptionPricing()
          break
        case "remove-options":
          clearOptions()
          break
        case "remove-unit":
          removeUnit(change.id)
          break
        case "remove-units":
          removeAllAdditionalUnits()
          break
        case "remove-group":
          setOptionGroups((groups) =>
            groups.filter((group) => group.id !== change.id),
          )
          break
      }
    }
    replacementModal.dismiss()
  }
  function dismissSetupConfirmation() {
    setConfirmation(null)
    setPendingHelperReplacement(null)
    const run = afterConfirmationDismissal.current
    afterConfirmationDismissal.current = null
    run?.()
  }
  function cancelSetupConfirmation() {
    afterConfirmationDismissal.current = null
    replacementModal.dismiss()
  }
  const confirmationCopy =
    confirmation?.kind === "replace"
      ? {
          title: "Replace current setup?",
          message:
            "This replaces units, options, prices and stock setup. Your name, description and base price stay unchanged.",
          action: "Replace setup",
        }
      : confirmation?.kind === "options" ||
          confirmation?.kind === "option-pricing"
        ? {
            title: "Add stock for each option?",
            message:
              "Adding options clears the single opening-stock quantity. Enter current stock for each combination instead.",
            action: "Continue with options",
          }
        : confirmation?.kind === "remove-options"
          ? {
              title:
                kind === "product"
                  ? "Use one price instead?"
                  : "Remove service choices?",
              message:
                "This clears all option groups and their individual prices, stock quantities and details. Your item name and base price stay unchanged.",
              action: "Clear option setup",
            }
          : {
              title:
                "Remove " +
                (confirmation && "name" in confirmation
                  ? confirmation.name
                  : "selling units") +
                "?",
              message:
                "This removes the selected setup and its related pricing choices from this draft. No saved inventory is changed.",
              action: "Remove from draft",
            }

  const fill = (
    context: Parameters<typeof createCatalogFixture>[0],
    sequence: number,
  ) => {
    if (editsLocked()) return
    qaSnapshotRef.current = {
      activeGroupId,
      additionalUnits,
      canonicalTransactionScale,
      composerText,
      defaultQuoteRequired,
      description,
      editingGroupId,
      helperPickerOpen,
      multiplePriceOptions,
      name,
      openingStock,
      optionGroups,
      pendingHelperReplacement,
      price,
      selectedHelperKey,
      serviceAuthorization,
      serviceGuidance,
      serviceQuantityScale,
      showAdvanced,
      showDescription,
      showOpeningStock,
      trackServiceWork,
      unitEditorDraft,
      unitEditorError,
      unitName,
      variantComposerMode,
      variantDrafts,
    }
    setSelectedHelperKey(null)
    setHelperPickerOpen(false)
    setPendingHelperReplacement(null)
    setMultiplePriceOptions(false)
    setCanonicalTransactionScale(DEFAULT_UNIT_TRANSACTION_SCALE)
    setDefaultQuoteRequired(false)
    setServiceAuthorization("on_order_confirmation")
    setServiceQuantityScale(0)
    setServiceGuidance("")
    setActiveGroupId(null)
    setEditingGroupId(null)
    setVariantComposerMode(null)
    setComposerText("")
    setVariantDrafts({})
    setUnitEditorDraft(null)
    setUnitEditorError(null)
    setOpeningStock("")
    setShowOpeningStock(false)
    setAdditionalUnits([])
    setTrackServiceWork(false)
    setOptionGroups([])
    const fixture = createCatalogFixture(context, sequence)
    setName(fixture.name)
    setPrice(fixture.price)
    setUnitName(fixture.unit)
    setDescription(fixture.description)
    setShowDescription(true)
    if (kind === "product") {
      setOpeningStock("12")
      setShowOpeningStock(true)
      setShowAdvanced(true)
      setOptionGroups([
        {
          id: Crypto.randomUUID(),
          name: "Size",
          values: ["Standard", "Large"].map((label) => ({
            id: Crypto.randomUUID(),
            label,
          })),
        },
      ])
      setAdditionalUnits([
        {
          id: Crypto.randomUUID(),
          name: "Pack",
          price: "",
          relationCount: "12",
          relationDirection: "units_per_canonical",
          stockBehavior: "alternate_transaction",
          transactionScale: 0,
        },
      ])
    } else {
      setShowAdvanced(true)
      setTrackServiceWork(true)
      setOptionGroups([
        {
          id: Crypto.randomUUID(),
          name: "Service level",
          values: ["Standard", "Express"].map((label) => ({
            id: Crypto.randomUUID(),
            label,
          })),
        },
      ])
    }
  }

  const undoFill = () => {
    if (editsLocked()) return
    const snapshot = qaSnapshotRef.current
    if (!snapshot) return
    setActiveGroupId(snapshot.activeGroupId)
    setDescription(snapshot.description)
    setAdditionalUnits(snapshot.additionalUnits)
    setCanonicalTransactionScale(snapshot.canonicalTransactionScale)
    setComposerText(snapshot.composerText)
    setDefaultQuoteRequired(snapshot.defaultQuoteRequired)
    setEditingGroupId(snapshot.editingGroupId)
    setHelperPickerOpen(snapshot.helperPickerOpen)
    setMultiplePriceOptions(snapshot.multiplePriceOptions)
    setName(snapshot.name)
    setOpeningStock(snapshot.openingStock)
    setOptionGroups(snapshot.optionGroups)
    setPendingHelperReplacement(snapshot.pendingHelperReplacement)
    setPrice(snapshot.price)
    setSelectedHelperKey(snapshot.selectedHelperKey)
    setServiceAuthorization(snapshot.serviceAuthorization)
    setServiceGuidance(snapshot.serviceGuidance)
    setServiceQuantityScale(snapshot.serviceQuantityScale)
    setShowAdvanced(snapshot.showAdvanced)
    setShowDescription(snapshot.showDescription)
    setShowOpeningStock(snapshot.showOpeningStock)
    setTrackServiceWork(snapshot.trackServiceWork)
    setUnitEditorDraft(snapshot.unitEditorDraft)
    setUnitEditorError(snapshot.unitEditorError)
    setUnitName(snapshot.unitName)
    setVariantComposerMode(snapshot.variantComposerMode)
    setVariantDrafts(snapshot.variantDrafts)
    qaSnapshotRef.current = null
  }

  const qaDirty =
    Boolean(
      name ||
        price ||
        unitName ||
        openingStock ||
        description ||
        optionGroups.length ||
        additionalUnits.length ||
        selectedHelperKey ||
        serviceGuidance ||
        Object.keys(variantDrafts).length,
    ) ||
    multiplePriceOptions ||
    canonicalTransactionScale !== DEFAULT_UNIT_TRANSACTION_SCALE ||
    trackServiceWork ||
    defaultQuoteRequired ||
    serviceAuthorization !== "on_order_confirmation" ||
    serviceQuantityScale !== 0

  const saveReadiness = kind
    ? getCatalogItemSaveReadiness({
        defaultQuoteRequired,
        kind,
        name,
        price,
        showAdvanced,
        unitName,
      })
    : { canSave: false, hint: "Choose a Product or Service." }

  const canUndoFill = Boolean(qaSnapshotRef.current)

  const locked = editsLocked()
  const canSave =
    !isOffline &&
    canManage &&
    !scopeChanged &&
    storeReady &&
    !(showAdvanced && optionIssue) &&
    !isSaving &&
    !completion &&
    (Boolean(attempt.current) || saveReadiness.canSave)
  const hasAttempt = Boolean(attempt.current)
  return {
    optionIssue,
    requestConfirmation,
    toggleOptionPricing,
    confirmationCopy,
    confirmSetupChange,
    dismissSetupConfirmation,
    cancelSetupConfirmation,
    setDefaultQuoteRequired: guardEdit(setDefaultQuoteRequired),
    locked,
    canSave,
    hasAttempt,
    canManage,
    scopeChanged,
    storesLoading,
    storesError,
    storeReady,
    retryStores,
    completion,
    saveNotice,
    isOffline,
    replacementModal,
    variantComposerInputRef,
    kind,
    setKind: guardEdit(setKind),
    helperPickerOpen,
    setHelperPickerOpen: guardEdit(setHelperPickerOpen),
    pendingHelperReplacement,
    setPendingHelperReplacement: guardEdit(setPendingHelperReplacement),
    selectedHelperKey,
    name,
    setName: guardEdit(setName),
    price,
    setPrice: guardEdit(setPrice),
    multiplePriceOptions,
    setMultiplePriceOptions: guardEdit(setMultiplePriceOptions),
    unitName,
    setUnitName: guardEdit(setUnitName),
    openingStock,
    setOpeningStock: guardEdit(setOpeningStock),
    description,
    setDescription: guardEdit(setDescription),
    showOpeningStock,
    setShowOpeningStock: guardEdit(setShowOpeningStock),
    showDescription,
    setShowDescription: guardEdit(setShowDescription),
    showAdvanced,
    setShowAdvanced: guardEdit(setShowAdvanced),
    canonicalTransactionScale,
    trackServiceWork,
    setTrackServiceWork: guardEdit(setTrackServiceWork),
    defaultQuoteRequired,
    serviceAuthorization,
    setServiceAuthorization: guardEdit(setServiceAuthorization),
    serviceGuidance,
    setServiceGuidance: guardEdit(setServiceGuidance),
    optionGroups,
    setOptionGroups: guardEdit(setOptionGroups),
    setActiveGroupId: guardEdit(setActiveGroupId),
    editingGroupId,
    setEditingGroupId: guardEdit(setEditingGroupId),
    variantComposerMode,
    setVariantComposerMode: guardEdit(setVariantComposerMode),
    composerText,
    setComposerText: guardEdit(setComposerText),
    variantDrafts,
    setVariantDrafts: guardEdit(setVariantDrafts),
    additionalUnits,
    unitEditorDraft,
    setUnitEditorDraft: guardEdit(setUnitEditorDraft),
    unitEditorError,
    setUnitEditorError: guardEdit(setUnitEditorError),
    submitError,
    setSubmitError: guardEdit(setSubmitError),
    currencyCode,
    stores,
    isEditingUnit,
    businessProfileKey,
    businessProfile,
    selectedHelper,
    combinations,
    activeGroup,
    composerPills,
    makeDefaultVariantDraft,
    commitHelper,
    applyHelper,
    submit,
    openUnitEditor,
    updateUnitEditorDraft,
    saveUnitEditorDraft,
    removeUnit,
    removeAllAdditionalUnits,
    changeUnitEditorDirection,
    hideVariantComposer,
    openVariantComposer,
    openVariantValueComposer,
    openOptionNameEditor,
    removeOptionValue,
    submitVariantComposer,
    changeVariantComposerText,
    pressVariantComposerPill,
    removeComposerValue,
    fill,
    undoFill,
    qaDirty,
    isSaving,
    saveReadiness,
    canUndoFill,
  }
}
export type CatalogSetupModel = ReturnType<typeof useCatalogSetup>
