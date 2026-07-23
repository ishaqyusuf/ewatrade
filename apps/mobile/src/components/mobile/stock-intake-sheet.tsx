import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import {
  InventoryProductCard,
  InventorySegmentOption,
} from "@/components/mobile/inventory-product-card"
import { SecondarySheetHeader } from "@/components/mobile/secondary-operations"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useOfflineCommandStore } from "@/store/offlineCommandStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useState } from "react"
import { ScrollView, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function StockIntakeContent({
  onComplete,
  presentation = "screen",
}: { onComplete?: () => void; presentation?: "screen" | "sheet" }) {
  const insets = useSafeAreaInsets()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const queueCommand = useOfflineCommandStore((state) => state.queueCommand)
  const [balanceId, setBalanceId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [reason, setReason] = useState("")
  const [mode, setMode] = useState<
    "receipt" | "count" | "adjustment" | "custody"
  >("receipt")
  const [direction, setDirection] = useState<"increase" | "decrease">(
    "increase",
  )
  const [targetCustodyType, setTargetCustodyType] = useState<"staff" | "store">(
    "staff",
  )
  const [targetCustodyReferenceId, setTargetCustodyReferenceId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const balances = useQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: false },
      { retry: false },
    ),
  )
  const assignees = useQuery(
    trpc.services.assignees.queryOptions(undefined, {
      enabled: mode === "custody" && targetCustodyType === "staff",
      retry: false,
    }),
  )
  const selected = balances.data?.rows.find(
    (row) => row.balanceSourceId === balanceId,
  )
  const onInventoryCreated = async () => {
    await queryClient.invalidateQueries(
      trpc.tenant.featureAvailability.queryFilter(),
    )
    onComplete?.()
  }
  const mutation = useMutation(
    trpc.inventory.postBalanceOperation.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: onInventoryCreated,
    }),
  )
  const finalizeCount = useMutation(
    trpc.inventory.finalizeStockCount.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: onInventoryCreated,
    }),
  )
  const createCount = useMutation(
    trpc.inventory.createStockCount.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: (count) =>
        finalizeCount.mutate({
          clientOperationId: `count-final-${Crypto.randomUUID()}`,
          reason: reason.trim(),
          schemaVersion: 1,
          stockCountId: count.id,
        }),
    }),
  )
  const custody = useMutation(
    trpc.inventory.moveCustody.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: onInventoryCreated,
    }),
  )
  const submit = () => {
    if (!selected || !quantity.trim() || !reason.trim()) {
      setError("Choose a balance, enter an exact quantity, and add a reason.")
      return
    }
    const countLines = [
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
    ]
    if (mode === "custody") {
      if (targetCustodyType === "staff" && !targetCustodyReferenceId) {
        setError("Choose the team member receiving custody.")
        return
      }
      const payload = {
        expectedSourceRevision: selected.revision,
        quantity: quantity.trim(),
        reason: reason.trim(),
        sourceBalanceSourceId: selected.balanceSourceId,
        targetCustodyReferenceId:
          targetCustodyType === "store" ? "" : targetCustodyReferenceId,
        targetCustodyType,
      }
      if (offline) {
        queueCommand({
          dependencyClientIds: [],
          eventVersion: 1,
          payload: { kind: "custody_move", ...payload },
        })
        onComplete?.()
        return
      }
      custody.mutate({
        clientOperationId: `custody-${Crypto.randomUUID()}`,
        schemaVersion: 1,
        source: "mobile_inventory",
        ...payload,
      })
      return
    }
    if (mode === "count") {
      if (offline) {
        queueCommand({
          dependencyClientIds: [],
          eventVersion: 1,
          payload: {
            kind: "stock_count",
            lines: countLines,
            reason: reason.trim(),
          },
        })
        onComplete?.()
        return
      }
      createCount.mutate({
        actorNote: reason.trim(),
        clientOperationId: `count-${Crypto.randomUUID()}`,
        lines: countLines,
        schemaVersion: 1,
      })
      return
    }
    const operation = {
      balanceSourceId: selected.balanceSourceId,
      direction: mode === "receipt" ? ("increase" as const) : direction,
      enteredInventoryUnitId: selected.inventoryUnitId,
      enteredQuantity: quantity.trim(),
      expectedBalanceRevision: selected.revision,
      expectedConfigurationVersionId: selected.configurationVersionId,
      reason: reason.trim(),
      type: mode,
    }
    if (offline) {
      if (mode !== "receipt") {
        setError(
          "Adjustments require a connection. Receipts can be queued offline.",
        )
        return
      }
      queueCommand({
        dependencyClientIds: [],
        eventVersion: 1,
        payload: {
          kind: "stock_receipt",
          balanceSourceId: operation.balanceSourceId,
          enteredInventoryUnitId: operation.enteredInventoryUnitId,
          enteredQuantity: operation.enteredQuantity,
          expectedBalanceRevision: operation.expectedBalanceRevision,
          expectedConfigurationVersionId:
            operation.expectedConfigurationVersionId,
          reason: operation.reason,
        },
      })
      onComplete?.()
      return
    }
    mutation.mutate({
      clientOperationId: `stock-${Crypto.randomUUID()}`,
      schemaVersion: 1,
      source: "mobile_inventory",
      ...operation,
    })
  }
  const isSubmitting =
    mutation.isPending ||
    createCount.isPending ||
    finalizeCount.isPending ||
    custody.isPending
  const canSubmit =
    Boolean(selected && quantity.trim() && reason.trim()) &&
    (mode !== "custody" ||
      targetCustodyType === "store" ||
      Boolean(targetCustodyReferenceId))
  const modeOptions = [
    { key: "receipt", label: "Receive" },
    { key: "count", label: "Count" },
    { key: "adjustment", label: "Adjust" },
    { key: "custody", label: "Move" },
  ] as const

  return (
    <View className="flex-1">
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 112 }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-6 px-4">
          <SecondarySheetHeader
            description="Choose an operation, select the exact balance, then record the quantity and reason."
            icon="Warehouse"
            title="Inventory movement"
          />

        {offline ? (
          <StatusBanner
            icon="Wind"
            message="Receipts, counts, and custody moves are queued as provisional operations until replay."
            title="Offline"
            tone="warning"
          />
        ) : null}
        {error ? (
          <StatusBanner
            icon="AlertCircle"
            message={error}
            tone="destructive"
          />
        ) : null}

        <View className="gap-3">
          <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
            Operation
          </Text>
          <ScrollView
            contentContainerClassName="gap-2"
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {modeOptions.map((item) => (
              <View className="w-24" key={item.key}>
                <InventorySegmentOption
                  label={item.label}
                  onPress={() => {
                    setError(null)
                    setMode(item.key)
                  }}
                  selected={mode === item.key}
                />
              </View>
            ))}
          </ScrollView>
        </View>

        <View className="gap-2">
          <View className="gap-1">
            <Text className="text-base font-extrabold text-foreground">
              Select stock balance
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Quantities are recorded in the balance unit shown below.
            </Text>
          </View>
          <View className="border-b border-border">
            {balances.isPending ? (
              <EmptyState
                icon="Loader2"
                message="Loading inventory balances."
                title="Loading stock"
              />
            ) : balances.isError ? (
              <StatusBanner
                actionLabel="Try again"
                icon="AlertCircle"
                message={balances.error.message}
                onActionPress={() => void balances.refetch()}
                tone="destructive"
              />
            ) : balances.data?.rows.length ? (
              balances.data.rows.map((row) => (
                <InventoryProductCard
                  icon="Warehouse"
                  key={row.balanceSourceId}
                  onPress={() => {
                    setBalanceId(row.balanceSourceId)
                    setError(null)
                  }}
                  selected={balanceId === row.balanceSourceId}
                  stockLabel={`${row.onHandQuantity} ${row.inventoryUnitName}`}
                  stockTone="muted"
                  subtitle={`${row.variantName} · ${row.kind.toLowerCase().replaceAll("_", " ")}`}
                  title={row.productName}
                />
              ))
            ) : (
              <EmptyState
                icon="Warehouse"
                message="Add a stock-tracked Product before recording inventory."
                title="No stock balances"
              />
            )}
          </View>
        </View>

        {mode === "adjustment" ? (
          <View className="gap-3">
            <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
              Adjustment direction
            </Text>
            <View className="flex-row gap-2">
              <InventorySegmentOption
                label="Increase"
                onPress={() => setDirection("increase")}
                selected={direction === "increase"}
              />
              <InventorySegmentOption
                label="Decrease"
                onPress={() => setDirection("decrease")}
                selected={direction === "decrease"}
              />
            </View>
          </View>
        ) : null}

        {mode === "custody" ? (
          <View className="gap-4">
            <View className="gap-3">
              <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                Move to
              </Text>
              <View className="flex-row gap-2">
                <InventorySegmentOption
                  label="Team member"
                  onPress={() => setTargetCustodyType("staff")}
                  selected={targetCustodyType === "staff"}
                />
                <InventorySegmentOption
                  label="Central store"
                  onPress={() => setTargetCustodyType("store")}
                  selected={targetCustodyType === "store"}
                />
              </View>
            </View>
            {targetCustodyType === "staff" ? (
              <View className="border-b border-border">
                {assignees.data?.map((person) => (
                  <InventoryProductCard
                    icon="User"
                    key={person.id}
                    onPress={() => setTargetCustodyReferenceId(person.id)}
                    selected={targetCustodyReferenceId === person.id}
                    stockLabel="Team member"
                    stockTone="muted"
                    subtitle={person.email}
                    title={person.name}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

          <View className="gap-4">
            <FormField
              keyboardType="decimal-pad"
              label={mode === "count" ? "Observed quantity" : "Quantity"}
              onChangeText={setQuantity}
              placeholder={
                selected ? `In ${selected.inventoryUnitName}` : "0"
              }
              value={quantity}
            />
            <FormField
              label="Reason"
              multiline
              onChangeText={setReason}
              placeholder="Why is this stock movement being recorded?"
              value={reason}
            />
          </View>
        </View>
      </KeyboardAwareScrollView>

      <View
        style={{
          bottom: 0,
          left: 0,
          paddingBottom:
            presentation === "screen" ? Math.max(insets.bottom, 8) : 8,
          position: "absolute",
          right: 0,
        }}
      >
        <View className="border-t border-border bg-background px-4 pt-3">
          <ActionButton
            disabled={!canSubmit}
            isLoading={isSubmitting}
            onPress={submit}
          >
            {offline ? `Queue ${mode}` : "Review and confirm"}
          </ActionButton>
        </View>
      </View>
    </View>
  )
}
