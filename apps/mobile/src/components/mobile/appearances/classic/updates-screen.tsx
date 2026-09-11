import {
  UpdatesActions,
  UpdatesProgress,
  UpdatesStepRow,
} from "@/components/mobile/updates/updates-controls"
import {
  UPDATE_HELP,
  type UpdatesPresentationProps,
} from "@/components/mobile/updates/updates-presentation"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors, useColorScheme } from "@/hooks/use-color"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import { ScrollView } from "react-native-css/components/ScrollView"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function ClassicUpdatesScreen(model: UpdatesPresentationProps) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  return (
    <VariableContextProvider
      value={{
        "--updates-top": insets.top,
        "--updates-bottom": insets.bottom + 40,
      }}
    >
      <View className="flex-1 bg-background pt-[var(--updates-top)]">
        <StatusBar
          backgroundColor={colors.background}
          style={colorScheme === "dark" ? "light" : "dark"}
        />
        <View className="flex-row items-center gap-3 px-4 py-3">
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            haptic
            onPress={model.onBack}
            className="size-11 items-center justify-center rounded-full bg-card"
          >
            <Icon name="ChevronLeft" className="size-md text-foreground" />
          </Pressable>
          <Text
            accessibilityRole="header"
            className="min-w-0 flex-1 text-[22px] font-extrabold text-foreground"
          >
            App updates
          </Text>
        </View>
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 px-4 pb-[var(--updates-bottom)] pt-2"
        >
          <View className="gap-4 rounded-2xl bg-card p-4">
            <View className="flex-row items-start gap-3">
              <View
                className="min-w-0 flex-1 gap-2"
                accessibilityLiveRegion="polite"
              >
                <Text className="text-sm font-semibold uppercase text-muted-foreground">
                  Status
                </Text>
                <Text className="text-2xl font-extrabold text-foreground">
                  {model.status}
                </Text>
                <Text className="text-sm text-muted-foreground [-rn-line-height:21]">
                  {model.message}
                </Text>
              </View>
              <View className="size-12 items-center justify-center rounded-full bg-secondary">
                <Icon
                  name={
                    model.pending
                      ? "Download"
                      : model.enabled
                        ? "RefreshCw"
                        : "Info"
                  }
                  className="size-md text-foreground"
                />
              </View>
            </View>
            {model.errorMessage ? (
              <Text
                accessibilityRole="alert"
                className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive [-rn-line-height:21]"
              >
                {model.errorMessage}
              </Text>
            ) : null}
            {model.downloading ? (
              <UpdatesProgress progress={model.progress} />
            ) : null}
          </View>
          <View className="gap-3 rounded-2xl bg-card p-4">
            {model.steps.map((step, index) => (
              <UpdatesStepRow key={step.label} step={step} index={index} />
            ))}
          </View>
          <UpdatesActions model={model} />
          <View className="rounded-2xl bg-card px-4">
            {model.info.map((row) => (
              <View
                key={row.label}
                className="flex-row items-start gap-3 border-b border-border py-3"
              >
                <Text className="flex-1 text-sm font-medium text-muted-foreground">
                  {row.label}
                </Text>
                <Text className="min-w-0 flex-1 text-right text-sm font-semibold text-foreground">
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
          <View className="gap-2 rounded-2xl bg-card p-4">
            <Text className="text-base font-extrabold text-foreground">
              How auto update works
            </Text>
            <Text className="text-sm text-muted-foreground [-rn-line-height:21]">
              {UPDATE_HELP}
            </Text>
          </View>
          {model.latestError ? (
            <View className="gap-2 rounded-2xl bg-card p-4">
              <Text className="text-base font-extrabold text-foreground">
                Latest update error
              </Text>
              <Text className="text-sm text-muted-foreground [-rn-line-height:21]">
                {model.latestError}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </VariableContextProvider>
  )
}
