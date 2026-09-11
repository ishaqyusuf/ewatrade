import {
  ActionButton,
  StatusBanner,
  WorkflowModalScreen,
} from "@/components/mobile"
import {
  REMINDER_SETTINGS_COPY,
  canEditReminderSettings,
  hasReminderSettingsChanges,
  toReminderSettingsValue,
} from "@/components/mobile/order-reminder-settings-presentation"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { ScrollView } from "react-native"

function ReminderSettingToggle({
  badge,
  checked,
  description,
  disabled,
  label,
  onCheckedChange,
}: {
  badge?: string
  checked: boolean
  description: string
  disabled?: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  const colors = useColors()
  const trackStyle = {
    backgroundColor: checked ? colors.primary : colors.input,
    borderRadius: 999,
    height: 28,
    padding: 3,
    width: 48,
  }

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled: !!disabled }}
      className="min-h-[88px] flex-row items-center gap-3 border-t border-border py-3 disabled:opacity-50"
      disabled={disabled}
      haptic
      onPress={() => onCheckedChange(!checked)}
      transition
    >
      {badge ? (
        <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
          <Text className="text-sm font-extrabold text-primary">{badge}</Text>
        </View>
      ) : null}
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{label}</Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          {description}
        </Text>
      </View>
      <View pointerEvents="none" style={trackStyle}>
        <View
          style={{
            backgroundColor: checked
              ? colors.primaryForeground
              : colors.background,
            borderRadius: 999,
            height: 22,
            transform: [{ translateX: checked ? 20 : 0 }],
            width: 22,
          }}
        />
      </View>
    </Pressable>
  )
}

export default function OrderReminderSettingsModalRoute() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const settings = useQuery(
    trpc.orders.reminderSettings.queryOptions({}, { retry: false }),
  )
  const [enabled, setEnabled] = useState(true)
  const [dayBeforeEnabled, setDayBeforeEnabled] = useState(true)
  const [sameDayEnabled, setSameDayEnabled] = useState(true)
  const [saved, setSaved] = useState(false)
  const qaSnapshot = useRef<{
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
  const canEditSettings = canEditReminderSettings({
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
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="mb-5 text-sm leading-6 text-muted-foreground">
          Keep the team ahead of scheduled product deliveries.
        </Text>

        {settings.isError ? (
          <StatusBanner
            icon="AlertCircle"
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

        <View className="mb-3">
          <QaQuickFillButton
            canUndo={Boolean(qaSnapshot.current)}
            formId="mobile.order.reminder-settings"
            isDirty={isDirty}
            onFill={() => {
              qaSnapshot.current = currentSettings
              setEnabled(true)
              setDayBeforeEnabled(true)
              setSameDayEnabled(true)
              setSaved(false)
            }}
            onUndo={() => {
              const snapshot = qaSnapshot.current
              if (!snapshot) return
              setEnabled(snapshot.enabled)
              setDayBeforeEnabled(snapshot.dayBeforeEnabled)
              setSameDayEnabled(snapshot.sameDayEnabled)
              qaSnapshot.current = null
            }}
          />
        </View>

        <Text className="mb-2 mt-1 text-xs font-extrabold tracking-[1.4px] text-muted-foreground">
          REMINDER DELIVERY
        </Text>
        <View className="border-b border-border">
          <ReminderSettingToggle
            checked={enabled}
            description="Notify Owners, Admins, and Managers."
            disabled={!canEditSettings}
            label="Email reminders"
            onCheckedChange={(value) => {
              markChanged(() => setEnabled(value))
            }}
          />
        </View>

        <Text className="mb-2 mt-6 text-xs font-extrabold tracking-[1.4px] text-muted-foreground">
          SEND BEFORE DELIVERY
        </Text>
        <View className="border-b border-border">
          <ReminderSettingToggle
            badge="−1"
            checked={dayBeforeEnabled}
            description="On the previous calendar day."
            disabled={!canEditSettings || !enabled}
            label="One day before"
            onCheckedChange={(value) => {
              markChanged(() => setDayBeforeEnabled(value))
            }}
          />
          <ReminderSettingToggle
            badge="0"
            checked={sameDayEnabled}
            description="On the scheduled delivery day."
            disabled={!canEditSettings || !enabled}
            label="Same day"
            onCheckedChange={(value) => {
              markChanged(() => setSameDayEnabled(value))
            }}
          />
        </View>

        <View className="mt-4 flex-row items-start gap-2">
          <Icon className="mt-0.5 size-sm text-primary" name="Info" />
          <Text className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
            Only unfulfilled Product Orders are included. The hourly job never
            fulfills an order.
          </Text>
        </View>

        <View className="mt-5">
          <ActionButton
            disabled={
              settings.isPending ||
              settings.isError ||
              updateSettings.isPending ||
              !isDirty
            }
            isLoading={updateSettings.isPending}
            loadingLabel="Saving settings"
            onPress={() => {
              if (!isDirty) return
              updateSettings.mutate(currentSettings)
            }}
          >
            Save reminder settings
          </ActionButton>
        </View>
      </ScrollView>
    </WorkflowModalScreen>
  )
}
