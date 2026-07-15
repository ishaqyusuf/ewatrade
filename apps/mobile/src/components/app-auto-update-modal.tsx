import {
  AppAutoUpdateStep,
  AUTO_UPDATE_STEPS,
  getAutoUpdateStepState,
} from "@/components/app-auto-update-step"
import { SafeArea } from "@/components/safe-area"
import { ActionButton } from "@/components/mobile/action-button"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useLaunchAutoUpdate } from "@/hooks/use-launch-auto-update"
import { StatusBar } from "expo-status-bar"
import { Modal, StyleSheet, View } from "react-native"

function rgbWithAlpha(value: string, alpha: number) {
  const match = value.match(/^rgb\(([^)]+)\)$/)
  return match ? `rgba(${match[1]}, ${alpha})` : value
}

export function AppAutoUpdateModal() {
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const { dismissFailure, downloadProgress, errorMessage, phase, visible } =
    useLaunchAutoUpdate()

  const failed = phase === "failed"
  const progress =
    phase === "downloading"
      ? Math.max(downloadProgress ?? 0.12, 0.12)
      : phase === "updating"
        ? 0.86
        : phase === "restarting"
          ? 1
          : 0
  const title = failed ? "Update paused" : `${phase} update`
  const message = failed
    ? (errorMessage ?? "The update could not be applied.")
    : phase === "downloading"
      ? "A new version is available. Keep the app open while it downloads."
      : phase === "updating"
        ? "Preparing the new version and verifying the update."
        : "Restarting into the updated app."

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => undefined}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <SafeArea style={{ backgroundColor: colors.background }}>
        <StatusBar
          backgroundColor={colors.background}
          style={colorScheme === "dark" ? "light" : "dark"}
        />
        <View style={styles.content}>
          <View className="size-[68px] items-center justify-center rounded-[34px] bg-primary/10">
            {failed ? (
              <Icon className="size-xl text-destructive" name="AlertCircle" />
            ) : (
              <Icon className="size-xl text-primary" name="Download" />
            )}
          </View>

          <View className="gap-3">
            <Text className="text-center text-3xl font-extrabold capitalize text-foreground">
              {title}
            </Text>
            <Text className="text-center text-base leading-6 text-muted-foreground">
              {message}
            </Text>
          </View>

          {!failed ? (
            <View className="w-full gap-5">
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: rgbWithAlpha(colors.primary, 0.12) },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: colors.primary,
                      width: `${Math.round(progress * 100)}%`,
                    },
                  ]}
                />
              </View>

              <View className="gap-4">
                {AUTO_UPDATE_STEPS.map((label) => {
                  const state = getAutoUpdateStepState(phase, label)
                  return (
                    <AppAutoUpdateStep key={label} label={label} {...state} />
                  )
                })}
              </View>
            </View>
          ) : (
            <ActionButton onPress={dismissFailure}>Continue</ActionButton>
          )}
        </View>
      </SafeArea>
    </Modal>
  )
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    flex: 1,
    gap: 28,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  progressFill: {
    borderRadius: 999,
    height: "100%",
  },
  progressTrack: {
    borderRadius: 999,
    height: 8,
    overflow: "hidden",
    width: "100%",
  },
})
