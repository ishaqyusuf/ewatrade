import { ActionButton } from "@/components/mobile/action-button"
import { ReturnableBadge } from "@/components/mobile/create-sale/checkout-returnables"
import { QuantityStepper } from "@/components/mobile/quantity-stepper"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import * as Crypto from "expo-crypto"
import { useRouter } from "expo-router"
import { useRef, useState } from "react"
import { ScrollView } from "react-native"
import {
  returnableCount,
  useRecordReturnable,
  useReturnableBalances,
} from "./use-returnables"

type Kind = "RETURNED" | "WRITTEN_OFF"

/** Full-screen Record return: customer, item, what happened, how many. */
export function RecordReturnScreen(props: {
  customerId?: string
  catalogItemId?: string
  orderId?: string
}) {
  const router = useRouter()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const [customerId, setCustomerId] = useState(props.customerId)
  const [itemId, setItemId] = useState(props.catalogItemId)
  const [kind, setKind] = useState<Kind>("RETURNED")
  const [quantity, setQuantity] = useState<string | null>(null)
  const [saved, setSaved] = useState<{
    kind: Kind
    quantity: number
    itemName: string
    customerName: string
    before: number
  } | null>(null)
  const clientMovementId = useRef(`return-${Crypto.randomUUID()}`)
  const balances = useReturnableBalances({})
  const record = useRecordReturnable()

  const all = balances.data ?? []
  const customers = [
    ...new Map(all.map((row) => [row.customerId, row])).values(),
  ]
  const forCustomer = all.filter((row) => row.customerId === customerId)
  const balance =
    forCustomer.find((row) => row.catalogItemId === itemId) ??
    (forCustomer.length === 1 ? forCustomer[0] : undefined)
  // null = every item out (the usual case); otherwise what was typed.
  const count =
    quantity === null
      ? (balance?.out ?? 0)
      : /^\d+$/.test(quantity.trim())
        ? Number(quantity.trim())
        : 0
  const valid = Boolean(balance) && count >= 1 && count <= (balance?.out ?? 0)

  function reset() {
    clientMovementId.current = `return-${Crypto.randomUUID()}`
    setSaved(null)
    setQuantity(null)
    setKind("RETURNED")
    record.reset()
  }

  async function save() {
    if (!balance || !valid) return
    try {
      await record.mutateAsync({
        catalogItemId: balance.catalogItemId,
        clientMovementId: clientMovementId.current,
        customerId: balance.customerId,
        kind,
        orderId: props.orderId,
        quantity: count,
      })
      setSaved({
        before: balance.out,
        customerName: balance.customerName,
        itemName: balance.itemName,
        kind,
        quantity: count,
      })
    } catch {
      // Shown from record.error; the same identity is kept so a retry can't double-record.
    }
  }

  if (saved)
    return (
      <View className="flex-1 items-center gap-3 px-[18px] pt-10">
        <View className="size-16 items-center justify-center rounded-full bg-primary/15">
          <Icon className="size-[30px] text-primary" name="Check" />
        </View>
        <Text className="text-center text-xl font-extrabold text-foreground">
          {`${returnableCount(saved.quantity, saved.itemName)} ${saved.kind === "RETURNED" ? "returned" : "written off"}`}
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          {`${saved.customerName} · ${saved.before} → ${saved.before - saved.quantity} out`}
        </Text>
        <View className="mt-4 w-full gap-2.5">
          <ActionButton variant="outline" onPress={reset}>
            Record another
          </ActionButton>
          <ActionButton onPress={() => router.back()}>Done</ActionButton>
        </View>
      </View>
    )

  return (
    <ScrollView
      contentContainerClassName="gap-3 px-[18px] pb-10"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {isOffline ? (
        <StatusBanner
          icon="WifiOff"
          message="Reconnect to record returns."
          title="You're offline"
          tone="warning"
        />
      ) : null}
      {balances.isError ? (
        <StatusBanner
          actionLabel="Try again"
          icon="AlertCircle"
          message="Couldn't load what customers hold."
          onActionPress={() => void balances.refetch()}
          tone="warning"
        />
      ) : null}
      {balances.isPending && !isOffline ? (
        <View className="gap-3" accessibilityLabel="Loading returnables">
          <Skeleton className="h-16 rounded-[18px]" />
          <Skeleton className="h-16 rounded-[18px]" />
        </View>
      ) : !customerId || (!forCustomer.length && !balances.isPending) ? (
        <CustomerChoice
          customers={customers}
          emptyLabel={
            customerId
              ? "Nothing is out with this customer."
              : "No customer has returnables out."
          }
          onChoose={(id) => {
            setCustomerId(id)
            setItemId(undefined)
            setQuantity(null)
          }}
        />
      ) : (
        <>
          <Field
            label="Customer"
            value={forCustomer[0]?.customerName ?? "Customer"}
            onChange={
              props.customerId ? undefined : () => setCustomerId(undefined)
            }
          />
          {forCustomer.length > 1 ? (
            <View className="gap-2">
              <Label>Item</Label>
              <View className="flex-row flex-wrap gap-2">
                {forCustomer.map((row) => {
                  const on = row.catalogItemId === balance?.catalogItemId
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      className={cn(
                        "min-h-11 justify-center rounded-full border-[1.5px] px-3.5",
                        on
                          ? "border-primary bg-accent"
                          : "border-transparent bg-muted",
                      )}
                      haptic="selection"
                      key={row.catalogItemId}
                      onPress={() => {
                        setItemId(row.catalogItemId)
                        setQuantity(null)
                      }}
                    >
                      <Text
                        className={cn(
                          "text-xs font-bold",
                          on ? "text-primary" : "text-foreground",
                        )}
                      >
                        {`${row.itemName} · ${row.out} out`}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ) : (
            <Field
              label="Item"
              value={balance ? `${balance.itemName} · ${balance.out} out` : "—"}
            />
          )}
          {balance ? (
            <>
              <Label>What happened</Label>
              <View className="flex-row gap-2" accessibilityRole="radiogroup">
                {(
                  [
                    ["RETURNED", "Returned", "Undo2"],
                    ["WRITTEN_OFF", "Lost", "TriangleAlert"],
                  ] as const
                ).map(([value, label, icon]) => {
                  const on = kind === value
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      className={cn(
                        "min-h-[52px] flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl border-2 bg-card shadow-sm",
                        on ? "border-primary" : "border-transparent",
                      )}
                      haptic="selection"
                      key={value}
                      onPress={() => setKind(value)}
                    >
                      <Icon
                        className={cn(
                          "size-[16px]",
                          on ? "text-primary" : "text-foreground",
                        )}
                        name={icon}
                      />
                      <Text
                        className={cn(
                          "text-sm font-extrabold",
                          on ? "text-primary" : "text-foreground",
                        )}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <QuantityStepper
                helper={`${balance.out} out`}
                label="How many"
                onChangeText={setQuantity}
                value={quantity ?? String(balance.out)}
              />
              {count !== balance.out ? (
                <Pressable
                  accessibilityRole="button"
                  className="min-h-9 self-start justify-center rounded-full bg-muted px-3.5"
                  haptic
                  onPress={() => setQuantity(null)}
                >
                  <Text className="text-xs font-bold text-foreground">
                    {`All ${balance.out}`}
                  </Text>
                </Pressable>
              ) : null}
              {count > balance.out ? (
                <Text className="text-xs text-destructive">
                  {`Only ${balance.out} out with this customer.`}
                </Text>
              ) : null}
              {kind === "WRITTEN_OFF" ? (
                <Text className="text-xs text-muted-foreground">
                  To charge for lost items, record a sale.
                </Text>
              ) : null}
              {record.error ? (
                <StatusBanner
                  icon="AlertCircle"
                  message={record.error.message}
                  title="Not saved"
                  tone="warning"
                />
              ) : null}
              <Text className="mt-2 text-center text-xs font-bold text-muted-foreground">
                {`${balance.customerName} · ${balance.out} → ${Math.max(0, balance.out - count)} ${balance.itemName.toLowerCase()} out`}
              </Text>
              <ActionButton
                disabled={!valid || isOffline}
                icon={kind === "RETURNED" ? "Undo2" : "TriangleAlert"}
                isLoading={record.isPending}
                loadingLabel="Saving"
                onPress={() => void save()}
              >
                {kind === "RETURNED"
                  ? `Save return · ${count}`
                  : `Write off ${count}`}
              </ActionButton>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  )
}

function Label({ children }: { children: string }) {
  return (
    <Text className="mt-1 text-xs font-extrabold uppercase tracking-[0.3px] text-muted-foreground">
      {children}
    </Text>
  )
}

function Field({
  label,
  onChange,
  value,
}: {
  label: string
  onChange?: () => void
  value: string
}) {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-card px-3.5 py-2.5 shadow-sm">
      <View className="min-w-0 flex-1">
        <Text className="text-xs font-bold text-muted-foreground">{label}</Text>
        <Text className="text-base font-extrabold text-foreground">
          {value}
        </Text>
      </View>
      {onChange ? (
        <Pressable
          accessibilityLabel={`Change ${label.toLowerCase()}`}
          accessibilityRole="button"
          className="min-h-11 justify-center px-1"
          haptic
          onPress={onChange}
        >
          <Text className="text-xs font-extrabold text-primary">Change</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function CustomerChoice({
  customers,
  emptyLabel,
  onChoose,
}: {
  customers: Array<{ customerId: string; customerName: string }>
  emptyLabel: string
  onChoose: (customerId: string) => void
}) {
  if (!customers.length)
    return (
      <View className="items-center gap-3 rounded-[20px] bg-card px-4 py-8 shadow-sm">
        <ReturnableBadge />
        <Text className="text-center text-sm text-muted-foreground">
          {emptyLabel}
        </Text>
      </View>
    )
  return (
    <View className="gap-2">
      <Label>Who is returning?</Label>
      <View className="overflow-hidden rounded-[20px] bg-card shadow-sm">
        {customers.map((row, index) => (
          <Pressable
            accessibilityRole="button"
            className={cn(
              "min-h-14 flex-row items-center gap-3 px-3.5 py-3",
              index > 0 && "border-t border-border",
            )}
            haptic
            key={row.customerId}
            onPress={() => onChoose(row.customerId)}
          >
            <Text className="flex-1 text-sm font-bold text-foreground">
              {row.customerName}
            </Text>
            <Icon
              className="size-[18px] text-muted-foreground"
              name="ChevronRight"
            />
          </Pressable>
        ))}
      </View>
    </View>
  )
}
