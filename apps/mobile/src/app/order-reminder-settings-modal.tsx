import {
  ActionButton,
  StatusBanner,
  WorkflowModalScreen,
} from "@/components/mobile"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { ScrollView } from "react-native"

function ReminderToggle({
  checked,
  description,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean
  description: string
  disabled?: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <View className="flex-row items-start gap-3 border-b border-border py-4">
      <Switch
        accessibilityLabel={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{label}</Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          {description}
        </Text>
      </View>
    </View>
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

  useEffect(() => {
    if (!settings.data) return
    setEnabled(settings.data.enabled)
    setDayBeforeEnabled(settings.data.dayBeforeEnabled)
    setSameDayEnabled(settings.data.sameDayEnabled)
  }, [settings.data])

  const updateSettings = useMutation(
    trpc.orders.updateReminderSettings.mutationOptions({
      onSuccess: async () => {
        setSaved(true)
        await queryClient.invalidateQueries(
          trpc.orders.reminderSettings.queryFilter(),
        )
      },
    }),
  )

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
          Email Owners, Admins, and Managers when an unfulfilled Product Order
          is approaching its scheduled delivery time.
        </Text>

        {settings.isError ? (
          <StatusBanner
            icon="AlertCircle"
            message={settings.error.message}
            onActionPress={() => void settings.refetch()}
            title="Could not load reminder settings"
            tone="destructive"
          />
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

        <View className="rounded-2xl border border-border bg-card px-4">
          <ReminderToggle
            checked={enabled}
            description="Turn all Commercial Order delivery reminder emails on or off for this Store."
            label="Email delivery reminders"
            onCheckedChange={(value) => {
              setEnabled(value)
              setSaved(false)
            }}
          />
          <ReminderToggle
            checked={dayBeforeEnabled}
            description="Send one reminder on the calendar day before delivery."
            disabled={!enabled}
            label="One day before"
            onCheckedChange={(value) => {
              setDayBeforeEnabled(value)
              setSaved(false)
            }}
          />
          <ReminderToggle
            checked={sameDayEnabled}
            description="Send one reminder on the scheduled delivery day."
            disabled={!enabled}
            label="Same day"
            onCheckedChange={(value) => {
              setSameDayEnabled(value)
              setSaved(false)
            }}
          />
        </View>

        <View className="mt-6">
          <ActionButton
            disabled={settings.isPending || settings.isError}
            isLoading={updateSettings.isPending}
            loadingLabel="Saving settings"
            onPress={() =>
              updateSettings.mutate({
                dayBeforeEnabled,
                enabled,
                sameDayEnabled,
              })
            }
          >
            Save reminder settings
          </ActionButton>
        </View>
      </ScrollView>
    </WorkflowModalScreen>
  )
}
