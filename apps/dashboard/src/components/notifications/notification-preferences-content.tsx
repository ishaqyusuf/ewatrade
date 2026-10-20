"use client"

import type {
  BusinessEventCatalogItem,
  BusinessEventType,
  BusinessNotificationPreferenceView,
} from "@ewatrade/notifications/business-events"
import { Checkbox, CheckboxField } from "@ewatrade/ui"
import { Mail01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

/**
 * The signed-in member's own alert choices. Preferences can only narrow what
 * the Owner allowed; they never widen access or turn on unsupported methods.
 */
export function NotificationPreferencesContent({
  items,
  catalog,
  pendingType,
  onChange,
}: {
  items: BusinessNotificationPreferenceView[]
  catalog: BusinessEventCatalogItem[]
  pendingType: BusinessEventType | null
  onChange: (
    item: BusinessNotificationPreferenceView,
    inApp: "on" | "off",
  ) => void
}) {
  const label = (type: BusinessEventType) =>
    catalog.find((entry) => entry.type === type)
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Your business chooses which alerts you can get. Turn off any you don't
        want.
      </p>
      {items.length ? (
        <ul className="border-t">
          {items.map((item) => {
            const entry = label(item.type)
            const canInApp = item.supports.inApp && item.allowed.inApp
            return (
              <li
                key={item.type}
                className="grid items-center gap-3 border-b py-3"
              >
                {canInApp ? (
                  <CheckboxField
                    label={entry?.label ?? item.type}
                    description={entry?.description}
                  >
                    <Checkbox
                      checked={item.effective.inApp}
                      disabled={pendingType === item.type}
                      onCheckedChange={(checked) =>
                        onChange(item, checked ? "on" : "off")
                      }
                    />
                  </CheckboxField>
                ) : (
                  <div className="text-sm">
                    <p className="font-medium">{entry?.label ?? item.type}</p>
                    <p className="text-muted-foreground">
                      {item.supports.inApp
                        ? "Turned off by your business"
                        : "Not available yet"}
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No alerts are assigned to you yet.
        </p>
      )}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <HugeiconsIcon icon={Mail01Icon} className="size-4" />
        Email alerts aren't available yet. Nothing is emailed from here.
      </p>
      <p className="text-xs text-muted-foreground">
        Turning an alert off doesn't remove anything from Activity.
      </p>
    </div>
  )
}
