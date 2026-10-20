"use client"

import { ACTIVITY_CATEGORY_LABELS } from "@/components/activity/activity-format"
import type {
  BusinessActivityCategory,
  BusinessEventCatalogItem,
  BusinessNotificationPolicyView,
} from "@ewatrade/notifications/business-events"
import { Button, Checkbox, CheckboxField } from "@ewatrade/ui"
import { useState } from "react"

/** Role templates the policy may target; the server rejects anything else. */
export const POLICY_ROLES = [
  { value: "OWNER", label: "Owners" },
  { value: "ADMIN", label: "Admins" },
  { value: "MANAGER", label: "Store managers" },
  { value: "CASHIER", label: "Cashiers" },
  { value: "OPERATOR", label: "Sales reps" },
] as const

export type PolicyDraft = {
  allowInApp: boolean
  defaultInApp: boolean
  recipientRoles: string[]
}

function roleLabels(roles: string[]) {
  return roles
    .map(
      (role) =>
        POLICY_ROLES.find((option) => option.value === role)?.label ?? role,
    )
    .join(", ")
}

function policySummary(policy: BusinessNotificationPolicyView | undefined) {
  if (!policy?.allowed.inApp) return "Off. Nobody gets it."
  if (!policy.defaults.inApp || !policy.recipientRoles.length)
    return "Goes only to people you add."
  const roles = roleLabels(policy.recipientRoles).toLowerCase()
  return `Goes to ${roles.replace(/, ([^,]*)$/, " and $1")} automatically.`
}

/**
 * Owner/Admin catalog policy. Alert settings never change Activity history; a
 * policy only
 * controls whether an alert type is sent, its default and who inherits it.
 * Unsupported methods are never toggles.
 */
export function NotificationPolicyContent({
  items,
  catalog,
  onEdit,
}: {
  items: BusinessNotificationPolicyView[]
  catalog: BusinessEventCatalogItem[]
  onEdit: (
    entry: BusinessEventCatalogItem,
    policy: BusinessNotificationPolicyView | undefined,
    trigger: HTMLButtonElement,
  ) => void
}) {
  // Planned types can't be configured yet; list them once, collapsed, instead
  // of a long run of unavailable rows.
  const planned = catalog.filter((entry) => entry.availability === "planned")
  const byCategory = new Map<
    BusinessActivityCategory,
    BusinessEventCatalogItem[]
  >()
  for (const entry of catalog) {
    if (entry.availability === "planned") continue
    const list = byCategory.get(entry.category) ?? []
    list.push(entry)
    byCategory.set(entry.category, list)
  }
  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        Alerts show in the dashboard. Email alerts aren't available yet.
      </p>
      {byCategory.size ? null : (
        <p className="border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No alerts are available yet. More are coming.
        </p>
      )}
      {[...byCategory].map(([category, entries]) => (
        <section key={category} aria-labelledby={`policy-${category}`}>
          <h3
            id={`policy-${category}`}
            className="border-b pb-2 text-[13px] font-medium"
          >
            {ACTIVITY_CATEGORY_LABELS[category]}
          </h3>
          <ul>
            {entries.map((entry) => {
              const policy = items.find((item) => item.type === entry.type)
              const editable =
                entry.availability !== "planned" && entry.supports.inApp
              return (
                <li
                  key={entry.type}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 border-b py-3"
                >
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{sentenceCase(entry.label)}</p>
                    <p className="text-muted-foreground">{entry.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {editable ? policySummary(policy) : "Not available yet."}
                    </p>
                  </div>
                  {editable ? (
                    <Button
                      variant="outline"
                      onClick={(event) =>
                        onEdit(entry, policy, event.currentTarget)
                      }
                    >
                      Edit
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {planned.length ? (
        <details className="border-t pt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {planned.length} more alert{planned.length === 1 ? " is" : "s are"}{" "}
            coming
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            These aren't available yet.
          </p>
          <ul className="mt-2 grid gap-1 text-[13px] text-muted-foreground sm:grid-cols-2">
            {planned.map((entry) => (
              <li key={entry.type}>
                {ACTIVITY_CATEGORY_LABELS[entry.category]} ·{" "}
                {sentenceCase(entry.label)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

function sentenceCase(label: string) {
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function PolicyEditor({
  entry,
  policy,
  saving,
  error,
  onSave,
  onCancel,
}: {
  entry: BusinessEventCatalogItem
  policy: BusinessNotificationPolicyView | undefined
  saving: boolean
  error: string | null
  onSave: (draft: PolicyDraft) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<PolicyDraft>(() => ({
    allowInApp: policy?.allowed.inApp ?? false,
    defaultInApp: policy?.defaults.inApp ?? false,
    recipientRoles: policy?.recipientRoles ?? [],
  }))
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        onSave(draft)
      }}
    >
      <p className="text-sm text-muted-foreground">{entry.description}</p>
      <CheckboxField
        label="Send this alert"
        description="Turn off to stop everyone getting it. Activity isn't changed."
      >
        <Checkbox
          checked={draft.allowInApp}
          onCheckedChange={(checked) =>
            setDraft((current) => ({
              ...current,
              allowInApp: Boolean(checked),
              defaultInApp: Boolean(checked) && current.defaultInApp,
            }))
          }
        />
      </CheckboxField>
      <CheckboxField
        label="Send it to these roles automatically"
        description="Other people only get it if you add them under Who gets them."
      >
        <Checkbox
          checked={draft.defaultInApp}
          disabled={!draft.allowInApp}
          onCheckedChange={(checked) =>
            setDraft((current) => ({
              ...current,
              defaultInApp: Boolean(checked),
            }))
          }
        />
      </CheckboxField>
      <fieldset className="grid gap-1" disabled={!draft.defaultInApp}>
        <legend className="pb-1.5 text-[13px] font-medium">
          Send it automatically to
        </legend>
        {POLICY_ROLES.map((role) => (
          <CheckboxField key={role.value} className="py-1" label={role.label}>
            <Checkbox
              checked={draft.recipientRoles.includes(role.value)}
              disabled={!draft.defaultInApp}
              onCheckedChange={(checked) =>
                setDraft((current) => ({
                  ...current,
                  recipientRoles: checked
                    ? [...current.recipientRoles, role.value]
                    : current.recipientRoles.filter(
                        (value) => value !== role.value,
                      ),
                }))
              }
            />
          </CheckboxField>
        ))}
        <p className="text-xs text-muted-foreground">
          This never gives anyone new access. People only get alerts for orders
          and stores they can already open.
        </p>
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
