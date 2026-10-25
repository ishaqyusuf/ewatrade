import {
  ActionButton,
  StatusBanner,
  WorkflowModalScreen,
} from "@/components/mobile"
import {
  ListCard,
  SectionHeader,
  ToggleRow,
} from "@/components/mobile/green-till/kit"
import {
  REMINDER_SETTINGS_COPY,
  canEditReminderSettings,
  hasReminderSettingsChanges,
  toReminderSettingsValue,
} from "@/components/mobile/order-reminder-settings-presentation"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { SettingsScreen } from "@/components/mobile/settings-screen"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { ScrollView } from "react-native"

function ReminderSettingToggle({
  badge,
  checked,
  description,
  disabled,
  icon,
  label,
  onCheckedChange,
}: {
  badge?: string
  checked: boolean
  description: string
  disabled?: boolean
  icon: "Mail" | "Clock"
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <ToggleRow
      icon={{ name: icon, tint: icon === "Mail" ? "amber" : "sky" }}
      title={label}
      sub={description}
      value={checked}
      disabled={disabled}
      onValueChange={onCheckedChange}
    />
  )
}

export default function OrderReminderSettingsModalRoute() {
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const settings = useQuery(
    trpc.orders.reminderSettings.queryOptions(
      {},
      { retry: false, enabled: !offline },
    ),
  )
  const [enabled, setEnabled] = useState(() => settings.data?.enabled ?? false)
  const [dayBeforeEnabled, setDayBeforeEnabled] = useState(
    () => settings.data?.dayBeforeEnabled ?? false,
  )
  const [sameDayEnabled, setSameDayEnabled] = useState(
    () => settings.data?.sameDayEnabled ?? false,
  )
  const [saved, setSaved] = useState(false)
  const [qaSnapshot, setQaSnapshot] = useState<{
    dayBeforeEnabled: boolean
    enabled: boolean
    sameDayEnabled: boolean
  } | null>(null)

  const currentSettings = {
    dayBeforeEnabled,
    enabled,
    sameDayEnabled,
  }
  const persistedSettings = settings.data
    ? toReminderSettingsValue(settings.data)
    : null
  const isDirty = persistedSettings
    ? hasReminderSettingsChanges(currentSettings, persistedSettings)
    : false
  useEffect(() => {
    if (!settings.data) return
    setEnabled(settings.data.enabled)
    setDayBeforeEnabled(settings.data.dayBeforeEnabled)
    setSameDayEnabled(settings.data.sameDayEnabled)
  }, [settings.data])

  const updateSettings = useMutation(
    trpc.orders.updateReminderSettings.mutationOptions({
      onSuccess: (nextSettings) => {
        queryClient.setQueryData(
          trpc.orders.reminderSettings.queryKey({}),
          nextSettings,
        )
        setEnabled(nextSettings.enabled)
        setDayBeforeEnabled(nextSettings.dayBeforeEnabled)
        setSameDayEnabled(nextSettings.sameDayEnabled)
        setSaved(true)
      },
    }),
  )
  const canEditSettings =
    !offline &&
    canEditReminderSettings({
      hasData: !!settings.data,
      queryError: settings.isError,
      savePending: updateSettings.isPending,
    })

  function markChanged(action: () => void) {
    if (updateSettings.isPending) return
    action()
    setSaved(false)
    updateSettings.reset()
  }

  return (
    <WorkflowModalScreen
      closeHref="/admin-home"
      closeLabel="Close Order reminder settings"
      title="Order reminders"
    >
      <ScrollView
        contentContainerClassName="gap-4 px-[18px] pb-10"
        showsVerticalScrollIndicator={false}
      >
        <SettingsScreen
          label="Reminders"
          loading={settings.isPending && !offline}
          title={
            settings.data
              ? enabled
                ? "Reminders are on"
                : "Reminders are off"
              : "Reminders unavailable"
          }
          sub={
            offline
              ? "Reconnect to change reminder settings."
              : settings.data
                ? enabled
                  ? dayBeforeEnabled && sameDayEnabled
                    ? "One day before and on the delivery day"
                    : dayBeforeEnabled
                      ? "One day before delivery"
                      : sameDayEnabled
                        ? "On the delivery day"
                        : "Choose when to send reminders below."
                  : "No reminder emails will be sent."
                : "Your settings haven’t loaded yet."
          }
        />
        {settings.isError ? (
          <StatusBanner
            icon="AlertCircle"
            actionLabel={offline ? undefined : "Try again"}
            message={REMINDER_SETTINGS_COPY.loadError}
            onActionPress={() => void settings.refetch()}
            title="Could not load reminder settings"
            tone="destructive"
          />
        ) : null}
        {updateSettings.isError ? (
          <View className="mb-3">
            <StatusBanner
              icon="AlertCircle"
              message={REMINDER_SETTINGS_COPY.saveError}
              title="Settings were not saved"
              tone="destructive"
            />
          </View>
        ) : null}
        {saved ? (
          <View className="mb-3">
            <StatusBanner
              icon="CheckCircle2"
              message="The hourly reminder job will use these settings."
              title="Reminder settings saved"
              tone="success"
            />
          </View>
        ) : null}

        {settings.data ? (
          <>
            <View className="mb-3">
              <QaQuickFillButton
                canUndo={Boolean(qaSnapshot)}
                formId="mobile.order.reminder-settings"
                isDirty={isDirty}
                onFill={() => {
                  setQaSnapshot(currentSettings)
                  // A day-before-only pattern, unless that is already set, so the
                  // fill always produces a change to review and save.
                  const dayBeforeOnly =
                    enabled && dayBeforeEnabled && !sameDayEnabled
                  setEnabled(true)
                  setDayBeforeEnabled(true)
                  setSameDayEnabled(dayBeforeOnly)
                  setSaved(false)
                }}
                onUndo={() => {
                  if (!qaSnapshot) return
                  setEnabled(qaSnapshot.enabled)
                  setDayBeforeEnabled(qaSnapshot.dayBeforeEnabled)
                  setSameDayEnabled(qaSnapshot.sameDayEnabled)
                  setQaSnapshot(null)
                }}
              />
            </View>

            <SectionHeader title="Delivery" />
            <ListCard>
              <ReminderSettingToggle
                checked={enabled}
                description="To Owners, Admins and Managers"
                disabled={!canEditSettings}
                icon="Mail"
                label="Email reminders"
                onCheckedChange={(value) => {
                  markChanged(() => setEnabled(value))
                }}
              />
            </ListCard>

            <SectionHeader title="When to remind" />
            <ListCard>
              <ReminderSettingToggle
                badge="−1"
                checked={dayBeforeEnabled}
                description="On the previous day"
                disabled={!canEditSettings || !enabled}
                icon="Clock"
                label="One day before"
                onCheckedChange={(value) => {
                  markChanged(() => setDayBeforeEnabled(value))
                }}
              />
              <ReminderSettingToggle
                badge="0"
                checked={sameDayEnabled}
                description="On the delivery day"
                disabled={!canEditSettings || !enabled}
                icon="Clock"
                label="On the day"
                onCheckedChange={(value) => {
                  markChanged(() => setSameDayEnabled(value))
                }}
              />
            </ListCard>
          </>
        ) : settings.isFetching ? (
          <Skeleton className="h-40 rounded-[20px]" />
        ) : null}
        <View className="mt-4 flex-row items-start gap-2">
          <Icon className="mt-0.5 size-sm text-primary" name="Info" />
          <Text className="min-w-0 flex-1 text-xs [-rn-line-height:22] text-muted-foreground">
            Only unfulfilled orders for goods. A reminder never marks an order
            fulfilled.
          </Text>
        </View>

        <View className="mt-5">
          <ActionButton
            icon="Check"
            disabled={
              offline ||
              settings.isPending ||
              settings.isError ||
              updateSettings.isPending ||
              !isDirty
            }
            isLoading={updateSettings.isPending}
            loadingLabel="Saving settings"
            onPress={() => {
              if (!canEditSettings || !isDirty) return
              updateSettings.mutate(currentSettings)
            }}
          >
            Save reminders
          </ActionButton>
        </View>
      </ScrollView>
    </WorkflowModalScreen>
  )
}
