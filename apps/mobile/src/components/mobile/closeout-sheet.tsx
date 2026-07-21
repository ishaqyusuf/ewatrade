import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useOfflineCommandStore } from "@/store/offlineCommandStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useMemo, useState } from "react"
import { ScrollView, View } from "react-native"

export function CloseoutContent({
  attendantName: _attendantName,
  onComplete,
  presentation: _presentation,
}: {
  attendantName?: string
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const queue = useOfflineCommandStore((state) => state.queueCommand)
  const [values, setValues] = useState<Record<string, string>>({})
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const balances = useQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: false },
      { retry: false },
    ),
  )
  const custody = useMemo(
    () =>
      (balances.data?.rows ?? []).filter(
        (row) =>
          row.custodyType === "STAFF" && row.custodyReferenceId === profile?.id,
      ),
    [balances.data, profile?.id],
  )
  const finalize = useMutation(
    trpc.inventory.finalizeCloseout.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.tenant.featureAvailability.queryFilter(),
        )
        onComplete?.()
      },
    }),
  )
  const create = useMutation(
    trpc.inventory.createCloseout.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: (result) =>
        finalize.mutate({
          clientOperationId: `closeout-final-${Crypto.randomUUID()}`,
          closeoutId: result.id,
          reason: reason.trim() || "Confirmed closeout",
          schemaVersion: 1,
        }),
    }),
  )
  const submit = () => {
    if (!profile?.id || custody.length === 0) return
    const declarations = custody.map((row) => ({
      balanceSourceId: row.balanceSourceId,
      declaredQuantity:
        values[row.balanceSourceId]?.trim() || row.onHandQuantity,
      expectedRevision: row.revision,
    }))
    const payload = {
      custodyReferenceId: profile.id,
      custodyType: "staff" as const,
      declarations,
      reason: reason.trim() || "End of shift closeout",
    }
    if (offline) {
      queue({
        dependencyClientIds: [],
        eventVersion: 1,
        payload: { kind: "inventory_closeout", ...payload },
      })
      onComplete?.()
      return
    }
    create.mutate({
      clientOperationId: `closeout-${Crypto.randomUUID()}`,
      schemaVersion: 1,
      ...payload,
    })
  }
  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-5 px-4 pb-12">
      {offline ? (
        <StatusBanner
          icon="Wind"
          message="Declarations will remain provisional until replay and manager confirmation."
          title="Offline closeout"
          tone="warning"
        />
      ) : null}
      {error ? (
        <StatusBanner icon="AlertCircle" message={error} tone="destructive" />
      ) : null}
      {custody.length === 0 ? (
        <EmptyState
          icon="Warehouse"
          message="Stock assigned to this staff member appears here. Store stock is not a staff closeout balance."
          title="No custody balances"
        />
      ) : (
        custody.map((row) => (
          <View
            className="gap-3 rounded-2xl border border-border bg-card p-4"
            key={row.balanceSourceId}
          >
            <View>
              <Text className="font-bold text-foreground">
                {row.productName} · {row.variantName}
              </Text>
              <Text className="mt-1 text-xs text-muted-foreground">
                Expected {row.onHandQuantity} {row.inventoryUnitName}
              </Text>
            </View>
            <FormField
              keyboardType="decimal-pad"
              label="Declared quantity"
              onChangeText={(value) =>
                setValues((current) => ({
                  ...current,
                  [row.balanceSourceId]: value,
                }))
              }
              value={values[row.balanceSourceId] ?? row.onHandQuantity}
            />
          </View>
        ))
      )}
      <FormField
        label="Reason"
        multiline
        onChangeText={setReason}
        value={reason}
      />
      <ActionButton
        disabled={custody.length === 0}
        isLoading={create.isPending || finalize.isPending}
        onPress={submit}
      >
        {offline ? "Queue closeout" : "Review and confirm"}
      </ActionButton>
    </ScrollView>
  )
}
