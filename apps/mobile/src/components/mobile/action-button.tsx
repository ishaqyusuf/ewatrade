import { Button, type ButtonProps } from "@/components/ui/button"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { COMPACT_CONTROL_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import { cn } from "@/lib/utils"
import { VariableContextProvider } from "nativewind"
import type { ReactNode } from "react"
import { ActivityIndicator, Text as NativeText, View } from "react-native"

export type ActionButtonProps = ButtonProps & {
  children: ReactNode
  contentClassName?: string
  disabledForegroundColor?: string
  foregroundColor?: string
  icon?: IconKeys
  iconSize?: number
  isLoading?: boolean
  labelClassName?: string
  loadingLabel?: string
  trailingIcon?: IconKeys
}

export function ActionButton({
  children,
  className,
  contentClassName,
  disabled,
  disabledForegroundColor,
  foregroundColor: foregroundColorOverride,
  icon,
  iconSize = 16,
  isLoading,
  labelClassName,
  loadingLabel,
  trailingIcon,
  variant,
  ...props
}: ActionButtonProps) {
  const colors = useColors()
  const largeTextLayout = useLargeTextLayout()
  const isDisabled = !!disabled || !!isLoading
  const isDefaultVariant = !variant || variant === "default"
  const isOutlineVariant = variant === "outline"
  const foregroundClassName = cn(
    "text-sm font-bold leading-5",
    isDefaultVariant &&
      (isDisabled ? "text-muted-foreground" : "text-primary-foreground"),
    isOutlineVariant && "text-foreground",
    variant === "destructive" && "text-destructive",
    variant === "secondary" && "text-secondary-foreground",
    variant === "ghost" && "text-foreground",
    variant === "link" && "text-primary",
  )
  const foregroundColor = isDisabled
    ? (disabledForegroundColor ?? colors.mutedForeground)
    : (foregroundColorOverride ??
      (isDefaultVariant
        ? colors.primaryForeground
        : isOutlineVariant || variant === "ghost"
          ? colors.foreground
          : variant === "destructive"
            ? colors.destructive
            : variant === "secondary"
              ? colors.secondaryForeground
              : colors.primary))
  const iconClassName = cn("size-sm", foregroundClassName)

  return (
    <VariableContextProvider value={{ "--action-foreground": foregroundColor }}>
      <Button
        accessibilityState={{
          ...props.accessibilityState,
          busy: !!isLoading,
          disabled: isDisabled,
        }}
        className={cn(
          largeTextLayout
            ? "h-auto min-h-[64px] w-full rounded-xl px-[18px] py-0"
            : "h-auto min-h-[50px] w-full rounded-xl px-[18px] py-0",
          isDefaultVariant &&
            (isDisabled
              ? "bg-muted active:bg-muted"
              : "bg-primary active:bg-primary/90"),
          isOutlineVariant && "bg-muted/60 active:bg-accent",
          variant === "destructive" &&
            "bg-destructive/10 active:bg-destructive/20",
          className,
        )}
        disabled={isDisabled}
        size="lg"
        variant={variant ?? "default"}
        {...props}
      >
        <View
          className={cn(
            largeTextLayout
              ? "flex-row items-center justify-center gap-2"
              : "-translate-y-[2px] flex-row items-center justify-center gap-2",
            contentClassName,
          )}
        >
          {isLoading ? (
            <ActivityIndicator color={foregroundColor} size="small" />
          ) : icon ? (
            <Icon
              className={iconClassName}
              color={
                foregroundColorOverride || disabledForegroundColor
                  ? foregroundColor
                  : undefined
              }
              name={icon}
              size={iconSize}
            />
          ) : null}
          <NativeText
            maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
            numberOfLines={1}
            className={cn(
              "text-[14px] font-bold text-[color:var(--action-foreground)] [-rn-include-font-padding:false] [-rn-text-align-vertical:center]",
              largeTextLayout ? "[-rn-line-height:28]" : "[-rn-line-height:20]",
              labelClassName,
            )}
          >
            {isLoading && loadingLabel ? loadingLabel : children}
          </NativeText>
          {!isLoading && trailingIcon ? (
            <Icon
              className={iconClassName}
              color={
                foregroundColorOverride || disabledForegroundColor
                  ? foregroundColor
                  : undefined
              }
              name={trailingIcon}
              size={iconSize}
            />
          ) : null}
        </View>
      </Button>
    </VariableContextProvider>
  )
}

type MarketDayActionButtonProps = Omit<
  ActionButtonProps,
  "disabledForegroundColor" | "foregroundColor"
> & {
  tone?: "marigold" | "palm" | "paprika"
}

export function MarketDayActionButton({
  children,
  className,
  disabled,
  isLoading,
  tone = "paprika",
  ...props
}: MarketDayActionButtonProps) {
  const marketDay = useMarketDayPalette()
  const largeTextLayout = useLargeTextLayout()
  const isUnavailable = !!disabled || !!isLoading
  const tonePalette = {
    marigold: {
      backgroundColor: marketDay.marigold,
      foregroundColor: marketDay.onMarigold,
    },
    palm: {
      backgroundColor: marketDay.palm,
      foregroundColor: marketDay.onPalm,
    },
    paprika: {
      backgroundColor: marketDay.paprika,
      foregroundColor: marketDay.onPaprika,
    },
  } as const
  const activePalette = tonePalette[tone]
  const foregroundColor = isUnavailable
    ? marketDay.mutedInk
    : activePalette.foregroundColor

  return (
    <View
      className={cn(
        "w-full overflow-hidden rounded-[14px]",
        isUnavailable
          ? "bg-market-line"
          : tone === "marigold"
            ? "bg-market-marigold"
            : tone === "palm"
              ? "bg-market-palm"
              : "bg-market-paprika",
      )}
    >
      <ActionButton
        {...props}
        className={cn(
          largeTextLayout
            ? "min-h-[64px] bg-transparent active:bg-transparent"
            : "min-h-[54px] bg-transparent active:bg-transparent",
          className,
        )}
        disabled={disabled}
        disabledForegroundColor={foregroundColor}
        foregroundColor={foregroundColor}
        isLoading={isLoading}
      >
        {children}
      </ActionButton>
    </View>
  )
}
