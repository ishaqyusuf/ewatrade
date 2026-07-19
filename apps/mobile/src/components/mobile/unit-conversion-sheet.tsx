import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

export function UnitConversionContent({ onComplete, presentation: _presentation }: { onComplete?: () => void; presentation?: "screen" | "sheet" }) {
  const trpc = useTRPC()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const [sourceId, setSourceId] = useState("")
  const [targetId, setTargetId] = useState("")
  const [sourceQuantity, setSourceQuantity] = useState("")
  const [targetQuantity, setTargetQuantity] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const balances = useQuery(trpc.inventory.balanceReport.queryOptions({ includeCompatibleTotals: false }, { retry: false }))
  const source = balances.data?.rows.find((row) => row.balanceSourceId === sourceId)
  const target = balances.data?.rows.find((row) => row.balanceSourceId === targetId)
  const mutation = useMutation(trpc.inventory.transformPackagedStock.mutationOptions({ onError: (failure) => setError(failure.message), onSuccess: () => onComplete?.() }))
  const submit = () => {
    if (offline) { setError("Packaged-stock transformation requires a connection."); return }
    if (!source || !target || !sourceQuantity.trim() || !targetQuantity.trim() || !reason.trim()) { setError("Choose source and target balances, enter both quantities, and add a reason."); return }
    mutation.mutate({ clientOperationId: `transform-${Crypto.randomUUID()}`, expectedConfigurationVersionId: source.configurationVersionId, reason: reason.trim(), schemaVersion: 1, source: "mobile_inventory", sourceBalanceRevision: source.revision, sourceBalanceSourceId: source.balanceSourceId, sourceQuantity: sourceQuantity.trim(), targetBalanceRevision: target.revision, targetBalanceSourceId: target.balanceSourceId, targetQuantity: targetQuantity.trim() })
  }
  const rows = balances.data?.rows ?? []
  return <KeyboardAwareScrollView className="flex-1" contentContainerClassName="gap-5 px-4 pb-12" keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">{offline ? <StatusBanner icon="Wind" message="Connect before transforming packaged stock." title="Online action" tone="warning" /> : null}{error ? <StatusBanner icon="AlertCircle" message={error} tone="destructive" /> : null}<Text className="text-sm leading-5 text-muted-foreground">Transform exact stock between independently balanced packaged units. The server proves canonical conservation.</Text><Text className="font-extrabold text-foreground">Source balance</Text><View className="gap-2">{rows.map((row) => <BalanceChoice active={sourceId === row.balanceSourceId} key={row.balanceSourceId} label={`${row.productName} · ${row.variantName} · ${row.inventoryUnitName}`} onPress={() => setSourceId(row.balanceSourceId)} quantity={row.onHandQuantity} />)}</View><FormField keyboardType="decimal-pad" label="Source quantity" onChangeText={setSourceQuantity} value={sourceQuantity} /><Text className="font-extrabold text-foreground">Target packaged balance</Text><View className="gap-2">{rows.filter((row) => row.kind === "PACKAGED_STOCK" && row.balanceSourceId !== sourceId).map((row) => <BalanceChoice active={targetId === row.balanceSourceId} key={row.balanceSourceId} label={`${row.productName} · ${row.variantName} · ${row.inventoryUnitName}`} onPress={() => setTargetId(row.balanceSourceId)} quantity={row.onHandQuantity} />)}</View><FormField keyboardType="decimal-pad" label="Target quantity" onChangeText={setTargetQuantity} value={targetQuantity} /><FormField label="Reason" multiline onChangeText={setReason} value={reason} /><ActionButton isLoading={mutation.isPending} onPress={submit}>Review and transform</ActionButton></KeyboardAwareScrollView>
}

function BalanceChoice({ active, label, onPress, quantity }: { active: boolean; label: string; onPress: () => void; quantity: string }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected: active }} className={active ? "rounded-2xl border border-primary bg-primary/5 p-4" : "rounded-2xl border border-border bg-card p-4"} onPress={onPress}><Text className="font-bold text-foreground">{label}</Text><Text className="mt-1 text-xs text-muted-foreground">On hand {quantity}</Text></Pressable>
}
