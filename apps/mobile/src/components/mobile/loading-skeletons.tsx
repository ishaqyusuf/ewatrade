import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { View } from "@/components/ui/view"

export type SkeletonRowVariant = "order" | "item" | "person" | "ledger"

// Varied widths keep a column of placeholders from reading as a barcode.
const WIDTHS = ["58%", "46%", "64%", "52%", "40%", "60%"] as const

function width(index: number) {
  return WIDTHS[index % WIDTHS.length]
}

function SkeletonRow({
  index,
  variant,
}: {
  index: number
  variant: SkeletonRowVariant
}) {
  if (variant === "item")
    return (
      <View className="flex-row items-center gap-3 border-b border-border py-3">
        <Skeleton height={44} radius={12} width={44} />
        <View className="min-w-0 flex-1 gap-2">
          <Skeleton height={13} width={width(index)} />
          <Skeleton height={10} width="72%" />
        </View>
        <Skeleton height={13} width={58} />
      </View>
    )
  if (variant === "person")
    return (
      <View className="flex-row items-center gap-3 border-b border-border py-3">
        <Skeleton height={38} radius={19} width={38} />
        <View className="min-w-0 flex-1 gap-2">
          <Skeleton height={13} width={width(index)} />
          <Skeleton height={10} width="38%" />
        </View>
      </View>
    )
  if (variant === "ledger")
    return (
      <View className="flex-row items-center gap-3 border-b border-border py-3">
        <View className="min-w-0 flex-1 gap-2">
          <Skeleton height={12} width={width(index)} />
          <Skeleton height={10} width="30%" />
        </View>
        <Skeleton height={12} width={72} />
      </View>
    )
  return (
    <View className="gap-2 border-b border-border py-3">
      <View className="flex-row items-center justify-between gap-3">
        <Skeleton height={14} width="34%" />
        <Skeleton height={14} width={70} />
      </View>
      <View className="flex-row items-center justify-between gap-3">
        <Skeleton height={10} width={width(index)} />
        <Skeleton height={20} radius={10} width={62} />
      </View>
    </View>
  )
}

/**
 * Placeholder rows shaped like the list that is loading. The screen keeps its
 * real title, filters and labels; only the incoming rows are drawn here.
 */
export function ListSkeleton({
  count = 5,
  label,
  variant = "order",
}: {
  count?: number
  /** What is loading, read by screen readers, e.g. "Loading orders". */
  label: string
  variant?: SkeletonRowVariant
}) {
  return (
    <SkeletonGroup accessibilityLabel={label}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonRow
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders never reorder.
          key={index}
          index={index}
          variant={variant}
        />
      ))}
    </SkeletonGroup>
  )
}

/** Placeholder for a record overview: summary card, then a few rows. */
export function DetailSkeleton({
  label,
  rows = 3,
}: {
  label: string
  rows?: number
}) {
  return (
    <SkeletonGroup accessibilityLabel={label}>
      <View className="gap-6">
        <View className="gap-3 rounded-2xl bg-card p-4">
          <Skeleton height={11} width="32%" />
          <Skeleton height={30} width="56%" />
          <View className="flex-row gap-2">
            <Skeleton height={22} radius={11} width={64} />
            <Skeleton height={22} radius={11} width={78} />
          </View>
        </View>
        <View className="gap-1">
          <Skeleton height={15} width="28%" />
          {Array.from({ length: rows }, (_, index) => (
            <SkeletonRow
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders never reorder.
              key={index}
              index={index}
              variant="ledger"
            />
          ))}
        </View>
      </View>
    </SkeletonGroup>
  )
}

/** A single value placeholder for stat tiles and inline figures. */
export function ValueSkeleton({
  label,
  width: valueWidth = 64,
}: {
  label: string
  width?: number
}) {
  return (
    <SkeletonGroup accessibilityLabel={label}>
      <Skeleton height={20} width={valueWidth} />
    </SkeletonGroup>
  )
}

/** Placeholder for the Home overview: primary action, two tiles, recent rows. */
export function HomeSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup accessibilityLabel={label}>
      <View className="gap-4">
        <Skeleton height={52} radius={14} />
        <View className="flex-row gap-3">
          <View className="flex-1 gap-3 rounded-2xl bg-card p-4">
            <Skeleton height={11} width="62%" />
            <Skeleton height={26} width="34%" />
          </View>
          <View className="flex-1 gap-3 rounded-2xl bg-card p-4">
            <Skeleton height={11} width="62%" />
            <Skeleton height={26} width="34%" />
          </View>
        </View>
        <Skeleton height={56} radius={14} />
        <View className="gap-1 pt-2">
          <Skeleton height={16} width="36%" />
          {Array.from({ length: 3 }, (_, index) => (
            <SkeletonRow
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders never reorder.
              key={index}
              index={index}
              variant="item"
            />
          ))}
        </View>
      </View>
    </SkeletonGroup>
  )
}
