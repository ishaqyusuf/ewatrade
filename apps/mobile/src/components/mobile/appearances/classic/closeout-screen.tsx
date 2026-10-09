import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type {
  CloseoutHeaderProps,
  CloseoutRowProps,
} from "../../closeout/closeout-presentation"
import { HeroCard } from "../../green-till/hero-card"
import { StatusPill } from "../../green-till/kit"
import { ExactQuantityStepper } from "../../stock-intake/exact-quantity-stepper"
export function ClassicCloseoutHeader({
  attendantName,
  storeName,
  count,
  changedCount,
  loading,
  offline,
  updatedAt,
  completed,
}: CloseoutHeaderProps) {
  const title = completed
    ? "Closeout recorded"
    : count === null || changedCount === null
      ? "Check your counts"
      : count === 0
        ? "No balances to count"
        : changedCount
          ? `${changedCount} ${changedCount === 1 ? "difference" : "differences"}`
          : `All ${count} match`
  return (
    <HeroCard
      label="Close day"
      title={title}
      sub={`${attendantName} · ${storeName}${offline && updatedAt ? ` · as of ${new Date(updatedAt).toLocaleString()}` : ""}`}
      pill={{
        label: offline ? "Saved copy" : completed ? "Recorded" : "Draft",
        tone: offline ? "offline" : completed ? "synced" : "draft",
      }}
      stats={
        count === null
          ? undefined
          : [
              { label: "Balances", value: String(count) },
              {
                label: "Match",
                value:
                  changedCount === null ? "—" : String(count - changedCount),
              },
              {
                label: "Different",
                value: changedCount === null ? "—" : String(changedCount),
              },
            ]
      }
    >
      {loading ? (
        <View className="mt-4">
          <Skeleton className="h-10 w-full" />
        </View>
      ) : null}
    </HeroCard>
  )
}
export function ClassicCloseoutRow({
  line,
  disabled,
  onChange,
}: CloseoutRowProps) {
  const row = line.balance
  return (
    <View className="mb-4 gap-3 rounded-[20px] bg-card p-4 shadow-sm">
      <View className="flex-row flex-wrap items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-bold text-foreground">
            {row.productName} · {row.variantName}
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            Expected {row.onHandQuantity} {row.inventoryUnitName}
          </Text>
        </View>
        <StatusPill
          tone={line.error ? "danger" : line.variance === "0" ? "ok" : "warn"}
          label={
            line.error
              ? "Check count"
              : line.variance === "0"
                ? "Matches"
                : `${line.variance} ${row.inventoryUnitName}`
          }
        />
      </View>
      <ExactQuantityStepper
        label={`Count · ${row.productName}, ${row.inventoryUnitName}`}
        disabled={disabled}
        value={line.value}
        onChange={onChange}
        error={line.error ?? undefined}
      />
    </View>
  )
}
