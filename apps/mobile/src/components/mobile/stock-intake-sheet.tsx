import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useOfflineCommandStore } from "@/store/offlineCommandStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

export function StockIntakeContent({
  onComplete,
  presentation: _presentation,
}: { onComplete?: () => void; presentation?: "screen" | "sheet" }) {
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
  return (
    <KeyboardAwareScrollView
      className="flex-1"
      contentContainerClassName="gap-5 px-4 pb-12"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      {offline ? (
        <StatusBanner
          icon="Wind"
          message="Receipts, counts, and custody moves are queued as provisional operations until replay."
          title="Offline"
          tone="warning"
        />
      ) : null}
      {error ? (
        <StatusBanner icon="AlertCircle" message={error} tone="destructive" />
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {(["receipt", "count", "adjustment", "custody"] as const).map(
          (item) => (
            <Pressable
              className={
                mode === item
                  ? "min-h-10 min-w-[46%] flex-1 items-center justify-center rounded-full bg-primary"
                  : "min-h-10 min-w-[46%] flex-1 items-center justify-center rounded-full bg-muted"
              }
              key={item}
              onPress={() => setMode(item)}
            >
              <Text
                className={
                  mode === item
                    ? "font-bold capitalize text-primary-foreground"
                    : "font-bold capitalize text-foreground"
                }
              >
                {item}
              </Text>
            </Pressable>
          ),
        )}
      </View>
      <View className="gap-3">
        {balances.data?.rows.map((row) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: balanceId === row.balanceSourceId }}
            className={
              balanceId === row.balanceSourceId
                ? "rounded-2xl border border-primary bg-primary/5 p-4"
                : "rounded-2xl border border-border bg-card p-4"
            }
            key={row.balanceSourceId}
            onPress={() => setBalanceId(row.balanceSourceId)}
          >
            <Text className="font-bold text-foreground">
              {row.productName} · {row.variantName}
            </Text>
            <Text className="mt-1 text-xs text-muted-foreground">
              {row.onHandQuantity} {row.inventoryUnitName} ·{" "}
              {row.kind.toLowerCase().replaceAll("_", " ")}
            </Text>
          </Pressable>
        ))}
      </View>
      {mode === "adjustment" ? (
        <View className="flex-row gap-2">
          {(["increase", "decrease"] as const).map((item) => (
            <Pressable
              className={
                direction === item
                  ? "min-h-10 flex-1 items-center justify-center rounded-full bg-primary"
                  : "min-h-10 flex-1 items-center justify-center rounded-full bg-muted"
              }
              key={item}
              onPress={() => setDirection(item)}
            >
              <Text
                className={
                  direction === item
                    ? "font-bold capitalize text-primary-foreground"
                    : "font-bold capitalize text-foreground"
                }
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {mode === "custody" ? (
        <View className="gap-3">
          <View className="flex-row gap-2">
            {(["staff", "store"] as const).map((item) => (
              <Pressable
                className={
                  targetCustodyType === item
                    ? "min-h-10 flex-1 items-center justify-center rounded-full bg-primary"
                    : "min-h-10 flex-1 items-center justify-center rounded-full bg-muted"
                }
                key={item}
                onPress={() => setTargetCustodyType(item)}
              >
                <Text
                  className={
                    targetCustodyType === item
                      ? "font-bold capitalize text-primary-foreground"
                      : "font-bold capitalize text-foreground"
                  }
                >
                  {item === "staff" ? "Team member" : "Central Store"}
                </Text>
              </Pressable>
            ))}
          </View>
          {targetCustodyType === "staff"
            ? assignees.data?.map((person) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: targetCustodyReferenceId === person.id,
                  }}
                  className={
                    targetCustodyReferenceId === person.id
                      ? "rounded-2xl border border-primary bg-primary/5 p-4"
                      : "rounded-2xl border border-border bg-card p-4"
                  }
                  key={person.id}
                  onPress={() => setTargetCustodyReferenceId(person.id)}
                >
                  <Text className="font-bold text-foreground">
                    {person.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {person.email}
                  </Text>
                </Pressable>
              ))
            : null}
        </View>
      ) : null}
      <FormField
        keyboardType="decimal-pad"
        label={mode === "count" ? "Observed quantity" : "Quantity"}
        onChangeText={setQuantity}
        value={quantity}
      />
      <FormField
        label="Reason"
        multiline
        onChangeText={setReason}
        value={reason}
      />
      <ActionButton
        isLoading={
          mutation.isPending ||
          createCount.isPending ||
          finalizeCount.isPending ||
          custody.isPending
        }
        onPress={submit}
      >
        {offline ? `Queue ${mode}` : "Review and confirm"}
      </ActionButton>
    </KeyboardAwareScrollView>
  )
}
