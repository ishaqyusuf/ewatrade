"use client"
import {
  ControlField,
  FieldGroup,
  FieldSet,
  FormActions,
  Input,
  SelectControl,
  SubmitButton,
  Textarea,
} from "@ewatrade/ui"

import {
  CatalogSection,
  CatalogSections,
} from "@/components/catalog-item/catalog-detail-editor"
import { FormFeedback } from "@/components/forms/form-feedback"

import {
  createInventoryConversionFixture,
  createInventoryFixture,
} from "@/components/qa/fixture-recipes"
import { QaDashboardQuickFill } from "@/components/qa/qa-quick-fill"
import { useInventoryParams } from "@/hooks/use-inventory-params"
import { inventoryOperationRecovery } from "@/lib/inventory-operation-recovery"
import {
  inventoryQuantityTotal,
  inventoryQuantityUnits,
  normalizeQuantityInput,
  plainQuantityError,
} from "@/lib/inventory-quantity"
import {
  formatStockQuantity,
  initialInventorySource,
  pluralizeUnitName,
} from "@/lib/inventory-view"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"

import { StoreSelector } from "@/components/stores/store-selector"
import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
import {
  type StockCategoryDraft,
  collectStockCategoryDraft,
  stockCategorySelectors,
} from "@ewatrade/utils/inventory-categories"
import { Note01Icon, Store01Icon } from "@hugeicons/core-free-icons"
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useRef, useState } from "react"
import { InventoryQuantityInput } from "./inventory-quantity-input"
import { InventoryReceiptSource } from "./inventory-receipt-source"
import { StockCategoriesInput } from "./stock-categories-input"

type StoreSummary = { currencyCode: string; id: string; name: string }

type FormCopy = {
  quantity: string
  missingQuantity: string
  save: string
  reasonLabel?: string
  presets?: readonly string[]
}

/** The words each stock form uses; loss and the two adjustment directions differ. */
function formCopy(
  operation: string | null,
  isLoss: boolean,
  direction: "increase" | "decrease",
  custodyToStaff: boolean,
): FormCopy {
  if (isLoss)
    return {
      quantity: "How many?",
      missingQuantity: "Enter how many were damaged or lost.",
      save: "Save loss",
      reasonLabel: "What happened?",
      presets: ["Broken", "Died", "Expired", "Spoilt", "Stolen"],
    }
  switch (operation) {
    case "receipt":
      return {
        quantity: "How many came in?",
        missingQuantity: "Enter how many came in.",
        save: "Save stock in",
        reasonLabel: "Where did it come from?",
        presets: [
          "Bought from supplier",
          "Made or collected",
          "Returned by customer",
        ],
      }
    case "adjustment":
      return direction === "increase"
        ? {
            quantity: "How many to add?",
            missingQuantity: "Enter how many to add.",
            save: "Save correction",
            reasonLabel: "Why?",
            presets: ["Found", "Counting mistake"],
          }
        : {
            quantity: "How many to remove?",
            missingQuantity: "Enter how many to remove.",
            save: "Save correction",
            reasonLabel: "Why?",
            presets: ["Counting mistake", "Expired", "Given away"],
          }
    case "internal_use":
      return {
        quantity: "How many did you use?",
        missingQuantity: "Enter how many you used.",
        save: "Save use",
      }
    case "count":
      return {
        quantity: "How many do you have now?",
        missingQuantity: "Enter how many you counted.",
        save: "Save count",
      }
    case "transformation":
      return {
        quantity: "How many to take from loose stock?",
        missingQuantity: "Enter how many to take from loose stock.",
        save: "Save packing",
      }
    case "custody":
      return {
        quantity: "How many?",
        missingQuantity: "Enter how many.",
        save: custodyToStaff ? "Give stock" : "Take back",
      }
    case "transfer":
      return {
        quantity: "How many to send?",
        missingQuantity: "Enter how many to send.",
        save: "Send stock",
      }
    default:
      return {
        quantity: "How many?",
        missingQuantity: "Enter how many.",
        save: "Save",
      }
  }
}
/** A sent stock command, kept so a retry repeats the exact same request. */
type RetainedOperation =
  | {
      kind: "balance"
      input: RouterInputs["inventory"]["postBalanceOperation"]
    }
  | { kind: "use"; input: RouterInputs["inventory"]["recordInternalUse"] }

