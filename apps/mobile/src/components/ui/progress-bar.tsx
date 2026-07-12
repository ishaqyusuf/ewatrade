import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import { type VariantProps, cva } from "class-variance-authority"
import type * as React from "react"
import { View } from "react-native"

import { Text } from "./text"

const progressTrackVariants = cva(
  "w-full overflow-hidden rounded-full bg-muted",
  {
    variants: {
      size: {
        sm: "h-1.5",
        md: "h-2.5",
        lg: "h-3.5",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
)

type ProgressBarProps = Omit<React.ComponentProps<typeof View>, "children"> &
  VariantProps<typeof progressTrackVariants> & {
    value: number
    label: string
    info?: string
    min?: number
    max?: number
    trackClassName?: string
    fillClassName?: string
    labelClassName?: string
    valueClassName?: string
  }

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getProgressFillColor(
  percent: number,
  colors: ReturnType<typeof useColors>,
) {
  if (percent >= 80) return colors.primary
  if (percent >= 60) return colors.success
  if (percent >= 40) return colors.chart3
  if (percent >= 20) return colors.warn

  return colors.destructive
}

function ProgressBar({
  value,
  label,
  info,
  min = 0,
  max = 100,
  size,
  className,
  trackClassName,
  fillClassName,
  labelClassName,
  valueClassName,
  ...props
}: ProgressBarProps) {
  const colors = useColors()
  const safeMax = Math.max(max, min)
  const safeValue = clamp(value, min, safeMax)
  const total = safeMax - min
  const percent = total > 0 ? ((safeValue - min) / total) * 100 : 0
  const visualPercent = total > 0 && percent > 0 ? Math.max(percent, 6) : 0
  const fillColor = getProgressFillColor(percent, colors)
  const baseValue = Math.round(safeValue - min)
  const totalValue = Math.round(total)
  const infoText = info ? `${baseValue}/${totalValue} ${info}` : null

  return (
    <View className={cn("w-full gap-2", className)} {...props}>
      <View className="flex-row items-center justify-between">
        <Text
          className={cn("text-sm font-medium text-foreground", labelClassName)}
        >
          {label}
        </Text>
        {infoText ? (
          <Text
            className={cn(
              "text-sm font-semibold text-foreground",
              valueClassName,
            )}
          >
            {infoText}
          </Text>
        ) : null}
      </View>

      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min, max: safeMax, now: safeValue }}
        className={cn(progressTrackVariants({ size }), trackClassName)}
      >
        {fillClassName ? (
          <View style={{ width: `${visualPercent}%`, height: "100%" }}>
            <View className={cn("h-full rounded-full", fillClassName)} />
          </View>
        ) : (
          <View
            style={{
              width: `${visualPercent}%`,
              height: "100%",
              borderRadius: 999,
              backgroundColor: fillColor,
            }}
          />
        )}
      </View>
    </View>
  )
}

export { ProgressBar }
export type { ProgressBarProps }
