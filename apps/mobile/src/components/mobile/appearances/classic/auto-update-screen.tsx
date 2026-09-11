import { ActionButton } from "@/components/mobile/action-button"
import {
  UpdatesProgress,
  UpdatesStepRow,
} from "@/components/mobile/updates/updates-controls"
import type { AutoUpdatePresentationProps } from "@/components/mobile/updates/updates-presentation"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors, useColorScheme } from "@/hooks/use-color"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import { ScrollView } from "react-native-css/components/ScrollView"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function ClassicAutoUpdateScreen(model: AutoUpdatePresentationProps) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  return (
    <VariableContextProvider
      value={{
        "--auto-top": insets.top + 28,
        "--auto-bottom": insets.bottom + 28,
      }}
    >
      <View className="flex-1 bg-background">
        <StatusBar
          backgroundColor={colors.background}
          style={colorScheme === "dark" ? "light" : "dark"}
        />
        <ScrollView
          className="flex-1"
          contentContainerClassName="grow items-center justify-center gap-7 px-7 pt-[var(--auto-top)] pb-[var(--auto-bottom)]"
        >
          <View className="size-[68px] items-center justify-center rounded-full bg-primary/10">
            <Icon
              name={model.failed ? "AlertCircle" : "Download"}
              className="size-xl text-primary"
            />
          </View>
          <View className="gap-3" accessibilityLiveRegion="polite">
            <Text
              accessibilityRole="header"
              className="text-center text-3xl font-extrabold text-foreground"
            >
              {model.title}
            </Text>
            <Text className="text-center text-base text-muted-foreground [-rn-line-height:24]">
              {model.message}
            </Text>
          </View>
          {model.failed ? (
            <ActionButton onPress={model.onContinue}>Continue</ActionButton>
          ) : (
            <View className="w-full gap-5">
              {model.downloading ? (
                <UpdatesProgress progress={model.progress} />
              ) : null}
              {model.steps.map((step, index) => (
                <UpdatesStepRow key={step.label} step={step} index={index} />
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </VariableContextProvider>
  )
}
