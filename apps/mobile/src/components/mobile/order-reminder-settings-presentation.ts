export type ReminderSettingsValue = {
  dayBeforeEnabled: boolean
  enabled: boolean
  sameDayEnabled: boolean
}

export const REMINDER_SETTINGS_COPY = {
  loadError:
    "Reminder settings could not be loaded. Check your connection and try again.",
  saveError:
    "Reminder settings could not be saved. Check your connection and try again.",
} as const

export function canEditReminderSettings(input: {
  hasData: boolean
  queryError: boolean
  savePending: boolean
}) {
  return input.hasData && !input.queryError && !input.savePending
}

export function toReminderSettingsValue(
  settings: ReminderSettingsValue,
): ReminderSettingsValue {
  return {
    dayBeforeEnabled: settings.dayBeforeEnabled,
    enabled: settings.enabled,
    sameDayEnabled: settings.sameDayEnabled,
  }
}

export function hasReminderSettingsChanges(
  current: ReminderSettingsValue,
  persisted: ReminderSettingsValue,
) {
  return (
    current.enabled !== persisted.enabled ||
    current.dayBeforeEnabled !== persisted.dayBeforeEnabled ||
    current.sameDayEnabled !== persisted.sameDayEnabled
  )
}
