import { UpdatesProgress } from "@/components/mobile/updates/updates-controls"
import type { UpdatesPresentationProps } from "@/components/mobile/updates/updates-presentation"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import { ScrollView } from "react-native-css/components/ScrollView"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ActionButton } from "../../action-button"
import { HeroCard } from "../../green-till/hero-card"
import { ListCard, RecordRow, SectionHeader } from "../../green-till/kit"
import { StatusBanner } from "../../status-banner"

/** Pill for the hero, or none while nothing has been checked yet. */
function statusPill(status: string) {
  if (status === "Update ready" || status === "Rollback ready")
    return { label: "Downloaded", tone: "synced" as const }
  if (status === "Update found" || status === "Rollback available")
    return { label: "Available", tone: "draft" as const }
  if (status === "Checking" || status === "Downloading")
    return { label: status, tone: "busy" as const }
  if (status === "Update paused")
    return { label: "Paused", tone: "offline" as const }
  if (status === "No update pending")
    return { label: "Up to date", tone: "synced" as const }
  return undefined
}

export function ClassicUpdatesScreen(model: UpdatesPresentationProps) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const info = (label: string) => {
    const value = model.info.find((row) => row.label === label)?.value?.trim()
    return value && value !== "Not set" ? value : undefined
  }
  const runtime = info("Runtime") ?? "not set"
  const busy = model.checking || model.downloading || model.restarting
  const action = model.canRestart
    ? {
        icon: "RotateCw" as const,
        label: "Restart now",
        loading: model.restarting,
        onPress: model.onRestart,
      }
    : model.canDownload
      ? {
          icon: "Download" as const,
          label: "Download update",
          loading: model.downloading,
          onPress: model.onDownload,
        }
      : {
          icon: "RefreshCw" as const,
          label: "Check for update",
          loading: model.checking,
          onPress: model.onCheck,
        }
  return (
    <VariableContextProvider
      value={{
        "--updates-top": insets.top,
        "--updates-bottom": insets.bottom + 12,
      }}
    >
      <View className="flex-1 bg-background pt-[var(--updates-top)]">
        <StatusBar
          backgroundColor={colors.background}
          style={colorScheme === "dark" ? "light" : "dark"}
        />
        {/* Green Till bar: round back button, centred title, spacer. */}
        <View className="flex-row items-center gap-2.5 px-4 pb-3.5 pt-2">
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full bg-card shadow-sm active:bg-accent"
            haptic
            onPress={model.onBack}
          >
            <Icon
              className="size-[20px]"
              color={colors.foreground}
              name="ChevronLeft"
            />
          </Pressable>
          <Text
            accessibilityRole="header"
            className="min-w-0 flex-1 text-center text-base font-extrabold tracking-tight text-foreground"
          >
            App updates
          </Text>
          <View className="size-11" />
        </View>
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 px-[18px] pb-6"
        >
          <HeroCard
            label={`This app · version ${info("App version") ?? "unknown"}`}
            pill={statusPill(model.status)}
            title={model.status}
            sub={model.message}
          >
            {model.downloading ? (
              <View className="mt-4">
                <UpdatesProgress progress={model.progress} />
              </View>
            ) : null}
          </HeroCard>
          {model.errorMessage ? (
            <StatusBanner
              icon="AlertCircle"
              message={model.errorMessage}
              title="Update did not finish"
              tone="destructive"
            />
          ) : null}
          <View>
            <SectionHeader title="How updates work" />
            <ListCard>
              <RecordRow
                title="Checks when you open the app"
                meta="Small fixes download in the background"
                avatar={{ icon: "RefreshCw", tint: "sky" }}
              />
              <RecordRow
                title="Your data stays put"
                meta="Restarting doesn’t sign you out or lose sales"
                avatar={{ icon: "ShieldCheck", tint: "mint" }}
              />
            </ListCard>
          </View>
          <View>
            <SectionHeader title="Details for support" />
            <ListCard>
              <RecordRow
                title="Running"
                meta={[
                  info("Running"),
                  info("Update ID") === "Embedded build"
                    ? undefined
                    : info("Update ID"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                amount={info("Created") ?? "Unknown"}
                avatar={{ icon: "Info", tint: "lilac" }}
              />
              <RecordRow
                title="Last check"
                meta={`${info("Channel") ? `Channel ${info("Channel")} · ` : ""}runtime ${runtime.length > 12 ? `${runtime.slice(0, 8)}…` : runtime}`}
                amount={info("Last check") ?? "Not checked"}
                avatar={{ icon: "Clock", tint: "lilac" }}
              />
              {model.latestError ? (
                <RecordRow
                  title="Latest error"
                  meta={model.latestError}
                  avatar={{ icon: "AlertCircle", tint: "rose" }}
                />
              ) : null}
            </ListCard>
          </View>
        </ScrollView>
        {model.enabled ? (
          <View className="px-[18px] pb-[var(--updates-bottom)] pt-2">
            <ActionButton
              disabled={
                !(model.canCheck || model.canDownload || model.canRestart)
              }
              icon={action.icon}
              isLoading={action.loading || busy}
              onPress={action.onPress}
            >
              {action.label}
            </ActionButton>
          </View>
        ) : null}
      </View>
    </VariableContextProvider>
  )
}
