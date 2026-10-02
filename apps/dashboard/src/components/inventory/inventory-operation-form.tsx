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

import { FormFeedback } from "@/components/forms/form-feedback"

import {
  createInventoryConversionFixture,
  createInventoryFixture,
} from "@/components/qa/fixture-recipes"
import { QaDashboardQuickFill } from "@/components/qa/qa-quick-fill"
import { useInventoryParams } from "@/hooks/use-inventory-params"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"

import {
  type StockCategoryDraft,
  collectStockCategoryDraft,
  stockCategorySelectors,
} from "@ewatrade/utils/inventory-categories"
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useRef, useState } from "react"
import { StockCategoriesInput } from "./stock-categories-input"

type StoreSummary = { currencyCode: string; id: string; name: string }

const field =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

export function InventoryOperationForm({
  store,
}: {
  store: StoreSummary
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { operation, setParams } = useInventoryParams()
  const { data: balances } = useSuspenseQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: true, storeId: store.id },
      { retry: false },
    ),
  )
  const storesQuery = useQuery(trpc.tenant.stores.queryOptions())
  const assigneesQuery = useQuery(trpc.services.assignees.queryOptions())
  const rows = balances.rows
  const [sourceId, setSourceId] = useState("")
  const [targetId, setTargetId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [targetQuantity, setTargetQuantity] = useState("")
  const [direction, setDirection] = useState<"increase" | "decrease">(
    "increase",
  )
  const [reason, setReason] = useState("")
  const [categories, setCategories] = useState<StockCategoryDraft[]>([])
  const [categoryInput, setCategoryInput] = useState("")
  const retainedOperation = useRef<
    RouterInputs["inventory"]["postBalanceOperation"] | null
  >(null)
  const usesCategories = operation === "receipt" || operation === "adjustment"
  const [targetCustodyType, setTargetCustodyType] = useState<"staff" | "store">(
    "staff",
  )
  const [targetCustodyReferenceId, setTargetCustodyReferenceId] = useState("")
  const [targetStoreId, setTargetStoreId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const qaSnapshot = useRef<{
    categories: StockCategoryDraft[]
    categoryInput: string
    quantity: string
    reason: string
    sourceId: string
    targetCustodyReferenceId: string
    targetId: string
    targetQuantity: string
    targetStoreId: string
  } | null>(null)
  const selected = rows.find((row) => row.balanceSourceId === sourceId)
  const target = rows.find((row) => row.balanceSourceId === targetId)

  const complete = async () => {
    await Promise.all([
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
  const operationMutation = useMutation(
    trpc.inventory.postBalanceOperation.mutationOptions({
      onError: (failure) => {
        // Validation/permission failures never reached a stock commit; allow repair.
        // Unknown outcomes keep the original identity and payload for safe retry.
        if (
          ["BAD_REQUEST", "FORBIDDEN", "NOT_FOUND"].includes(
            failure.data?.code ?? "",
          )
        ) {
          retainedOperation.current = null
        }
        fail(failure)
      },
      onSuccess: complete,
    }),
  )
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
          reason: reason.trim() || "Confirmed stock count",
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

  function submit() {
    if (retainedOperation.current) {
      operationMutation.mutate(retainedOperation.current)
      return
    }
    if (
      !operation ||
      !selected ||
      !quantity.trim() ||
      (!usesCategories && !reason.trim())
    ) {
      setError(
        usesCategories
          ? "Choose a balance, enter a quantity, and add categories."
          : "Choose a balance, enter a quantity, and add a reason.",
      )
      return
    }
    if (operation === "transformation") {
      if (!target || !targetQuantity.trim()) {
        setError("Choose the packaged target balance and enter its quantity.")
        return
      }
      transformMutation.mutate({
        clientOperationId: crypto.randomUUID(),
        expectedConfigurationVersionId: selected.configurationVersionId,
        reason: reason.trim(),
        schemaVersion: 1,
        source: "dashboard_inventory",
        sourceBalanceRevision: selected.revision,
        sourceBalanceSourceId: selected.balanceSourceId,
        sourceQuantity: quantity.trim(),
        storeId: store.id,
        targetBalanceRevision: target.revision,
        targetBalanceSourceId: target.balanceSourceId,
        targetQuantity: targetQuantity.trim(),
      })
      return
    }
    if (operation === "custody") {
      if (targetCustodyType === "staff" && !targetCustodyReferenceId) {
        setError("Choose the team member receiving custody.")
        return
      }
      custodyMutation.mutate({
        clientOperationId: crypto.randomUUID(),
        expectedSourceRevision: selected.revision,
        quantity: quantity.trim(),
        reason: reason.trim(),
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
        setError("Choose a different target Store.")
        return
      }
      transferMutation.mutate({
        clientOperationId: crypto.randomUUID(),
        clientTransferId: crypto.randomUUID(),
        expectedSourceRevision: selected.revision,
        quantity: quantity.trim(),
        reason: reason.trim(),
        schemaVersion: 1,
        source: "dashboard_inventory",
        sourceBalanceSourceId: selected.balanceSourceId,
        targetStoreId,
      })
      return
    }
    if (operation === "count") {
      countMutation.mutate({
        actorNote: reason.trim(),
        clientOperationId: crypto.randomUUID(),
        lines: [
          {
            balanceSourceId: selected.balanceSourceId,
            entries: [
              {
                enteredInventoryUnitId: selected.inventoryUnitId,
                enteredQuantity: quantity.trim(),
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
    let selectedCategories: StockCategoryDraft[]
    try {
      selectedCategories = collectStockCategoryDraft(categories, categoryInput)
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Choose categories.",
      )
      return
    }
    const input: RouterInputs["inventory"]["postBalanceOperation"] = {
      balanceSourceId: selected.balanceSourceId,
      clientOperationId: crypto.randomUUID(),
      direction: operation === "receipt" ? "increase" : direction,
      enteredInventoryUnitId: selected.inventoryUnitId,
      enteredQuantity: quantity.trim(),
      expectedBalanceRevision: selected.revision,
      expectedConfigurationVersionId: selected.configurationVersionId,
      reason: reason.trim(),
      schemaVersion: 1,
      source: "dashboard_inventory",
      storeId: store.id,
      type: operation,
    }
    input.reason = undefined
    input.categories = stockCategorySelectors(selectedCategories)
    setCategories(selectedCategories)
    setCategoryInput("")
    retainedOperation.current = input
    operationMutation.mutate(input)
  }

  const pending =
    operationMutation.isPending ||
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
              quantity,
              reason,
              sourceId,
              targetCustodyReferenceId,
              targetId,
              targetQuantity,
              targetStoreId,
            }
            const fixture = createInventoryFixture(context)
            setSourceId(firstSource.balanceSourceId)
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
            setTargetCustodyReferenceId(snapshot.targetCustodyReferenceId)
            setTargetId(snapshot.targetId)
            setTargetQuantity(snapshot.targetQuantity)
            setTargetStoreId(snapshot.targetStoreId)
            qaSnapshot.current = null
          }}
        />
        <ControlField label={<>Balance source</>}>
          <SelectControl
            value={sourceId}
            onValueChange={(value) => setSourceId(value)}
            options={[
              { value: "", label: <>Choose balance</> },
              ...(rows.map((row) => ({
                value: row.balanceSourceId,
                label: (
                  <>
                    {row.productName} · {row.variantName} ·{" "}
                    {row.inventoryUnitName} ({row.onHandQuantity})
                  </>
                ),
              })) ?? []),
            ]}
          />
        </ControlField>
        {operation === "adjustment" ? (
          <ControlField label={<>Direction</>}>
            <SelectControl
              value={direction}
              onValueChange={(value) => setDirection(value as typeof direction)}
              options={[
                { value: "increase", label: <>Increase</> },
                { value: "decrease", label: <>Decrease</> },
              ]}
            />
          </ControlField>
        ) : null}
        {operation === "custody" ? (
          <>
            <ControlField label={<>Move to</>}>
              <SelectControl
                value={targetCustodyType}
                onValueChange={(value) =>
                  setTargetCustodyType(value as typeof targetCustodyType)
                }
                options={[
                  { value: "staff", label: <>Team member</> },
                  { value: "store", label: <>Central Store custody</> },
                ]}
              />
            </ControlField>
            {targetCustodyType === "staff" ? (
              <ControlField label={<>Team member</>}>
                <SelectControl
                  value={targetCustodyReferenceId}
                  onValueChange={(value) => setTargetCustodyReferenceId(value)}
                  options={[
                    { value: "", label: <>Choose team member</> },
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
          <ControlField label={<>Target Store</>}>
            <SelectControl
              value={targetStoreId}
              onValueChange={(value) => setTargetStoreId(value)}
              options={[
                { value: "", label: <>Choose Store</> },
                ...(storesQuery.data
                  ?.filter((candidate) => candidate.id !== store.id)
                  .map((candidate) => ({
                    value: candidate.id,
                    label: candidate.name,
                  })) ?? []),
              ]}
            />
          </ControlField>
        ) : null}
        <ControlField
          label={operation === "count" ? "Observed quantity" : "Quantity"}
        >
          <Input
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </ControlField>
        {operation === "transformation" ? (
          <>
            <ControlField label={<>Target packaged balance</>}>
              <SelectControl
                value={targetId}
                onValueChange={(value) => setTargetId(value)}
                options={[
                  { value: "", label: <>Choose target</> },
                  ...(rows
                    .filter(
                      (row) =>
                        row.balanceSourceId !== sourceId &&
                        row.kind === "PACKAGED_STOCK",
                    )
                    .map((row) => ({
                      value: row.balanceSourceId,
                      label: (
                        <>
                          {row.productName} · {row.variantName} ·{" "}
                          {row.inventoryUnitName}
                        </>
                      ),
                    })) ?? []),
                ]}
              />
            </ControlField>
            <ControlField label={<>Target quantity</>}>
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
            value={categories}
            input={categoryInput}
            onChange={setCategories}
            onInputChange={setCategoryInput}
            disabled={pending || Boolean(retainedOperation.current)}
          />
        ) : (
          <ControlField label={<>Reason</>}>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </ControlField>
        )}
      </FieldSet>
      <FormActions>
        <SubmitButton
          type="button"
          isSubmitting={pending}
          disabled={pending}
          onClick={submit}
        >
          {pending
            ? "Posting…"
            : retainedOperation.current
              ? "Retry same operation"
              : "Review and confirm"}
        </SubmitButton>
      </FormActions>
    </FieldGroup>
  )
}
