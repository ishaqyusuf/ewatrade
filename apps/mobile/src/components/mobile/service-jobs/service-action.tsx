import { ActionButton } from "@/components/mobile/action-button"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import type { ComponentProps } from "react"
import { useServiceAppearance } from "./use-service-appearance"

export function ServiceAction({
  tone = "palm",
  className,
  ...props
}: ComponentProps<typeof ActionButton> & { tone?: "palm" | "gold" }) {
  const { market } = useServiceAppearance()
  const palette = useMarketDayPalette()
  const primary = !props.variant || props.variant === "default"
  const disabled = props.disabled || props.isLoading
  const foreground = primary
    ? tone === "gold"
      ? palette.onMarigold
      : palette.onPalm
    : palette.ink
  return (
    <ActionButton
      {...props}
      foregroundColor={market ? foreground : props.foregroundColor}
      disabledForegroundColor={
        market ? palette.mutedInk : props.disabledForegroundColor
      }
      className={cn(
        market &&
          (primary
            ? disabled
              ? "bg-market-line active:bg-market-line"
              : tone === "gold"
                ? "bg-market-marigold active:bg-market-marigold"
                : "bg-market-palm active:bg-market-hero-pressed"
            : props.variant === "outline"
              ? "border-market-line bg-market-field active:bg-market-line"
              : "bg-transparent active:bg-market-line"),
        className,
      )}
    />
  )
}
