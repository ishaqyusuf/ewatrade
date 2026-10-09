"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  CurrencyInput,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Input,
  SelectControl,
  Separator,
  SubmitButton,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  Field as UiField,
} from "@ewatrade/ui"
import { useCatalogThemeClass } from "./catalog-appearance"
import { ProductUsageField } from "./product-usage-field"

import { catalogChoiceDraftIdentity } from "@/lib/catalog-choice-drafts"
import { resolveCatalogUnitFactors } from "@/lib/catalog-selling-units"
import { CatalogCategoryEditor } from "./catalog-category-editor"
import {
  CatalogDetailEditor,
  CatalogDetailRow,
  CatalogEditorPanel,
  CatalogFooterLabel,
  useCatalogEditorStack,
} from "./catalog-detail-editor"
import type {
  AdvancedOptionGroup,
  AdvancedUnitDraft,
  AdvancedVariantDraft,
} from "./catalog-form-types"
import { CatalogOptionsEditor } from "./catalog-options-editor"
import { CatalogSellingUnitsEditor } from "./catalog-selling-units-editor"

import { FormFeedback } from "@/components/forms/form-feedback"
import { StoreSelector } from "@/components/stores/store-selector"

import { ConfirmDraftModal } from "@/components/modals/confirm-draft-modal"
import { createCatalogFixture } from "@/components/qa/fixture-recipes"
import { QaDashboardQuickFill } from "@/components/qa/qa-quick-fill"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useCatalogPhoto } from "@/hooks/use-catalog-photo"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { findCatalogIllustration } from "@ewatrade/utils/catalog-illustrations"
import { CatalogImageEditor } from "./catalog-image-editor"

import {
  type CatalogSetupHelper,
  buildCatalogSetupHelperApplication,
  buildCatalogVariantCombinations,
  catalogUnitFactorToRelation,
  findCatalogSetupHelper,
  getCatalogSetupReplacementAction,
} from "@ewatrade/utils"
import {
  EXACT_CANONICAL_MAX_SCALE,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import {
  BarcodeScanIcon,
  Image01Icon,
  Layers01Icon,
  Money03Icon,
  Package01Icon,
  Tag01Icon,
  Task01Icon,
  TextAlignLeftIcon,
  WarehouseIcon,
} from "@hugeicons/core-free-icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import type { FormEvent, InputHTMLAttributes, ReactNode } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { ProductChat } from "@/components/product-assistant/product-chat"
import {
  productFormSnapshotSchema,
  productHandbackSnapshot,
} from "@ewatrade/assistant/product/contracts"
import { resolveCatalogFormGuidance } from "@ewatrade/utils/business-catalog-guidance"
import { CatalogGuidanceSuggestions } from "./catalog-guidance-suggestions"
import { CatalogSetupHelperPicker } from "./catalog-setup-helper-picker"
import { useCatalogItemForm } from "./form-context"

type CatalogItemFormProps = {
  businessProfileKey?: string | null
  currencyCode: string
  footerHost?: HTMLDivElement | null
  onCreated: (name: string) => void
  storeId: string
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode
  htmlFor: string
  label: string
}) {
  return (
    <UiField className="gap-1.5">
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
    </UiField>
  )
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} />
}

function parsePrice(value: string) {
  const normalized = value.replaceAll(",", "").trim()
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null
  const [whole = "0", fraction = ""] = normalized.split(".")
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= 100_000_000
    ? amount
    : null
}

function createClientOperationId() {
  return globalThis.crypto.randomUUID()
}

const DEFAULT_UNIT_TRANSACTION_SCALE = 2

function newOptionGroup(): AdvancedOptionGroup {
  return { id: globalThis.crypto.randomUUID(), name: "", values: "" }
}

function unitKey(index: number) {
  return `unit-${index + 2}`
}