const field =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

export function InventoryOperationForm({
  store: initialStore,
}: {
  store: StoreSummary
}) {
  const [store, setStore] = useState(initialStore)
  const [preparingStock, setPreparingStock] = useState(false)
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { operation, productId, balanceId, preset, setParams } =
    useInventoryParams()
  const { data: balances, isFetching: refreshingBalances } = useSuspenseQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: true, storeId: store.id },
      { retry: false },
    ),
  )
  const storesQuery = useQuery(trpc.tenant.stores.queryOptions())
  const assigneesQuery = useQuery(trpc.services.assignees.queryOptions())
  const rows = balances.rows
  const [sourceId, setSourceId] = useState(() =>
    initialInventorySource(
      productId ? rows.filter((row) => row.productId === productId) : rows,
      balanceId,
      productId,
    ),
  )
  const [enteredUnitId, setEnteredUnitId] = useState("")
  const [targetId, setTargetId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [targetQuantity, setTargetQuantity] = useState("")
  const [direction, setDirection] = useState<"increase" | "decrease">(
    operation === "adjustment" && preset === "loss" ? "decrease" : "increase",
  )
  const [reason, setReason] = useState("")
  const [categories, setCategories] = useState<StockCategoryDraft[]>([])
  const [categoryInput, setCategoryInput] = useState("")
  const retainedOperation = useRef<RetainedOperation | null>(null)
  const usesCategories = operation === "receipt" || operation === "adjustment"
  const recordsUse = operation === "internal_use"
  // Used in the business offers only Products set to Internal use or Both.
  const usableItems = useQuery(
    trpc.catalog.listItems.queryOptions(
      {},
      { enabled: recordsUse && !productId, retry: false },
    ),
  )
  const usableProductIds = new Set(
    (usableItems.data ?? []).flatMap((item) =>
      item.product &&
      (item.product.usage === "INTERNAL_USE" || item.product.usage === "BOTH")
        ? [item.product.id]
        : [],
    ),
  )
  const sourceRows = recordsUse
    ? productId
      ? rows.filter((row) => row.productId === productId)
      : rows.filter((row) => usableProductIds.has(row.productId))
    : rows
  const [targetCustodyType, setTargetCustodyType] = useState<"staff" | "store">(
    "staff",
  )
  const [targetCustodyReferenceId, setTargetCustodyReferenceId] = useState("")
  const [targetStoreId, setTargetStoreId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [openSections, setOpenSections] = useState<string[]>([])
  const isLoss = operation === "adjustment" && preset === "loss"
  const qaSnapshot = useRef<{
    categories: StockCategoryDraft[]
    categoryInput: string
    enteredUnitId: string
    quantity: string
    reason: string
    sourceId: string
    targetCustodyReferenceId: string
    targetId: string
    targetQuantity: string
    targetStoreId: string
  } | null>(null)
  const selected = rows.find((row) => row.balanceSourceId === sourceId)
  const canConvertQuantity =
    usesCategories || recordsUse || operation === "count"
  const configurations = useQuery(
    trpc.catalog.listUnitConfigurations.queryOptions(
      { productId: selected?.productId ?? "" },
      { enabled: Boolean(selected) && canConvertQuantity, retry: false },
    ),
  )
  const quantityUnits = inventoryQuantityUnits(
    selected,
    configurations.data?.find(
      (configuration) => configuration.status === "current",
    ),
    canConvertQuantity,
  )
  const enteredUnit =
    quantityUnits.find((unit) => unit.id === enteredUnitId) ?? quantityUnits[0]
  function changeSource(id: string) {
    setSourceId(id)
    setEnteredUnitId("")
    setTargetId("")
    setTargetQuantity("")
  }
  const target = rows.find((row) => row.balanceSourceId === targetId)

  const complete = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.catalog.listItems.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.catalog.listItemsPage.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.inventory.balanceReport.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.inventory.operationHistory.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.inventory.categorySuggestions.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.inventory.transfers.queryKey(),
      }),
    ])
    setParams(null)
  }
  const fail = (failure: { message: string }) => setError(failure.message)
  async function failRetained(failure: {
    message: string
    data?: Parameters<typeof inventoryOperationRecovery>[0]
  }) {
    const recovery = inventoryOperationRecovery(failure.data)
    if (recovery === "refresh") {
      await refreshRejectedStock()
      return
    }
    if (recovery === "edit") retainedOperation.current = null
    fail(failure)
  }
  const operationMutation = useMutation(
    trpc.inventory.postBalanceOperation.mutationOptions({
      onError: failRetained,
      onSuccess: complete,
    }),
  )
  const recordUseMutation = useMutation(
    trpc.inventory.recordInternalUse.mutationOptions({
      onError: failRetained,
      onSuccess: complete,
    }),
  )
  const retainedError =
    retainedOperation.current?.kind === "use"
      ? recordUseMutation.error
      : operationMutation.error
  function send(retained: RetainedOperation) {
    retainedOperation.current = retained
    if (retained.kind === "use") recordUseMutation.mutate(retained.input)
    else operationMutation.mutate(retained.input)
  }
  const transformMutation = useMutation(
    trpc.inventory.transformPackagedStock.mutationOptions({
      onError: fail,
      onSuccess: complete,
    }),
  )
  const finalizeCountMutation = useMutation(
    trpc.inventory.finalizeStockCount.mutationOptions({
      onError: fail,
      onSuccess: complete,
    }),
  )
  const countMutation = useMutation(
    trpc.inventory.createStockCount.mutationOptions({
      onError: fail,
      onSuccess: (count) =>
        finalizeCountMutation.mutate({
          clientOperationId: crypto.randomUUID(),
          reason: reason.trim() || "Stock count",
          schemaVersion: 1,
          stockCountId: count.id,
        }),
    }),
  )
  const custodyMutation = useMutation(
    trpc.inventory.moveCustody.mutationOptions({
      onError: fail,
      onSuccess: complete,
    }),
  )
  const transferMutation = useMutation(
    trpc.inventory.dispatchTransfer.mutationOptions({
      onError: fail,
      onSuccess: complete,
    }),
  )

  async function refreshRejectedStock() {
    try {
      await Promise.all([
        queryClient.invalidateQueries(
          { queryKey: trpc.inventory.balanceReport.queryKey() },
          { throwOnError: true },
        ),
        queryClient.invalidateQueries(
          { queryKey: trpc.catalog.listUnitConfigurations.queryKey() },
          { throwOnError: true },
        ),
      ])
      retainedOperation.current = null
      setError(
        "Stock changed while you were typing, so nothing was saved. The latest numbers are loaded; check the quantity, then save again.",
      )
    } catch {
      setError(
        "The latest stock couldn’t load. What you typed is kept. Choose Reload stock to try again.",
      )
    }
  }

  function submit() {
    if (retainedOperation.current) {
      if (inventoryOperationRecovery(retainedError?.data) === "refresh") {
        void refreshRejectedStock()
        return
      }
      send(retainedOperation.current)
      return
    }
    if (!operation) return
    const copy = formCopy(
      operation,
      isLoss,
      direction,
      targetCustodyType === "staff",
    )
    if (!selected) {
      setError("Choose a product.")
      return
    }
    if (!quantity.trim()) {
      setError(copy.missingQuantity)
      return
    }
    if (usesCategories && !categories.length && !categoryInput.trim()) {
      setError(
        isLoss ? "Pick what happened." : "Pick a reason, or type your own.",
      )
      return
    }
    if (!enteredUnit) {
      setError("Choose a unit.")
      return
    }
    const typedQuantity = normalizeQuantityInput(quantity)
    let balanceQuantity: string
    try {
      balanceQuantity = inventoryQuantityTotal(
        typedQuantity,
        enteredUnit,
        selected,
        operation === "count",
      ).balanceQuantity
    } catch (failure) {
      setError(
        plainQuantityError(
          failure instanceof Error ? failure.message : "",
          pluralizeUnitName(enteredUnit.name),
        ),
      )
      return
    }
    if (
      operation === "count" &&
      compareExactDecimals(balanceQuantity, "0") === 0
    ) {
      setError(
        "A count of 0 can’t be saved yet. Use Damaged or lost, or Correct stock, to remove what is left.",
      )
      return
    }
    const removing =
      operation === "internal_use" ||
      operation === "transfer" ||
      operation === "custody" ||
      operation === "transformation" ||
      (operation === "adjustment" && direction === "decrease")
    if (
      removing &&
      compareExactDecimals(balanceQuantity, selected.availableQuantity) > 0
    ) {
      const free = formatStockQuantity(
        selected.availableQuantity,
        selected.inventoryUnitName,
      )
      setError(
        compareExactDecimals(selected.reservedQuantity, "0") > 0
          ? `You have ${free} free to use (${formatStockQuantity(selected.reservedQuantity, selected.inventoryUnitName)} held for orders). Enter less.`
          : `You have ${free}. Enter less.`,
      )
      return
    }
    const note = reason.trim()
    if (operation === "transformation") {
      if (!target) {
        setError("Choose the pack to fill.")
        return
      }
      if (!targetQuantity.trim()) {
        setError(
          `Enter how many ${pluralizeUnitName(target.inventoryUnitName).toLowerCase()} this makes.`,
        )
        return
      }
      transformMutation.mutate({
        clientOperationId: crypto.randomUUID(),
        expectedConfigurationVersionId: selected.configurationVersionId,
        reason: note || "Packed or unpacked",
        schemaVersion: 1,
        source: "dashboard_inventory",
        sourceBalanceRevision: selected.revision,
        sourceBalanceSourceId: selected.balanceSourceId,
        sourceQuantity: typedQuantity,
        storeId: store.id,
        targetBalanceRevision: target.revision,
        targetBalanceSourceId: target.balanceSourceId,
        targetQuantity: normalizeQuantityInput(targetQuantity),
      })
      return
    }
    if (operation === "custody") {
      if (targetCustodyType === "staff" && !targetCustodyReferenceId) {
        setError("Choose who gets it.")
        return
      }
      custodyMutation.mutate({
        clientOperationId: crypto.randomUUID(),
        expectedSourceRevision: selected.revision,
        quantity: typedQuantity,
        reason:
          note ||
          (targetCustodyType === "store"
            ? "Back to the store"
            : "Handed to staff"),
        schemaVersion: 1,
        source: "dashboard_inventory",
        sourceBalanceSourceId: selected.balanceSourceId,
        targetCustodyReferenceId:
          targetCustodyType === "store" ? "" : targetCustodyReferenceId,
        targetCustodyType,
      })
      return
    }
    if (operation === "transfer") {
      if (!targetStoreId) {
        setError("Choose the store to send to.")
        return
      }
      transferMutation.mutate({
        clientOperationId: crypto.randomUUID(),
        clientTransferId: crypto.randomUUID(),
        expectedSourceRevision: selected.revision,
        quantity: typedQuantity,
        reason:
          note ||
          `Sent to ${storesQuery.data?.find((candidate) => candidate.id === targetStoreId)?.name ?? "another store"}`,
        schemaVersion: 1,
        source: "dashboard_inventory",
        sourceBalanceSourceId: selected.balanceSourceId,
        targetStoreId,
      })
      return
    }
    if (operation === "count") {
      countMutation.mutate({
        actorNote: note,
        clientOperationId: crypto.randomUUID(),
        lines: [
          {
            balanceSourceId: selected.balanceSourceId,
            entries: [
              {
                enteredInventoryUnitId: enteredUnit.id,
                enteredQuantity: typedQuantity,
              },
            ],
            expectedRevision: selected.revision,
          },
        ],
        schemaVersion: 1,
        storeId: store.id,
      })
      return
    }
    if (operation === "internal_use") {
      send({
        kind: "use",
        input: {
          balanceSourceId: selected.balanceSourceId,
          clientOperationId: crypto.randomUUID(),
          enteredInventoryUnitId: enteredUnit.id,
          enteredQuantity: typedQuantity,
          expectedBalanceRevision: selected.revision,
          expectedConfigurationVersionId: selected.configurationVersionId,
          ...(note ? { reason: note } : {}),
          schemaVersion: 1,
          source: "dashboard_inventory",
          storeId: store.id,
        },
      })
      return
    }
    let selectedCategories: StockCategoryDraft[]
    try {
      selectedCategories = collectStockCategoryDraft(categories, categoryInput)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Pick a reason.")
      return
    }
    const input: RouterInputs["inventory"]["postBalanceOperation"] = {
      balanceSourceId: selected.balanceSourceId,
      clientOperationId: crypto.randomUUID(),
      direction: operation === "receipt" ? "increase" : direction,
      enteredInventoryUnitId: enteredUnit.id,
      enteredQuantity: typedQuantity,
      expectedBalanceRevision: selected.revision,
      expectedConfigurationVersionId: selected.configurationVersionId,
      reason: note,
      schemaVersion: 1,
      source: "dashboard_inventory",
      storeId: store.id,
      type: operation,
    }
    input.reason = undefined
    input.categories = stockCategorySelectors(selectedCategories)
    setCategories(selectedCategories)
    setCategoryInput("")
    send({ kind: "balance", input })
  }

  const copy = formCopy(
    operation,
    isLoss,
    direction,
    targetCustodyType === "staff",
  )
  const pending =
    preparingStock ||
    refreshingBalances ||
    operationMutation.isPending ||
    recordUseMutation.isPending ||
    transformMutation.isPending ||
    countMutation.isPending ||
    finalizeCountMutation.isPending ||
    custodyMutation.isPending ||
    transferMutation.isPending

  return (
    <FieldGroup className="grid gap-4">
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      <FieldSet
        disabled={pending || Boolean(retainedOperation.current)}
        className="grid min-w-0 gap-4 border-0 p-0"
      >
        <QaDashboardQuickFill
          canUndo={Boolean(qaSnapshot.current)}
          formId="dashboard.inventory.operation"
          isDirty={Boolean(
            sourceId ||
              quantity ||
              reason ||
              categories.length ||
              categoryInput ||
              targetId ||
              targetQuantity ||
              targetCustodyReferenceId ||
              targetStoreId,
          )}
          onFill={(context) => {
            const conversion = createInventoryConversionFixture(rows)
            const firstSource =
              operation === "transformation"
                ? rows.find(
                    (row) =>
                      row.balanceSourceId === conversion?.sourceBalanceSourceId,
                  )
                : rows[0]
            if (!firstSource) {
              setError(
                "Create an eligible Product and Inventory Unit before filling this draft.",
              )
              return
            }
            const packagedTarget = rows.find(
              (row) =>
                row.balanceSourceId === conversion?.targetBalanceSourceId,
            )
            const assignee = assigneesQuery.data?.[0]
            const targetStore = storesQuery.data?.find(
              (candidate) => candidate.id !== store.id,
            )
            if (operation === "transformation" && !conversion) {
              setError(
                "Add a compatible packaged stock balance before filling a transformation draft.",
              )
              return
            }
            if (operation === "custody" && !assignee) {
              setError("Add an active team member before filling custody.")
              return
            }
            if (operation === "transfer" && !targetStore) {
              setError(
                "Add another active Store before filling a transfer draft.",
              )
              return
            }
            qaSnapshot.current = {
              categories: [...categories],
              categoryInput,
              enteredUnitId,
              quantity,
              reason,
              sourceId,
              targetCustodyReferenceId,
              targetId,
              targetQuantity,
              targetStoreId,
            }
            const fixture = createInventoryFixture(context)
            changeSource(firstSource.balanceSourceId)
            setQuantity(conversion?.sourceQuantity ?? fixture.quantity)
            setReason(fixture.reason)
            setCategories([{ name: fixture.reason }])
            setCategoryInput("")
            setTargetId(packagedTarget?.balanceSourceId ?? "")
            setTargetQuantity(conversion?.targetQuantity ?? "")
            setTargetCustodyReferenceId(assignee?.id ?? "")
            setTargetStoreId(targetStore?.id ?? "")
            setError(null)
          }}
          onUndo={() => {
            const snapshot = qaSnapshot.current
            if (!snapshot) return
            setQuantity(snapshot.quantity)
            setReason(snapshot.reason)
            setCategories(snapshot.categories)
            setCategoryInput(snapshot.categoryInput)
            setSourceId(snapshot.sourceId)
            setEnteredUnitId(snapshot.enteredUnitId)
            setTargetCustodyReferenceId(snapshot.targetCustodyReferenceId)
            setTargetId(snapshot.targetId)
            setTargetQuantity(snapshot.targetQuantity)
            setTargetStoreId(snapshot.targetStoreId)
            qaSnapshot.current = null
          }}
        />
        <ControlField
          label={<>Product</>}
          description={
            recordsUse && !productId
              ? "Only Products set to Internal use, or For sale and internal use, show here."
              : undefined
          }
        >
          <InventoryReceiptSource
            storeId={store.id}
            productId={null}
            rows={sourceRows}
            sourceId={sourceId}
            onSourceChange={changeSource}
            onPreparingChange={setPreparingStock}
            disabled={pending || Boolean(retainedOperation.current)}
            allowFirstReceipt={operation === "receipt"}
          />
        </ControlField>
        {operation === "adjustment" && !isLoss ? (
          <ControlField label={<>Add or remove?</>}>
            <SelectControl
              value={direction}
              onValueChange={(value) => setDirection(value as typeof direction)}
              options={[
                { value: "increase", label: <>Add to stock</> },
                { value: "decrease", label: <>Remove from stock</> },
              ]}
            />
          </ControlField>
        ) : null}
        {operation === "custody" ? (
          <>
            <ControlField label={<>Give or take back?</>}>
              <SelectControl
                value={targetCustodyType}
                onValueChange={(value) =>
                  setTargetCustodyType(value as typeof targetCustodyType)
                }
                options={[
                  { value: "staff", label: <>Give to staff</> },
                  { value: "store", label: <>Take back to the store</> },
                ]}
              />
            </ControlField>
            {targetCustodyType === "staff" ? (
              <ControlField label={<>Who gets it?</>}>
                <SelectControl
                  value={targetCustodyReferenceId}
                  onValueChange={(value) => setTargetCustodyReferenceId(value)}
                  options={[
                    { value: "", label: <>Choose a person</> },
                    ...(assigneesQuery.data?.map((person) => ({
                      value: person.id,
                      label: person.name,
                    })) ?? []),
                  ]}
                />
              </ControlField>
            ) : null}
          </>
        ) : null}
        {operation === "transfer" ? (
          <ControlField
            label="Send to"
            description={`The stock leaves ${store.name} now and shows as On the way until the other store receives it.`}
          >
            <StoreSelector
              label="Send to"
              value={
                storesQuery.data?.find(
                  (candidate) => candidate.id === targetStoreId,
                ) ?? null
              }
              excludeId={store.id}
              disabled={pending}
              onChange={(next) => setTargetStoreId(next.id)}
            />
          </ControlField>
        ) : null}
        <InventoryQuantityInput
          label={copy.quantity}
          quantity={quantity}
          onQuantityChange={setQuantity}
          unit={enteredUnit}
          units={quantityUnits}
          onUnitChange={setEnteredUnitId}
          balance={selected}
          allowZero={operation === "count"}
          disabled={pending || Boolean(retainedOperation.current)}
        />
        {selected &&
        (operation === "internal_use" ||
          operation === "transfer" ||
          isLoss ||
          (operation === "adjustment" && direction === "decrease")) &&
        compareExactDecimals(selected.reservedQuantity, "0") > 0 ? (
          <p className="text-xs text-muted-foreground">
            {formatStockQuantity(
              selected.reservedQuantity,
              selected.inventoryUnitName,
            )}{" "}
            are held for orders, so you can use up to{" "}
            {formatStockQuantity(
              selected.availableQuantity,
              selected.inventoryUnitName,
            )}
            .
          </p>
        ) : null}
        {configurations.isError && canConvertQuantity ? (
          <p className="text-xs text-muted-foreground">
            Trays, packs and other units couldn’t load. You can still enter{" "}
            {selected
              ? pluralizeUnitName(selected.inventoryUnitName).toLowerCase()
              : "the main unit"}
            .
          </p>
        ) : null}
        {operation === "transformation" ? (
          <>
            <ControlField
              label={<>Pack to fill</>}
              description="Packs kept separately have their own stock. To open packs, choose the pack as the product and loose stock here."
            >
              <SelectControl
                value={targetId}
                onValueChange={(value) => setTargetId(value)}
                options={[
                  { value: "", label: <>Choose a pack</> },
                  ...(rows
                    .filter(
                      (row) =>
                        row.balanceSourceId !== sourceId &&
                        row.kind === "PACKAGED_STOCK" &&
                        row.productId === selected?.productId &&
                        row.variantId === selected?.variantId &&
                        row.configurationVersionId ===
                          selected?.configurationVersionId,
                    )
                    .map((row) => ({
                      value: row.balanceSourceId,
                      label: (
                        <>
                          {row.inventoryUnitName} (
                          {formatStockQuantity(
                            row.onHandQuantity,
                            row.inventoryUnitName,
                          )}{" "}
                          now)
                        </>
                      ),
                    })) ?? []),
                ]}
              />
            </ControlField>
            <ControlField
              label={
                target
                  ? `How many ${pluralizeUnitName(target.inventoryUnitName).toLowerCase()} does that make?`
                  : "How many packs does that make?"
              }
            >
              <Input
                inputMode="decimal"
                value={targetQuantity}
                onChange={(event) => setTargetQuantity(event.target.value)}
              />
            </ControlField>
          </>
        ) : null}
        {usesCategories ? (
          <StockCategoriesInput
            label={copy.reasonLabel}
            presets={copy.presets}
            value={categories}
            input={categoryInput}
            onChange={setCategories}
            onInputChange={setCategoryInput}
            disabled={pending || Boolean(retainedOperation.current)}
          />
        ) : recordsUse ? (
          <ControlField label={<>What was it used for? (optional)</>}>
            <Textarea
              value={reason}
              placeholder="e.g. Fed layers, house A"
              onChange={(event) => setReason(event.target.value)}
            />
          </ControlField>
        ) : null}
        <div className="grid gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            Optional · open only what you need
          </p>
          <CatalogSections value={openSections} onValueChange={setOpenSections}>
            {!usesCategories && !recordsUse ? (
              <CatalogSection
                id="note"
                icon={Note01Icon}
                title="Note"
                summary={reason.trim() || "Anything to remember"}
              >
                <ControlField label={<>Note (optional)</>}>
                  <Textarea
                    value={reason}
                    placeholder={
                      operation === "count"
                        ? "e.g. Weekly count"
                        : operation === "transfer"
                          ? "e.g. Weekend stock for the shop"
                          : "e.g. Boxes for Saturday orders"
                    }
                    onChange={(event) => setReason(event.target.value)}
                  />
                </ControlField>
              </CatalogSection>
            ) : null}
            <CatalogSection
              id="store"
              icon={Store01Icon}
              title={operation === "transfer" ? "Send from" : "Store"}
              summary={store.name}
            >
              <ControlField
                label={operation === "transfer" ? "Send from" : "Store"}
                description="Changing the store clears the product."
              >
                <StoreSelector
                  value={store}
                  label={operation === "transfer" ? "Send from" : "Store"}
                  disabled={pending || Boolean(retainedOperation.current)}
                  onChange={(next) => {
                    setStore(next)
                    changeSource("")
                    setTargetStoreId("")
                    setTargetCustodyReferenceId("")
                    setError(null)
                    qaSnapshot.current = null
                  }}
                />
              </ControlField>
            </CatalogSection>
          </CatalogSections>
        </div>
      </FieldSet>
      <FormActions>
        <SubmitButton
          type="button"
          isSubmitting={pending}
          disabled={pending}
          onClick={submit}
        >
          {pending
            ? "Saving…"
            : retainedOperation.current
              ? inventoryOperationRecovery(retainedError?.data) === "refresh"
                ? "Reload stock"
                : "Try again"
              : copy.save}
        </SubmitButton>
      </FormActions>
    </FieldGroup>
  )
}
