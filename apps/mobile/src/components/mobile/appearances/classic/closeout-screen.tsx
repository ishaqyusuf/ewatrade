import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
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
  differences,
}: CloseoutHeaderProps) {
  const title = completed
    ? "Closeout recorded"
    : count === null || changedCount === null
      ? "Check your counts"
      : count === 0
        ? "No balances to count"
        : changedCount
          ? `${changedCount} of ${count} differ`
          : `All ${count} match`
  const who = `${attendantName} · ${storeName}`
  return (
    <HeroCard
      label={
        offline && updatedAt
          ? `Your custody · as of ${new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
          : "Stock in your custody"
      }
      title={title}
      sub={
        !completed && changedCount && differences
          ? differences
          : count
            ? `${who}${changedCount === 0 ? " · counts equal expected" : ""}`
            : who
      }
      pill={{
        label: offline ? "Offline" : completed ? "Synced" : "Online",
        tone: offline ? "offline" : "synced",
      }}
      stats={
        count === null
          ? undefined
          : [
              { label: "Balances", value: String(count) },
              {
                label: "Matching",
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
/** "−2" or "+3" with a real minus sign. */
export function signedVariance(variance: string) {
  return variance.startsWith("-") ? `−${variance.slice(1)}` : `+${variance}`
}

export function ClassicCloseoutRow({
  line,
  index,
  last = false,
  disabled,
  onChange,
}: CloseoutRowProps) {
  const row = line.balance
  return (
    <View
      className={cn(
        "bg-card px-3.5",
        index === 0 && "rounded-t-[20px]",
        last && "mb-1 rounded-b-[20px]",
      )}
    >
      <View className={cn("gap-2.5 py-3.5", !last && "border-b border-border")}>
        <View className="flex-row items-start justify-between gap-3">
          <Text
            className="min-w-0 flex-1 text-sm font-bold text-foreground"
            numberOfLines={2}
          >
            {row.productName}
          </Text>
          <StatusPill
            tone={line.error ? "danger" : line.variance === "0" ? "ok" : "warn"}
            label={
              line.error
                ? "Check count"
                : line.variance === "0" || line.variance === null
                  ? "Matches"
                  : `${signedVariance(line.variance)} ${row.inventoryUnitName}`
            }
          />
        </View>
        <Text className="text-xs text-muted-foreground">
          {row.variantName && row.variantName !== row.productName
            ? `${row.variantName} · `
            : ""}
          Expected {row.onHandQuantity} {row.inventoryUnitName}
        </Text>
        <ExactQuantityStepper
          label={`Counted · ${row.inventoryUnitName}`}
          disabled={disabled}
          value={line.value}
          onChange={onChange}
          error={line.error ?? undefined}
        />
      </View>
    </View>
  )
}