export function CatalogItemForm({
  businessProfileKey: initialBusinessProfileKey,
  currencyCode,
  footerHost,
  onCreated,
  storeId: initialStoreId,
}: CatalogItemFormProps) {
  const [storeId, setStockStoreId] = useState(initialStoreId)
  const router = useRouter()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const {
    setCatalogItemMode,
    catalogCreateMode,
    catalogConversation,
    setParams,
  } = useCatalogItemParams()
  const {
    form,
    validate,
    setForm,
    setShowDescription,
    setShowOpeningStock,
    showOpeningStock,
    showDescription,
  } = useCatalogItemForm()
  const clientOperationId = useRef(createClientOperationId())
  const editor = useCatalogEditorStack()
  const [category, setCategory] = useState("")
  const themeClass = useCatalogThemeClass()
  const photo = useCatalogPhoto(storeId)
  const [illustrationId, setIllustrationId] = useState<string | null>(null)
  const [sku, setSku] = useState("")
  const [barcode, setBarcode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const quickFillSnapshot = useRef<typeof form | null>(null)
  const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)
  const [helperPickerOpen, setHelperPickerOpen] = useState(false)
  const [draftConfirmation, setDraftConfirmation] = useState<
    | { kind: "helper"; helper: CatalogSetupHelper | null }
    | { kind: "options" }
    | { kind: "remove-options" }
    | null
  >(null)
  const [selectedHelperKey, setSelectedHelperKey] = useState<string | null>(
    null,
  )
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showUnits, setShowUnits] = useState(false)
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
  const [optionGroups, setOptionGroups] = useState<AdvancedOptionGroup[]>([
    newOptionGroup(),
  ])
  const [variantDrafts, setVariantDrafts] = useState<
    Record<string, AdvancedVariantDraft>
  >({})
  const [additionalUnits, setAdditionalUnits] = useState<AdvancedUnitDraft[]>(
    [],
  )
  const capability = useQuery(trpc.productAssistant.capabilities.queryOptions())
  const productState = useQuery(
    trpc.productAssistant.state.queryOptions(
      { conversationId: catalogConversation ?? "" },
      {
        enabled: Boolean(catalogConversation),
        refetchInterval: catalogCreateMode === "chat" ? 2500 : false,
      },
    ),
  )
  const handoffRequest = useRef(crypto.randomUUID())
  const handoffStarted = useRef(false)
  const restored = useRef(false)
  const previousCreateMode = useRef(catalogCreateMode)
  const [handoffError, setHandoffError] = useState<string | null>(null)
  const startProductChat = useMutation(
    trpc.productAssistant.start.mutationOptions(),
  )
  const updateProductChat = useMutation(
    trpc.productAssistant.updateSnapshot.mutationOptions(),
  )
  useEffect(() => {
    const returningFromChat =
      previousCreateMode.current === "chat" && catalogCreateMode !== "chat"
    previousCreateMode.current = catalogCreateMode
    if (returningFromChat) handoffStarted.current = false
    if (
      catalogCreateMode === "chat" &&
      !catalogConversation &&
      capability.data?.enabled === false
    ) {
      setHandoffError(
        "The assistant is not available for this business. Use the form to add your product.",
      )
      void setParams({ catalogCreateMode: "form" })
      return
    }
    const data = productState.data
    if (!data || (restored.current && !returningFromChat)) return
    restored.current = true
    const snapshot = productHandbackSnapshot(
      data.snapshot,
      data.draft.entities[0]?.payload,
    )
    setForm(snapshot.form)
    setStockStoreId(snapshot.storeId)
    setCategory(snapshot.category)
    setIllustrationId(snapshot.illustrationId)
    photo.restore(snapshot.photoAssetIds)
    setSku(snapshot.sku)
    setBarcode(snapshot.barcode)
    setShowAdvanced(snapshot.showAdvanced)
    setShowUnits(snapshot.showUnits)
    setShowDescription(snapshot.showDescription)
    setShowOpeningStock(snapshot.showOpeningStock)
    setSelectedHelperKey(snapshot.selectedHelperKey)
    setCanonicalTransactionScale(snapshot.canonicalTransactionScale)
    setOptionGroups(snapshot.optionGroups)
    setVariantDrafts(snapshot.variantDrafts)
    setAdditionalUnits(snapshot.additionalUnits)
  }, [
    capability.data?.enabled,
    catalogCreateMode,
    catalogConversation,
    setParams,
    productState.data,
    setForm,
    setShowDescription,
    setShowOpeningStock,
    photo.restore,
  ])
  const openProductChat = async () => {
    if (startProductChat.isPending || handoffStarted.current) return
    handoffStarted.current = true
    setHandoffError(null)
    try {
      const photoAssetIds = await photo.upload(clientOperationId.current)
      const snapshot = productFormSnapshotSchema.parse({
        form,
        storeId,
        category,
        illustrationId,
        photoAssetIds,
        sku,
        barcode,
        showAdvanced,
        showUnits,
        showDescription,
        showOpeningStock,
        selectedHelperKey,
        canonicalTransactionScale,
        optionGroups,
        variantDrafts,
        additionalUnits,
      })
      const result =
        catalogConversation && productState.data
          ? await updateProductChat.mutateAsync({
              conversationId: catalogConversation,
              expectedRevision: productState.data.draft.revision,
              snapshot,
            })
          : await startProductChat.mutateAsync({
              handoffRequestId: handoffRequest.current,
              snapshot,
            })
      await queryClient.invalidateQueries({
        queryKey: trpc.productAssistant.pathKey(),
      })
      await setParams({
        catalogCreateMode: "chat",
        catalogConversation: result.conversationId,
      })
    } catch (error) {
      handoffStarted.current = false
      setHandoffError(
        error instanceof Error
          ? error.message
          : "Chat could not start. Your form is still here.",
      )
      void setParams({ catalogCreateMode: "form" })
    }
  }
  useEffect(() => {
    if (
      catalogCreateMode === "chat" &&
      !catalogConversation &&
      capability.data?.enabled &&
      form.kind === "product" &&
      !handoffStarted.current
    )
      void openProductChat()
  })
  const backToForm = () => {
    handoffStarted.current = false
    void setParams({ catalogCreateMode: "form" })
  }
  const storesQuery = useQuery(trpc.tenant.stores.queryOptions())
  const stores = storesQuery.data ?? []
  const businessProfileKey =
    initialBusinessProfileKey !== undefined
      ? initialBusinessProfileKey
      : (stores.find((store) => store.id === storeId)?.businessProfileKey ??
        null)
  const selectedHelper = selectedHelperKey
    ? findCatalogSetupHelper(selectedHelperKey)
    : undefined
  const formGuidance = useMemo(
    () =>
      resolveCatalogFormGuidance({
        businessProfileKey,
        kind: form.kind ?? "product",
        selectedHelperKey,
      }),
    [businessProfileKey, form.kind, selectedHelperKey],
  )
  const normalizedOptionGroups = useMemo(
    () =>
      optionGroups.map((group, groupIndex) => ({
        key: `group-${groupIndex + 1}`,
        name: group.name.trim(),
        values: group.values
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .map((label, valueIndex) => ({
            key: `value-${valueIndex + 1}`,
            label,
          })),
      })),
    [optionGroups],
  )
  const optionIssue =
    normalizedOptionGroups.length > 12
      ? "Use no more than 12 option groups."
      : normalizedOptionGroups.some((group) => group.values.length > 100)
        ? "Use no more than 100 values in an option group."
        : normalizedOptionGroups.reduce(
              (total, group) => total * Math.max(1, group.values.length),
              1,
            ) > 96
          ? "Keep the item within 96 option combinations. Remove a group or some values."
          : null
  const combinations = useMemo(
    () =>
      optionIssue
        ? []
        : buildCatalogVariantCombinations(normalizedOptionGroups),
    [normalizedOptionGroups, optionIssue],
  )
  const onCreatedMutation = async (item: { name: string }) => {
    void Promise.allSettled([
      queryClient.invalidateQueries({
        queryKey: trpc.catalog.listItems.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.catalog.listItemsPage.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.tenant.featureAvailability.queryKey(),
      }),
    ])
    onCreated(item.name)
    setCatalogItemMode(null)
    router.refresh()
  }
  const createMutation = useMutation(
    trpc.catalog.createSimpleItem.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: onCreatedMutation,
    }),
  )
  const createAdvancedMutation = useMutation(
    trpc.catalog.createItem.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: onCreatedMutation,
    }),
  )
  const createAssistantForm = useMutation(
    trpc.productAssistant.createFromForm.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: onCreatedMutation,
    }),
  )
  function createSimpleWithAssistant(
    input: RouterInputs["catalog"]["createSimpleItem"],
  ) {
    if (catalogConversation && productState.data && input.kind === "product") {
      createAssistantForm.mutate({
        conversationId: catalogConversation,
        expectedRevision: productState.data.draft.revision,
        command: { mode: "simple", input },
      })
    } else createMutation.mutate(input)
  }
  const photoSaveBusy = useRef(false)
  async function createAdvancedWithPhoto(
    input: RouterInputs["catalog"]["createItem"],
  ) {
    if (photoSaveBusy.current) return
    photoSaveBusy.current = true
    try {
      const photoAssetIds = await photo.upload(input.clientOperationId)
      const command = {
        ...input,
        ...(photoAssetIds.length ? { photoAssetIds } : {}),
        ...(illustrationId ? { illustrationId } : {}),
      }
      if (
        catalogConversation &&
        productState.data &&
        input.kind === "product"
      ) {
        await createAssistantForm.mutateAsync({
          conversationId: catalogConversation,
          expectedRevision: productState.data.draft.revision,
          command: { mode: "advanced", input: command },
        })
      } else await createAdvancedMutation.mutateAsync(command)
    } finally {
      photoSaveBusy.current = false
    }
  }

  const choiceIdentities = useMemo(
    () =>
      new Map(
        combinations.map((combination) => [
          combination.key,
          catalogChoiceDraftIdentity(
            combination.selections,
            normalizedOptionGroups.map((group, index) => ({
              ...group,
              id: optionGroups[index]?.id ?? group.key,
            })),
          ),
        ]),
      ),
    [combinations, normalizedOptionGroups, optionGroups],
  )

  useEffect(() => {
    setVariantDrafts((current) => {
      const next = { ...current }
      let changed = false
      for (const identity of choiceIdentities.values()) {
        if (next[identity]) continue
        changed = true
        next[identity] = {
          barcode: "",
          enabled: true,
          price: "",
          quantity: "",
          quoteRequired: defaultQuoteRequired,
          sku: "",
          storeIds: [storeId],
          unitPrices: {},
        }
      }
      return changed ? next : current
    })
  }, [choiceIdentities, defaultQuoteRequired, storeId])

  function variantDraft(key: string): AdvancedVariantDraft {
    return (
      variantDrafts[choiceIdentities.get(key) ?? key] ?? {
        barcode: "",
        enabled: true,
        price: "",
        quantity: "",
        quoteRequired: defaultQuoteRequired,
        sku: "",
        storeIds: [storeId],
        unitPrices: {},
      }
    )
  }

  function updateVariantDraft(
    key: string,
    update: Partial<AdvancedVariantDraft>,
  ) {
    setVariantDrafts((current) => ({
      ...current,
      [choiceIdentities.get(key) ?? key]: {
        ...(current[choiceIdentities.get(key) ?? key] ?? variantDraft(key)),
        ...update,
      },
    }))
  }

  function hasStructuralDraft() {
    return (
      selectedHelperKey !== null ||
      showAdvanced ||
      showUnits ||
      showOpeningStock ||
      trackServiceWork ||
      additionalUnits.length > 0 ||
      Object.keys(variantDrafts).length > 0 ||
      form.openingStockQuantity.trim().length > 0 ||
      (form.kind === "product" && form.unitName.trim().length > 0) ||
      serviceGuidance.trim().length > 0 ||
      optionGroups.some((group) => group.name.trim() || group.values.trim())
    )
  }

  function commitHelper(helper: CatalogSetupHelper | null) {
    if (helper && helper.kind !== form.kind) return

    setError(null)
    setSelectedHelperKey(helper?.key ?? null)
    setVariantDrafts({})
    setServiceGuidance("")
    setDefaultQuoteRequired(false)
    setShowOpeningStock(false)

    if (!helper) {
      setShowAdvanced(false)
      setShowUnits(false)
      setAdditionalUnits([])
      setOptionGroups([newOptionGroup()])
      setCanonicalTransactionScale(DEFAULT_UNIT_TRANSACTION_SCALE)
      setTrackServiceWork(false)
      setServiceAuthorization("on_order_confirmation")
      setServiceQuantityScale(0)
      setForm((current) => ({
        ...current,
        openingStockQuantity: "",
        unitName: current.kind === "product" ? "" : current.unitName,
      }))
      setHelperPickerOpen(false)
      return
    }

    const application = buildCatalogSetupHelperApplication(helper)
    const groups = application.optionGroups.map((group) => ({
      id: globalThis.crypto.randomUUID(),
      name: group.name,
      values: group.values.join(", "),
    }))
    setOptionGroups(groups.length > 0 ? groups : [newOptionGroup()])
    setShowAdvanced(groups.length > 0)

    if (application.kind === "product") {
      setForm((current) => ({
        ...current,
        name: current.name.trim()
          ? current.name
          : (application.suggestedName ?? current.name),
        openingStockQuantity: "",
        unitName: application.canonicalUnit.name,
      }))
      setCanonicalTransactionScale(application.canonicalUnit.transactionScale)
      setAdditionalUnits(
        application.additionalUnits.map((unit) => {
          const relation = catalogUnitFactorToRelation(unit.factor)

          return {
            id: globalThis.crypto.randomUUID(),
            name: unit.name,
            price: "",
            referenceId: "canonical",
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
      setShowUnits(application.additionalUnits.length > 0)
      setTrackServiceWork(false)
    } else {
      setForm((current) => ({
        ...current,
        name: current.name.trim()
          ? current.name
          : (application.suggestedName ?? current.name),
      }))
      setAdditionalUnits([])
      setShowUnits(false)
      setCanonicalTransactionScale(DEFAULT_UNIT_TRANSACTION_SCALE)
      setTrackServiceWork(application.workPolicy === "tracked")
      setServiceAuthorization(application.authorizationPolicy)
      setServiceQuantityScale(application.quantityScale)
      setDefaultQuoteRequired(application.pricingPolicy === "quote_required")
    }

    setHelperPickerOpen(false)
  }

  function applyHelper(helper: CatalogSetupHelper | null) {
    const replacementAction = getCatalogSetupReplacementAction({
      currentKey: selectedHelperKey,
      hasStructuralDraft: hasStructuralDraft(),
      nextKey: helper?.key ?? null,
    })
    if (replacementAction === "close") {
      setHelperPickerOpen(false)
      return
    }

    if (replacementAction === "confirm") {
      setDraftConfirmation({ kind: "helper", helper })
      return
    }

    commitHelper(helper)
  }

  function enableOptions() {
    setShowAdvanced(true)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      photoSaveBusy.current ||
      photo.uploading ||
      createMutation.isPending ||
      createAssistantForm.isPending ||
      createAdvancedMutation.isPending
    )
      return
    if (editor.active !== "main") return
    if (createAdvancedMutation.variables) {
      createAdvancedMutation.mutate(createAdvancedMutation.variables)
      return
    }
    if (createMutation.variables) {
      createMutation.mutate(createMutation.variables)
      return
    }
    setError(null)
    const validationError = await validate()
    if (validationError) {
      setError(validationError)
      return
    }

    if (!form.kind || !form.name.trim()) {
      setError("Enter an item name.")
      return
    }

    if (showAdvanced && optionIssue) {
      setError(optionIssue)
      return
    }

    const quoteOnlyService = form.kind === "service" && defaultQuoteRequired
    const parsedPriceMinor = parsePrice(form.price)
    if (
      !showAdvanced &&
      !quoteOnlyService &&
      form.price.trim() &&
      parsedPriceMinor === null
    ) {
      setError("Enter a valid price with no more than two decimals.")
      return
    }
    if (
      form.kind === "service" &&
      !showAdvanced &&
      !quoteOnlyService &&
      parsedPriceMinor === null
    ) {
      setError("Enter a valid price.")
      return
    }
    const priceMinor = parsedPriceMinor ?? undefined

    if (
      showAdvanced ||
      photo.hasPhoto ||
      illustrationId ||
      category.trim() ||
      (form.kind === "product" &&
        (showUnits ||
          selectedHelperKey !== null ||
          sku.trim() ||
          barcode.trim())) ||
      quoteOnlyService
    ) {
      const activeCombinations = showAdvanced
        ? combinations
        : [{ key: "default", name: form.name.trim(), selections: [] }]
      if (
        showAdvanced &&
        (normalizedOptionGroups.some(
          (group) => !group.name || group.values.length === 0,
        ) ||
          activeCombinations.length === 0)
      ) {
        setError("Add a name and at least one value for every option.")
        return
      }
      const firstEnabledIndex = activeCombinations.findIndex(
        (combination) => variantDraft(combination.key).enabled,
      )
      if (firstEnabledIndex < 0) {
        setError("Keep at least one variant enabled.")
        return
      }

      let openingStockQuantity: string | undefined
      if (
        form.kind === "product" &&
        !showAdvanced &&
        showOpeningStock &&
        form.openingStockQuantity.trim()
      ) {
        try {
          openingStockQuantity = parseExactDecimal(form.openingStockQuantity, {
            maxScale: canonicalTransactionScale,
          })
        } catch (quantityError) {
          setError(
            quantityError instanceof Error
              ? quantityError.message
              : "Enter a valid opening stock quantity.",
          )
          return
        }
      }

      const invalidPriceCombination = activeCombinations.find((combination) => {
        const draft = variantDraft(combination.key)
        if (form.kind === "service" && draft.quoteRequired) return false
        if (form.kind === "product" && draft.orderTotal) return false
        const override = draft.price.trim()
        return override ? parsePrice(override) === null : false
      })
      if (invalidPriceCombination) {
        setError(`Enter a valid price for ${invalidPriceCombination.name}.`)
        return
      }

      const invalidProductQuantity =
        form.kind === "product" && showAdvanced
          ? activeCombinations.find((combination) => {
              const draft = variantDraft(combination.key)
              if (!draft.enabled || !draft.quantity.trim()) return false
              try {
                parseExactDecimal(draft.quantity, {
                  maxScale: canonicalTransactionScale,
                })
                return false
              } catch {
                return true
              }
            })
          : undefined
      if (invalidProductQuantity) {
        setError(`Enter current stock for ${invalidProductQuantity.name}.`)
        return
      }

      const missingFixedServicePrice =
        form.kind === "service"
          ? activeCombinations.find((combination) => {
              const draft = variantDraft(combination.key)
              return (
                !draft.quoteRequired &&
                (showAdvanced ? !draft.price.trim() : parsedPriceMinor === null)
              )
            })
          : undefined
      if (missingFixedServicePrice) {
        setError(`Enter a price for ${missingFixedServicePrice.name}.`)
        return
      }

      let unitFactors: Map<string, string>
      try {
        unitFactors = resolveCatalogUnitFactors(additionalUnits)
        for (const unit of additionalUnits) {
          if (!unit.name.trim()) throw new Error("Enter every unit name.")
          if (unit.price.trim() && parsePrice(unit.price) === null) {
            throw new Error(`Enter a valid price for ${unit.name}.`)
          }
        }
      } catch (unitError) {
        setError(
          unitError instanceof Error
            ? unitError.message
            : "Review the selling units.",
        )
        return
      }

      const invalidVariantUnitPrice =
        form.kind === "product"
          ? activeCombinations
              .filter((combination) => {
                const draft = variantDraft(combination.key)
                return draft.enabled && !draft.orderTotal
              })
              .flatMap((combination) =>
                additionalUnits.map((unit) => ({
                  combination,
                  unit,
                  value:
                    variantDraft(combination.key).unitPrices[unit.id]?.trim() ??
                    "",
                })),
              )
              .find(({ value }) => value && parsePrice(value) === null)
          : undefined
      if (invalidVariantUnitPrice) {
        setError(
          `Enter a valid ${invalidVariantUnitPrice.unit.name} price for ${invalidVariantUnitPrice.combination.name}.`,
        )
        return
      }

      const variantRows = activeCombinations.map((combination, index) => {
        const draft = variantDraft(combination.key)
        const variantPriceMinor = showAdvanced
          ? draft.price.trim()
            ? (parsePrice(draft.price) ?? undefined)
            : undefined
          : priceMinor
        const storeAvailability = stores.map((candidate) => ({
          isAvailable: draft.storeIds.includes(candidate.id),
          storeId: candidate.id,
        }))
        const commonOffering = {
          enabled: draft.enabled,
          key: `offering-${index + 1}`,
          name: combination.name,
          storeAvailability:
            storeAvailability.length > 0
              ? storeAvailability
              : [{ isAvailable: true, storeId }],
        }

        return {
          commonOffering,
          draft,
          enabled: draft.enabled,
          isDefault: index === firstEnabledIndex,
          key: combination.key,
          name: combination.name,
          selections: combination.selections,
          variantPriceMinor,
        }
      })

      try {
        if (form.kind === "product") {
          if (!form.unitName.trim()) {
            setError("Enter the Product's main unit.")
            return
          }
          await createAdvancedWithPhoto({
            clientOperationId: clientOperationId.current,
            category: category.trim() || undefined,
            description: form.description.trim() || undefined,
            kind: "product",
            usage: form.usage,
            name: form.name.trim(),
            openingStockQuantity,
            optionGroups: showAdvanced ? normalizedOptionGroups : undefined,
            storeId,
            unitConfiguration: {
              canonicalBalanceScale: EXACT_CANONICAL_MAX_SCALE,
              units: [
                {
                  factor: "1",
                  key: "canonical",
                  name: form.unitName.trim(),
                  stockBehavior: "canonical_shared",
                  transactionScale: canonicalTransactionScale,
                },
                ...additionalUnits.map((unit, unitIndex) => ({
                  factor: unitFactors.get(unit.id) ?? "",
                  key: unitKey(unitIndex),
                  name: unit.name.trim(),
                  stockBehavior: unit.stockBehavior,
                  transactionScale: unit.transactionScale,
                })),
              ],
            },
            variants: variantRows.map(
              (
                { commonOffering, draft, variantPriceMinor, ...variant },
                variantIndex,
              ) => ({
                ...variant,
                openingStockQuantity:
                  showAdvanced && draft.quantity.trim()
                    ? parseExactDecimal(draft.quantity, {
                        maxScale: canonicalTransactionScale,
                      })
                    : undefined,
                offerings: [
                  {
                    ...commonOffering,
                    barcode:
                      (showAdvanced ? draft.barcode : barcode).trim() ||
                      undefined,
                    fixedPriceMinor: draft.orderTotal
                      ? undefined
                      : variantPriceMinor,
                    inventoryUnitKey: "canonical",
                    pricingPolicy: draft.orderTotal
                      ? ("order_total" as const)
                      : ("fixed" as const),
                    sku: (showAdvanced ? draft.sku : sku).trim() || undefined,
                  },
                  ...additionalUnits.map((unit, unitIndex) => ({
                    ...commonOffering,
                    barcode: undefined,
                    fixedPriceMinor: draft.orderTotal
                      ? undefined
                      : draft.unitPrices[unit.id]?.trim()
                        ? (parsePrice(draft.unitPrices[unit.id] ?? "") ??
                          variantPriceMinor)
                        : unit.price.trim()
                          ? (parsePrice(unit.price) ?? variantPriceMinor)
                          : undefined,
                    inventoryUnitKey: unitKey(unitIndex),
                    key: `offering-${variantIndex + 1}-${unitIndex + 2}`,
                    name: `${variant.name} · ${unit.name.trim()}`,
                    pricingPolicy: draft.orderTotal
                      ? ("order_total" as const)
                      : ("fixed" as const),
                    sku: undefined,
                  })),
                ],
              }),
            ),
          })
        } else {
          await createAdvancedWithPhoto({
            clientOperationId: clientOperationId.current,
            category: category.trim() || undefined,
            description: form.description.trim() || undefined,
            kind: "service",
            name: form.name.trim(),
            optionGroups: showAdvanced ? normalizedOptionGroups : undefined,
            storeId,
            variants: variantRows.map(
              ({ commonOffering, draft, variantPriceMinor, ...variant }) => ({
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
                        fixedPriceMinor: variantPriceMinor ?? 0,
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
      } catch (advancedError) {
        setError(
          advancedError instanceof Error
            ? advancedError.message
            : "Review the advanced setup.",
        )
      }
      return
    }

    if (form.kind === "service") {
      createMutation.mutate({
        clientOperationId: clientOperationId.current,
        description: form.description.trim() || undefined,
        kind: "service",
        name: form.name.trim(),
        priceMinor: parsedPriceMinor ?? 0,
        authorizationPolicy: serviceAuthorization,
        guidance: serviceGuidance.trim() || undefined,
        quantityScale: serviceQuantityScale,
        storeId,
        workPolicy: trackServiceWork ? "tracked" : "charge_only",
      })
      return
    }

    if (!form.unitName.trim()) {
      setError("Enter the Product's main unit.")
      return
    }

    let openingStockQuantity: string | undefined
    if (showOpeningStock && form.openingStockQuantity.trim()) {
      try {
        openingStockQuantity = parseExactDecimal(form.openingStockQuantity, {
          maxScale: canonicalTransactionScale,
        })
      } catch (quantityError) {
        setError(
          quantityError instanceof Error
            ? quantityError.message
            : "Enter a valid opening stock quantity.",
        )
        return
      }
    }

    createSimpleWithAssistant({
      canonicalUnitName: form.unitName.trim(),
      clientOperationId: clientOperationId.current,
      description: form.description.trim() || undefined,
      kind: "product",
      name: form.name.trim(),
      usage: form.usage,
      openingStockQuantity,
      priceMinor,
      storeId,
    })
  }

  if (!form.kind) return null
  const suggestionsDisabled =
    photo.uploading ||
    createMutation.isPending ||
    createAssistantForm.isPending ||
    createAdvancedMutation.isPending

  const footerAction =
    editor.active !== "main" ? (
      <Button
        type="button"
        className="w-full"
        appearance="form"
        onClick={editor.back}
      >
        <CatalogFooterLabel>
          {editor.parent === "units"
            ? "Done · back to selling units"
            : editor.parent === "options"
              ? "Done · back to customer choices"
              : "Done · back to setup"}
        </CatalogFooterLabel>
      </Button>
    ) : (
      <SubmitButton
        isSubmitting={suggestionsDisabled}
        type="submit"
        form="catalog-item-create-form"
        className="w-full"
        disabled={suggestionsDisabled}
      >
        <CatalogFooterLabel>
          {suggestionsDisabled
            ? "Adding…"
            : createMutation.variables || createAdvancedMutation.variables
              ? "Retry same item"
              : form.kind === "product"
                ? "Add product"
                : "Add service"}
        </CatalogFooterLabel>
      </SubmitButton>
    )

  return (
    <>
      {catalogCreateMode === "chat" ? (
        productState.data ? (
          <ProductChat
            data={productState.data}
            currencyCode={currencyCode}
            onBack={backToForm}
            onCreated={(name) => {
              void setCatalogItemMode(null)
              onCreated(name)
            }}
            onAnother={() => {
              setForm({
                kind: "product",
                name: "",
                description: "",
                unitName: "",
                price: "",
                openingStockQuantity: "",
                usage: "FOR_SALE",
              })
              void setParams({
                catalogConversation: null,
                catalogCreateMode: "chat",
              })
            }}
          />
        ) : (
          <div className="space-y-4 p-6">
            <output>
              {productState.isError
                ? productState.error.message
                : "Preparing your product chat…"}
            </output>
            <Button
              variant="outline"
              onClick={() => void setParams({ catalogCreateMode: "form" })}
            >
              Back to form
            </Button>
          </div>
        )
      ) : null}
      <form
        id="catalog-item-create-form"
        className={catalogCreateMode === "chat" ? "hidden" : "flex flex-col"}
        onSubmit={submit}
        noValidate
        hidden={catalogCreateMode === "chat"}
        inert={
          startProductChat.isPending ||
          updateProductChat.isPending ||
          photo.uploading
        }
      >
        {form.kind === "product" && capability.data?.enabled ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-4">
            <div>
              <p className="text-sm font-medium">Create with AI</p>
              <p className="text-xs text-muted-foreground">
                Describe your product and we'll help fill in the details.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={startProductChat.isPending || photo.uploading}
              onClick={() => void openProductChat()}
            >
              {startProductChat.isPending
                ? "Starting…"
                : catalogConversation
                  ? "Continue product chat"
                  : "Create with AI"}
            </Button>
          </div>
        ) : null}
        {handoffError ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {handoffError}
          </p>
        ) : null}
        <CatalogSetupHelperPicker
          key={`${storeId}:${businessProfileKey ?? ""}:${form.kind}`}
          businessProfileKey={businessProfileKey}
          kind={form.kind}
          onClose={() => setHelperPickerOpen(false)}
          onSelect={applyHelper}
          open={helperPickerOpen}
          selectedKey={selectedHelperKey}
        />
        <ConfirmDraftModal
          className={themeClass}
          open={draftConfirmation !== null}
          onOpenChange={(open) => {
            if (!open) setDraftConfirmation(null)
          }}
          title={
            draftConfirmation?.kind === "remove-options"
              ? "Remove all customer choices?"
              : draftConfirmation?.kind === "options"
                ? "Use stock for each choice?"
                : "Replace current setup?"
          }
          description={
            draftConfirmation?.kind === "remove-options"
              ? form.kind === "service"
                ? "Remove the packages and their individual prices? Your single-service fixed-price draft is kept."
                : "Remove the choices and their individual prices, stock and codes? Your single-product draft is kept."
              : draftConfirmation?.kind === "options"
                ? "Customer choices use separate stock. Your single-product opening stock stays in the draft while choices are enabled."
                : "Replace the current units, options, prices, and stock setup?"
          }
          confirmLabel={
            draftConfirmation?.kind === "remove-options"
              ? "Remove choices"
              : draftConfirmation?.kind === "options"
                ? "Add options"
                : "Replace setup"
          }
          onConfirm={() => {
            if (draftConfirmation?.kind === "helper")
              commitHelper(draftConfirmation.helper)
            else if (draftConfirmation?.kind === "options") enableOptions()
            else if (draftConfirmation?.kind === "remove-options") {
              setShowAdvanced(false)
              setVariantDrafts({})
              setOptionGroups([newOptionGroup()])
            }
          }}
        />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div ref={editor.containerRef} className="min-w-0">
            <fieldset
              disabled={Boolean(
                suggestionsDisabled ||
                  createMutation.variables ||
                  createAdvancedMutation.variables,
              )}
              className="min-w-0"
            >
              <CatalogEditorPanel
                active={editor.active === "main"}
                editor="main"
              >
                <FieldGroup className="gap-4">
                  <QaDashboardQuickFill
                    canUndo={canUndoQuickFill}
                    formId="dashboard.catalog.item"
                    isDirty={Boolean(
                      form.name || form.price || form.description,
                    )}
                    onFill={(context, sequence) => {
                      quickFillSnapshot.current = form
                      const fixture = createCatalogFixture(context, sequence)
                      setForm((current) => ({
                        ...current,
                        description: fixture.description,
                        kind: current.kind ?? "product",
                        name: fixture.name,
                        openingStockQuantity:
                          current.kind === "service" ? "" : "12",
                        price: fixture.price,
                        unitName:
                          current.kind === "service" ? "" : fixture.unit,
                      }))
                      setShowDescription(true)
                      if (form.kind !== "service") setShowOpeningStock(true)
                      setCanUndoQuickFill(true)
                    }}
                    onUndo={() => {
                      if (!quickFillSnapshot.current) return
                      setForm(quickFillSnapshot.current)
                      quickFillSnapshot.current = null
                      setCanUndoQuickFill(false)
                    }}
                  />
                  <Button
                    appearance="form"
                    type="button"
                    className="w-full justify-center"
                    onClick={() => setHelperPickerOpen(true)}
                    variant="outline"
                  >
                    {selectedHelper
                      ? `Quick setup: ${selectedHelper.title}`
                      : "Choose a quick setup"}
                  </Button>

                  <Field
                    htmlFor="catalog-item-name"
                    label={
                      form.kind === "product" ? "Product name" : "Service name"
                    }
                  >
                    <TextInput
                      maxLength={160}
                      id="catalog-item-name"
                      autoFocus
                      autoComplete="off"
                      placeholder={formGuidance.name.placeholder}
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      required
                    />
                  </Field>

                  {form.kind === "product" ? (
                    <ProductUsageField
                      value={form.usage}
                      onChange={(usage) =>
                        setForm((current) => ({ ...current, usage }))
                      }
                    />
                  ) : null}
                  <div
                    hidden={
                      showAdvanced ||
                      (form.kind === "service" && defaultQuoteRequired)
                    }
                  >
                    <Field
                      htmlFor="catalog-item-price"
                      label={
                        form.kind === "service"
                          ? "Fixed price"
                          : `Selling price per ${form.unitName.trim() || "main unit"} (optional)`
                      }
                    >
                      <CurrencyInput
                        id="catalog-item-price"
                        currencyCode={currencyCode}
                        value={form.price}
                        onValueChange={(value) =>
                          setForm((current) => ({ ...current, price: value }))
                        }
                        required={
                          form.kind === "service" &&
                          !defaultQuoteRequired &&
                          !showAdvanced
                        }
                      />
                    </Field>
                  </div>
                  {showAdvanced ? (
                    <p className="text-sm text-muted-foreground">
                      Set each choice’s price in{" "}
                      {form.kind === "service"
                        ? "Packages or customer choices"
                        : "Customer choices"}
                      .
                    </p>
                  ) : null}
                  {form.kind === "service" && defaultQuoteRequired ? (
                    <Alert appearance="dashboard">
                      <AlertTitle>Quote each job</AlertTitle>
                      <AlertDescription>
                        Confirm the amount after the request. A quote alone does
                        not start tracked work.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {form.kind === "product" ? (
                    <Field htmlFor="catalog-item-unit" label="Main unit">
                      <TextInput
                        id="catalog-item-unit"
                        autoComplete="off"
                        placeholder={formGuidance.stockUnit?.placeholder}
                        value={form.unitName}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            unitName: event.target.value,
                          }))
                        }
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        {formGuidance.stockUnit?.helperText}
                      </p>
                      <CatalogGuidanceSuggestions
                        label="Stock unit suggestions"
                        values={formGuidance.stockUnit?.suggestions ?? []}
                        disabled={suggestionsDisabled}
                        onSelect={(unitName) =>
                          setForm((current) => ({ ...current, unitName }))
                        }
                      />
                    </Field>
                  ) : null}

                  <Separator />
                  <FieldSet className="gap-1 pt-3">
                    <FieldLegend className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold">
                        More details
                      </span>
                      <span className="text-sm font-normal text-muted-foreground">
                        Optional
                      </span>
                    </FieldLegend>
                    <CatalogDetailRow
                      icon={Image01Icon}
                      title="Images"
                      summary={
                        illustrationId
                          ? (findCatalogIllustration(illustrationId)?.label ??
                            "Illustration selected")
                          : photo.file
                            ? "Photo selected"
                            : "Photos or illustrations that describe this item."
                      }
                      onClick={() => editor.open("images")}
                    />
                    <CatalogDetailRow
                      icon={Tag01Icon}
                      title="Category"
                      summary={category.trim() || "Uncategorized"}
                      onClick={() => editor.open("category")}
                    />
                    {form.kind === "service" ? (
                      <CatalogDetailRow
                        icon={Money03Icon}
                        title="How you charge"
                        summary={
                          defaultQuoteRequired
                            ? "Quote each job"
                            : "Fixed price"
                        }
                        onClick={() => editor.open("pricing")}
                      />
                    ) : null}
                    <CatalogDetailRow
                      icon={Layers01Icon}
                      title={
                        form.kind === "service"
                          ? "Packages or customer choices"
                          : "Customer choices"
                      }
                      summary={
                        showAdvanced
                          ? `${combinations.length} choices · prices set individually`
                          : formGuidance.options.helperText
                      }
                      onClick={() => editor.open("options")}
                    />
                    {form.kind === "product" ? (
                      <>
                        <CatalogDetailRow
                          icon={Package01Icon}
                          title="Selling units"
                          summary={
                            additionalUnits.length
                              ? additionalUnits
                                  .map((unit) => unit.name || "Unnamed unit")
                                  .join(" · ")
                              : "Sell trays or packs as well as single units."
                          }
                          onClick={() => editor.open("units")}
                        />
                        <CatalogDetailRow
                          icon={WarehouseIcon}
                          title="Opening stock"
                          summary={
                            showAdvanced
                              ? "Set stock for each customer choice."
                              : form.openingStockQuantity.trim()
                                ? `${form.openingStockQuantity} ${form.unitName}`
                                : "Record what you have on hand. Optional."
                          }
                          onClick={() =>
                            editor.open(showAdvanced ? "options" : "stock")
                          }
                        />
                      </>
                    ) : (
                      <CatalogDetailRow
                        icon={Task01Icon}
                        title="Work settings"
                        summary={
                          trackServiceWork
                            ? "Track work after order confirmation"
                            : "Charge only · no tracked job"
                        }
                        onClick={() => editor.open("work")}
                      />
                    )}
                    <CatalogDetailRow
                      icon={TextAlignLeftIcon}
                      title="Description"
                      summary={
                        form.description.trim()
                          ? "Description added"
                          : "Explain what customers should know."
                      }
                      onClick={() => editor.open("description")}
                    />
                    {form.kind === "product" ? (
                      <CatalogDetailRow
                        icon={BarcodeScanIcon}
                        title="SKU and barcode"
                        summary={
                          showAdvanced
                            ? "Set inventory codes for each customer choice."
                            : sku || barcode
                              ? "Inventory codes added"
                              : "Optional codes for finding this product."
                        }
                        onClick={() => editor.open("codes")}
                      />
                    ) : null}
                  </FieldSet>
                </FieldGroup>
              </CatalogEditorPanel>
              <CatalogDetailEditor
                active={editor.active}
                editor="images"
                title="Images"
                description="A photo or illustration describes the Product or Service. Saving it does not publish a storefront or attach private job evidence."
                onBack={editor.back}
              >
                <CatalogImageEditor
                  photo={photo}
                  illustrationId={illustrationId}
                  onIllustrationChange={setIllustrationId}
                  businessProfileKey={businessProfileKey}
                  category={category}
                  kind={form.kind}
                  disabled={
                    suggestionsDisabled ||
                    Boolean(createAdvancedMutation.variables)
                  }
                />
              </CatalogDetailEditor>
              <CatalogDetailEditor
                active={editor.active}
                editor="category"
                title="Category"
                description="Group this item for browsing. Leave it Uncategorized if no category fits."
                onBack={editor.back}
              >
                <CatalogCategoryEditor
                  businessProfileKey={businessProfileKey}
                  kind={form.kind}
                  category={category}
                  enabled={editor.active === "category"}
                  storeId={storeId}
                  onChange={setCategory}
                />
              </CatalogDetailEditor>
              <CatalogDetailEditor
                active={editor.active}
                editor="description"
                title="Description"
                description="Explain the item in customer-friendly language. This does not publish the item."
                onBack={editor.back}
              >
                <Field
                  htmlFor="catalog-item-description"
                  label="Description (optional)"
                >
                  <Textarea
                    id="catalog-item-description"
                    maxLength={2000}
                    placeholder={formGuidance.description.placeholder}
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </Field>
              </CatalogDetailEditor>
              {form.kind === "product" ? (
                <>
                  <CatalogDetailEditor
                    active={editor.active}
                    editor="stock"
                    title="Opening stock"
                    description="Enter stock you actually have, counted in the main unit. Blank means no opening stock is declared."
                    onBack={editor.back}
                  >
                    <Field htmlFor="catalog-stock-store" label="Store">
                      <StoreSelector
                        value={
                          stores.find((store) => store.id === storeId) ?? null
                        }
                        disabled={
                          suggestionsDisabled ||
                          Boolean(createAdvancedMutation.variables) ||
                          Boolean(createMutation.variables)
                        }
                        onChange={(store) => {
                          setStockStoreId(store.id)
                          setVariantDrafts((current) =>
                            Object.fromEntries(
                              Object.entries(current).map(([key, draft]) => [
                                key,
                                {
                                  ...draft,
                                  storeIds: Array.from(
                                    new Set([...draft.storeIds, store.id]),
                                  ),
                                },
                              ]),
                            ),
                          )
                        }}
                      />
                    </Field>
                    <Field
                      htmlFor="catalog-opening-stock"
                      label={`Opening stock in ${form.unitName || "main units"} (optional)`}
                    >
                      <TextInput
                        id="catalog-opening-stock"
                        inputMode="decimal"
                        value={form.openingStockQuantity}
                        onChange={(event) => {
                          setShowOpeningStock(true)
                          setForm((current) => ({
                            ...current,
                            openingStockQuantity: event.target.value,
                          }))
                        }}
                      />
                    </Field>
                  </CatalogDetailEditor>
                  <CatalogDetailEditor
                    active={editor.active}
                    editor="codes"
                    title="SKU and barcode"
                    description="Codes identify the main selling unit of this Product or each enabled customer choice."
                    onBack={editor.back}
                  >
                    {showAdvanced &&
                    !combinations.some(
                      (combination) => variantDraft(combination.key).enabled,
                    ) ? (
                      <p className="text-sm text-muted-foreground">
                        Add or enable a choice in Customer choices to enter its
                        codes.
                      </p>
                    ) : null}
                    {showAdvanced ? (
                      combinations
                        .filter(
                          (combination) =>
                            variantDraft(combination.key).enabled,
                        )
                        .map((combination) => {
                          const draft = variantDraft(combination.key)
                          return (
                            <FieldSet
                              key={
                                choiceIdentities.get(combination.key) ??
                                combination.key
                              }
                            >
                              <FieldLegend>{combination.name}</FieldLegend>
                              <FieldGroup>
                                <Field
                                  htmlFor={`catalog-sku-${combination.key}`}
                                  label="SKU (optional)"
                                >
                                  <TextInput
                                    id={`catalog-sku-${combination.key}`}
                                    maxLength={120}
                                    value={draft.sku}
                                    onChange={(event) =>
                                      updateVariantDraft(combination.key, {
                                        sku: event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field
                                  htmlFor={`catalog-barcode-${combination.key}`}
                                  label="Barcode (optional)"
                                >
                                  <TextInput
                                    id={`catalog-barcode-${combination.key}`}
                                    maxLength={120}
                                    value={draft.barcode}
                                    onChange={(event) =>
                                      updateVariantDraft(combination.key, {
                                        barcode: event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                              </FieldGroup>
                            </FieldSet>
                          )
                        })
                    ) : (
                      <>
                        <Field
                          htmlFor="catalog-item-sku"
                          label="SKU (optional)"
                        >
                          <TextInput
                            id="catalog-item-sku"
                            maxLength={120}
                            value={sku}
                            onChange={(event) => setSku(event.target.value)}
                          />
                        </Field>
                        <Field
                          htmlFor="catalog-item-barcode"
                          label="Barcode (optional)"
                        >
                          <TextInput
                            id="catalog-item-barcode"
                            maxLength={120}
                            value={barcode}
                            onChange={(event) => setBarcode(event.target.value)}
                          />
                        </Field>
                      </>
                    )}
                  </CatalogDetailEditor>
                </>
              ) : (
                <CatalogDetailEditor
                  active={editor.active}
                  editor="pricing"
                  title="How you charge"
                  description="Choose a known amount before ordering, or confirm a quote after the request. Each customer choice can use its own policy."
                  onBack={editor.back}
                >
                  <ToggleGroup
                    value={[defaultQuoteRequired ? "quote" : "fixed"]}
                    onValueChange={(values) => {
                      if (values.length)
                        setDefaultQuoteRequired(values[0] === "quote")
                    }}
                    variant="outline"
                    aria-label="Service pricing"
                  >
                    <ToggleGroupItem value="fixed">Fixed price</ToggleGroupItem>
                    <ToggleGroupItem value="quote">
                      Quote each job
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {defaultQuoteRequired ? (
                    <p className="text-sm text-muted-foreground">
                      A starting price cannot be saved yet. Your fixed-price
                      draft is kept when you switch back.
                    </p>
                  ) : (
                    <Field
                      htmlFor="catalog-service-fixed-price"
                      label="Fixed price"
                    >
                      <CurrencyInput
                        id="catalog-service-fixed-price"
                        currencyCode={currencyCode}
                        value={form.price}
                        onValueChange={(price) =>
                          setForm((current) => ({ ...current, price }))
                        }
                      />
                    </Field>
                  )}
                </CatalogDetailEditor>
              )}
              <CatalogDetailEditor
                active={editor.active}
                editor="work"
                title="Work settings"
                description="Charge only records the Service on an Order without a tracked job. Track work creates work after a confirmed Order; a quote request alone creates none."
                onBack={editor.back}
              >
                <ToggleGroup
                  value={[trackServiceWork ? "tracked" : "charge_only"]}
                  onValueChange={(values) => {
                    if (values.length)
                      setTrackServiceWork(values[0] === "tracked")
                  }}
                  variant="outline"
                  aria-label="Service work policy"
                >
                  <ToggleGroupItem value="charge_only">
                    Charge only
                  </ToggleGroupItem>
                  <ToggleGroupItem value="tracked">Track work</ToggleGroupItem>
                </ToggleGroup>
                {form.kind === "service" && trackServiceWork ? (
                  <section className="grid gap-4 border border-border bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium">Tracked work</h3>
                        <p className="text-xs text-muted-foreground">
                          Orders for this offering create work lines in the
                          Service queue.
                        </p>
                      </div>
                      <Button
                        appearance="form"
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setTrackServiceWork(false)}
                      >
                        Remove
                      </Button>
                    </div>
                    <Field
                      htmlFor="service-work-authorization"
                      label="Work can start"
                    >
                      <SelectControl
                        popupClassName={themeClass}
                        id="service-work-authorization"
                        value={serviceAuthorization}
                        onValueChange={(value) =>
                          setServiceAuthorization(
                            value as typeof serviceAuthorization,
                          )
                        }
                        options={[
                          {
                            value: "on_order_confirmation",
                            label: <>When order is confirmed</>,
                          },
                          {
                            value: "after_required_payment",
                            label: <>After required payment</>,
                          },
                          {
                            value: "manual_release",
                            label: <>After manager release</>,
                          },
                        ]}
                      />
                      <p className="text-xs text-muted-foreground">
                        {serviceAuthorization === "manual_release"
                          ? "A manager authorizes work separately. Release does not mark the Order paid."
                          : serviceAuthorization === "after_required_payment"
                            ? "Hold work until the Order’s required payment is received."
                            : "Work may start when the Order is confirmed; payment is not required before starting."}
                      </p>
                    </Field>
                    <Field
                      htmlFor="service-guidance"
                      label="Customer guidance (optional)"
                    >
                      <TextInput
                        id="service-guidance"
                        placeholder="What the customer should know"
                        value={serviceGuidance}
                        onChange={(event) =>
                          setServiceGuidance(event.target.value)
                        }
                      />
                    </Field>
                  </section>
                ) : null}
              </CatalogDetailEditor>
              {form.kind === "product" && editor.active === "options" ? (
                <div className="grid gap-2">
                  <p className="text-sm font-medium">Stock store</p>
                  <StoreSelector
                    label="Stock store"
                    value={stores.find((store) => store.id === storeId) ?? null}
                    disabled={
                      suggestionsDisabled ||
                      Boolean(createAdvancedMutation.variables)
                    }
                    onChange={(store) => {
                      setStockStoreId(store.id)
                      setVariantDrafts((current) =>
                        Object.fromEntries(
                          Object.entries(current).map(([key, draft]) => [
                            key,
                            {
                              ...draft,
                              storeIds: Array.from(
                                new Set([...draft.storeIds, store.id]),
                              ),
                            },
                          ]),
                        ),
                      )
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Opening quantities below belong to this store. Add stock at
                    other stores from Inventory after saving.
                  </p>
                </div>
              ) : null}
              <CatalogOptionsEditor
                active={editor.active}
                additionalUnits={additionalUnits}
                combinations={combinations}
                currencyCode={currencyCode}
                form={{ kind: form.kind, unitName: form.unitName }}
                formGuidance={formGuidance}
                hasOpeningStock={Boolean(form.openingStockQuantity.trim())}
                onBack={editor.back}
                onConfirmOptions={() =>
                  setDraftConfirmation({ kind: "options" })
                }
                onEnable={enableOptions}
                onOpen={editor.open}
                onRemove={() =>
                  setDraftConfirmation({ kind: "remove-options" })
                }
                optionGroups={optionGroups}
                optionIssue={optionIssue}
                setOptionGroups={setOptionGroups}
                showAdvanced={showAdvanced}
                stores={stores}
                suggestionsDisabled={suggestionsDisabled}
                updateVariantDraft={updateVariantDraft}
                variantDraft={variantDraft}
              />
              {form.kind === "product" ? (
                <CatalogSellingUnitsEditor
                  active={editor.active}
                  canonicalName={form.unitName}
                  currencyCode={currencyCode}
                  onBack={editor.back}
                  onChange={(units) => {
                    setAdditionalUnits(units)
                    setShowUnits(units.length > 0)
                  }}
                  onError={setError}
                  onOpen={editor.open}
                  units={additionalUnits}
                />
              ) : null}
            </fieldset>
          </div>
          <aside
            className="hidden lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-0"
            aria-label="Setup summary"
          >
            <Badge variant="secondary">
              {form.kind === "product" ? "Product" : "Service"} · Draft
            </Badge>
            <h3 className="break-words font-medium">
              {form.name.trim() || "Your new item"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {showAdvanced
                ? `${combinations.length} customer choices`
                : defaultQuoteRequired
                  ? "Quote each job"
                  : form.price.trim()
                    ? `${currencyCode} ${form.price}${form.kind === "product" ? ` / ${form.unitName || "main unit"}` : ""}`
                    : "Price not set"}
            </p>
            <p className="text-sm text-muted-foreground">
              {category.trim() || "Uncategorized"}
            </p>
            {form.kind === "product" ? (
              <p className="text-sm text-muted-foreground">
                {form.unitName || "Choose a main unit"}
                {additionalUnits.length
                  ? ` + ${additionalUnits.length} selling units`
                  : ""}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {trackServiceWork ? "Tracked work" : "Charge only"}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Start with the essentials. Optional editors keep your draft when
              you return.
            </p>
          </aside>
        </div>
        {error ? (
          <FormFeedback appearance="dashboard">{error}</FormFeedback>
        ) : null}
        {(createMutation.variables || createAdvancedMutation.variables) &&
        error ? (
          <Alert appearance="dashboard">
            <AlertTitle>Creation has not been confirmed</AlertTitle>
            <AlertDescription>
              Retry sends the same item and operation ID. Keep this form open
              while the result is uncertain.
            </AlertDescription>
          </Alert>
        ) : null}

        {catalogCreateMode === "chat"
          ? null
          : footerHost
            ? createPortal(footerAction, footerHost)
            : footerAction}
      </form>
    </>
  )
}
