// Plain grouped settings pieces for Account and privacy (Workshop 04 "Quiet settings").
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { Children, type ReactNode, isValidElement } from "react"
import { RowDivider } from "../green-till/kit"

/** Text back link (‹ More) above a large left-aligned title. */
export function QuietHeader({
  backLabel,
  onBack,
  title,
}: {
  backLabel: string
  onBack: () => void
  title: string
}) {
  const colors = useColors()
  return (
    <View className="gap-1">
      <Pressable
        accessibilityLabel={`Back to ${backLabel}`}
        accessibilityRole="button"
        className="min-h-11 flex-row items-center gap-0.5 self-start pr-3"
        haptic
        hitSlop={8}
        onPress={onBack}
      >
        <Icon
          className="size-[20px]"
          color={colors.primary}
          name="ChevronLeft"
        />
        <Text className="text-base font-semibold text-primary">
          {backLabel}
        </Text>
      </Pressable>
      <Text
        accessibilityRole="header"
        className="text-[30px] font-extrabold tracking-tight text-foreground"
      >
        {title}
      </Text>
    </View>
  )
}

/** An optional small caps label over an unpadded, clipped card of rows. */
export function QuietGroup({
  children,
  footer,
  title,
}: {
  children: ReactNode
  footer?: string
  title?: string
}) {
  const rows = Children.toArray(children).filter(isValidElement)
  return (
    <View>
      {title ? (
        <Text
          accessibilityRole="header"
          className="mb-1.5 px-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {title}
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-[14px] bg-card">
        {rows.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows keep their order
          <View key={index} className="relative">
            {row}
            {index < rows.length - 1 ? <RowDivider /> : null}
          </View>
        ))}
      </View>
      {footer ? (
        <Text className="mt-2 px-3.5 text-xs [-rn-line-height:22] text-muted-foreground">
          {footer}
        </Text>
      ) : null}
    </View>
  )
}

export function QuietRow({
  accessibilityLabel,
  chevron = true,
  icon,
  leading,
  onPress,
  sub,
  testID,
  title,
  tone = "default",
  value,
}: {
  accessibilityLabel?: string
  /** Hide the trailing chevron, e.g. on a destructive action row. */
  chevron?: boolean
  icon?: IconKeys
  /** Custom leading content, such as initials, in place of an icon. */
  leading?: ReactNode
  onPress?: () => void
  sub?: string
  testID?: string
  title: string
  /** "attention" emphasises the value; "danger" turns the title red. */
  tone?: "default" | "attention" | "danger"
  value?: string
}) {
  const colors = useColors()
  const largeText = useLargeTextLayout()
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onPress ? "button" : undefined}
      className={cn(
        "min-h-12 gap-3 px-3.5 py-2.5",
        largeText ? "flex-row items-start" : "flex-row items-center",
      )}
      disabled={!onPress}
      haptic
      onPress={onPress}
      testID={testID}
    >
      {leading ??
        (icon ? (
          <Icon
            className="size-[20px]"
            color={
              tone === "attention" ? colors.primary : colors.mutedForeground
            }
            name={icon}
          />
        ) : null)}
      <View className="min-w-0 flex-1">
        <Text
          className={cn(
            "text-base [-rn-line-height:22]",
            tone === "danger"
              ? "font-semibold text-destructive"
              : "text-foreground",
          )}
        >
          {title}
        </Text>
        {sub ? (
          <Text className="text-xs [-rn-line-height:22] text-muted-foreground">
            {sub}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text
          className={cn(
            "text-sm",
            tone === "attention"
              ? "font-bold text-primary"
              : "text-muted-foreground",
          )}
        >
          {value}
        </Text>
      ) : null}
      {onPress && chevron ? (
        <Icon
          className="size-[16px]"
          color={colors.mutedForeground}
          name="ChevronRight"
        />
      ) : null}
    </Pressable>
  )
}
