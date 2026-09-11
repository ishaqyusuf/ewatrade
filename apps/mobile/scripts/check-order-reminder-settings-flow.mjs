import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const contracts = [
  {
    file: "apps/mobile/src/app/order-reminder-settings-modal.tsx",
    markers: [
      "ReminderSettingToggle",
      "canEditReminderSettings",
      "hasReminderSettingsChanges",
      "queryClient.setQueryData",
      "REMINDER_SETTINGS_COPY.loadError",
      "REMINDER_SETTINGS_COPY.saveError",
      "trackStyle",
      "height: 28",
      "savePending: updateSettings.isPending",
      "width: 48",
    ],
    forbidden: [
      'from "@/components/ui/switch"',
      "settings.error.message",
      "updateSettings.error.message",
      "invalidateQueries",
    ],
    reason:
      "the workflow must expose visible accessible toggles, safe errors, dirty-state saves, and no post-save refetch",
  },
  {
    file: "apps/api/src/trpc/routers/orders.ts",
    markers: [
      "reminderSettings: protectedProcedure",
      "updateReminderSettings: protectedProcedure",
      "assertCanManageOrderReminders",
    ],
    forbidden: [],
    reason:
      "reminder reads and writes must remain restricted to authorized Store leadership",
  },
]

const failures = []
for (const contract of contracts) {
  const filePath = join(REPO_ROOT, contract.file)
  const source = readFileSync(filePath, "utf8")
  const missing = contract.markers.filter((marker) => !source.includes(marker))
  const presentForbidden = contract.forbidden.filter((marker) =>
    source.includes(marker),
  )
  if (missing.length > 0 || presentForbidden.length > 0) {
    failures.push({
      file: filePath,
      message: [
        missing.length > 0 ? `missing ${missing.join(", ")}` : null,
        presentForbidden.length > 0
          ? `contains ${presentForbidden.join(", ")}`
          : null,
        `(${contract.reason})`,
      ]
        .filter(Boolean)
        .join(" "),
    })
  }
}

if (failures.length > 0) {
  console.error("Order reminder settings flow check failed.")
  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }
  process.exit(1)
}

console.log("Order reminder settings flow check passed.")
