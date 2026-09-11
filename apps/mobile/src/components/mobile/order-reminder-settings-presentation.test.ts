import { describe, expect, test } from "bun:test"

import {
  REMINDER_SETTINGS_COPY,
  canEditReminderSettings,
  hasReminderSettingsChanges,
  toReminderSettingsValue,
} from "./order-reminder-settings-presentation"

const persisted = {
  dayBeforeEnabled: true,
  enabled: true,
  sameDayEnabled: false,
  storeId: "store_1",
  updatedAt: new Date("2026-08-24T00:00:00.000Z"),
}

describe("order reminder settings presentation", () => {
  test("copies only the editable reminder fields from the API snapshot", () => {
    expect(toReminderSettingsValue(persisted)).toEqual({
      dayBeforeEnabled: true,
      enabled: true,
      sameDayEnabled: false,
    })
  })

  test("prevents an unchanged settings save", () => {
    expect(
      hasReminderSettingsChanges(
        toReminderSettingsValue(persisted),
        toReminderSettingsValue(persisted),
      ),
    ).toBe(false)
  })

  test("enables save when any reminder field changes", () => {
    expect(
      hasReminderSettingsChanges(
        { ...toReminderSettingsValue(persisted), sameDayEnabled: true },
        toReminderSettingsValue(persisted),
      ),
    ).toBe(true)
  })

  test("locks edits while a settings save is in flight", () => {
    expect(
      canEditReminderSettings({
        hasData: true,
        queryError: false,
        savePending: true,
      }),
    ).toBe(false)
    expect(
      canEditReminderSettings({
        hasData: true,
        queryError: false,
        savePending: false,
      }),
    ).toBe(true)
  })

  test("uses operator-safe load and save errors", () => {
    expect(REMINDER_SETTINGS_COPY.loadError).not.toContain("Zod")
    expect(REMINDER_SETTINGS_COPY.saveError).not.toContain("TRPC")
  })
})
