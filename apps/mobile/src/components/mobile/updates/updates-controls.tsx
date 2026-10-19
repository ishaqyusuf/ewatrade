import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import { VariableContextProvider } from "nativewind"
import { ActivityIndicator } from "react-native"
import type { UpdateStep } from "./updates-presentation"

export function UpdatesProgress({ progress }: { progress: number | null }) {
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
        <View className="h-2 overflow-hidden rounded-full bg-secondary">
          <View className="h-full w-[var(--update-progress)] rounded-full bg-primary" />
        </View>
        <Text className="text-xs font-medium text-muted-foreground">
          {progress === null
            ? "Waiting for download progress…"
            : `${progress}% downloaded`}
        </Text>
      </View>
    </VariableContextProvider>
  )
}

export function UpdatesStepRow({ step }: { step: UpdateStep }) {
  const colors = useColors()
  return (
    <View className="flex-row items-center gap-3">
      <View
        className={cn(
          "size-8 shrink-0 items-center justify-center rounded-full",
          step.done ? "bg-primary" : "bg-secondary",
        )}
      >
        {step.active ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : step.done ? (
          <Icon name="Check" className="size-sm text-primary-foreground" />
        ) : (
          <View className="size-2 rounded-full bg-muted-foreground/50" />
        )}
      </View>
      <Text className="min-w-0 flex-1 text-sm font-semibold text-foreground [-rn-line-height:22]">
        {step.label}
      </Text>
    </View>
  )
}
