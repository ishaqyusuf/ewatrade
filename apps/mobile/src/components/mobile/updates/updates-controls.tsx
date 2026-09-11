import { ActionButton } from "@/components/mobile/action-button"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import { VariableContextProvider } from "nativewind"
import { ActivityIndicator } from "react-native"
import type {
  UpdateStep,
  UpdatesPresentationProps,
} from "./updates-presentation"

export function UpdatesProgress({
  progress,
  market = false,
}: { progress: number | null; market?: boolean }) {
  return (
    <VariableContextProvider
      value={{ "--update-progress": `${progress ?? 0}%` }}
    >
      <View
        className="gap-2"
        accessibilityRole="progressbar"
        accessibilityValue={
          progress === null
            ? { text: "Downloading" }
            : { min: 0, max: 100, now: progress }
        }
      >
        <View
          className={cn(
            "h-2 overflow-hidden rounded-full",
            market ? "bg-market-line" : "bg-secondary",
          )}
        >
          <View
            className={cn(
              "h-full w-[var(--update-progress)] rounded-full",
              market ? "bg-market-accent-ink" : "bg-primary",
            )}
          />
        </View>
        <Text
          className={cn(
            "text-xs font-medium",
            market ? "text-market-muted-ink" : "text-muted-foreground",
          )}
        >
          {progress === null
            ? "Waiting for download progress…"
            : `${progress}% downloaded`}
        </Text>
      </View>
    </VariableContextProvider>
  )
}

export function UpdatesStepRow({
  step,
  market = false,
  index,
}: { step: UpdateStep; market?: boolean; index: number }) {
  const colors = useColors()
  const palette = useMarketDayPalette()
  return (
    <View className="flex-row items-center gap-3">
      <View
        className={cn(
          "size-8 shrink-0 items-center justify-center rounded-full",
          market
            ? step.done
              ? "bg-market-palm"
              : "bg-market-field"
            : step.done
              ? "bg-primary"
              : "bg-secondary",
        )}
      >
        {step.active ? (
          <ActivityIndicator
            size="small"
            color={market ? palette.accentInk : colors.primary}
          />
        ) : step.done ? (
          <Icon
            name="Check"
            className={cn(
              "size-sm",
              market ? "text-market-on-palm" : "text-primary-foreground",
            )}
          />
        ) : market ? (
          <Text
            className={cn(
              "text-xs font-bold",
              market ? "text-market-muted-ink" : "text-muted-foreground",
            )}
          >
            {index + 1}
          </Text>
        ) : (
          <View className="size-2 rounded-full bg-muted-foreground/50" />
        )}
      </View>
      <Text
        className={cn(
          "min-w-0 flex-1 text-sm font-semibold [-rn-line-height:21]",
          market ? "text-market-ink" : "text-foreground",
        )}
      >
        {step.label}
      </Text>
    </View>
  )
}

export function UpdatesActions({
  model,
  market = false,
}: { model: UpdatesPresentationProps; market?: boolean }) {
  const largeText = useLargeTextLayout()
  const palette = useMarketDayPalette()
  return (
    <View className="gap-3">
      <ActionButton
        icon="RefreshCw"
        disabled={!model.canCheck}
        isLoading={model.checking}
        onPress={model.onCheck}
        foregroundColor={market ? palette.onPalm : undefined}
        className={
          market && model.canCheck
            ? "bg-market-palm active:bg-market-hero-pressed"
            : undefined
        }
      >
        Check for update
      </ActionButton>
      <View className={cn("gap-3", largeText ? "flex-col" : "flex-row")}>
        <ActionButton
          className={cn(
            !largeText && "w-auto flex-1",
            market && "bg-market-field active:bg-market-line",
          )}
          variant="secondary"
          foregroundColor={market ? palette.ink : undefined}
          icon="Download"
          disabled={!model.canDownload}
          isLoading={model.downloading}
          onPress={model.onDownload}
        >
          Download
        </ActionButton>
        <ActionButton
          className={cn(
            !largeText && "w-auto flex-1",
            market && "bg-market-field active:bg-market-line",
          )}
          variant="secondary"
          foregroundColor={market ? palette.ink : undefined}
          icon="RotateCw"
          disabled={!model.canRestart}
          isLoading={model.restarting}
          onPress={model.onRestart}
        >
          Restart
        </ActionButton>
      </View>
    </View>
  )
}
