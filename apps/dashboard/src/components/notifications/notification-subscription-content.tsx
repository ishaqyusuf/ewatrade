"use client"

import { formatRole } from "@/components/activity/activity-format"
import type {
  BusinessEventCatalogItem,
  BusinessEventType,
  BusinessNotificationScope,
  BusinessNotificationSubscriptionView,
} from "@ewatrade/notifications/business-events"
import { Button, Checkbox, CheckboxField } from "@ewatrade/ui"
import { useState } from "react"

export type AlertMember = {
  membershipId: string
  name: string
  role: string | null
  /** Only ACTIVE members can receive new alert types. */
  active: boolean
}

const BLOCKED_REASONS: Record<
  NonNullable<BusinessNotificationSubscriptionView["blockedReason"]>,
  string
> = {
  needs_finance_access: "Needs Finance access",
  needs_staff_management: "Needs staff management access",
  outside_store_scope: "Outside the Stores they can access",
  inactive_membership: "Not an active member",
  unsupported_type: "Not available as an alert",
  policy_disabled: "Turned off for the Business",
  subscription_disabled: "Assignment turned off",
  preference_disabled: "They turned this alert off",
}

export function blockedReasonLabel(
  reason: BusinessNotificationSubscriptionView["blockedReason"],
) {
  return reason ? BLOCKED_REASONS[reason] : null
}

export type MemberAlertsDraft = {
  scope: BusinessNotificationScope
  types: BusinessEventType[]
}

function scopeLabel(
  scope: BusinessNotificationScope,
  stores: Array<{ id: string; name: string }>,
) {
  if (scope.kind === "business") return "Whole Business"
  if (scope.kind === "accessible_stores") return "All Stores they can access"
  return scope.storeIds
    .map((id) => stores.find((store) => store.id === id)?.name ?? "A Store")
    .join(", ")
}

/** Owner/Admin view of who gets which alerts; access is never granted here. */
export function NotificationSubscriptionContent({
  members,
  subscriptions,
  subscriptionsComplete,
  catalog,
  stores,
  onEdit,
}: {
  members: AlertMember[]
  subscriptions: BusinessNotificationSubscriptionView[]
  /** False while more assignment pages exist; summaries are then unknown. */
  subscriptionsComplete: boolean
  catalog: BusinessEventCatalogItem[]
  stores: Array<{ id: string; name: string }>
  onEdit: (member: AlertMember, trigger: HTMLButtonElement) => void
}) {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Pick which alert types each person can get. They only receive alerts for
        records their role and Stores already let them open.
      </p>
      <ul className="border-t">
        {members.map((member) => {
          const mine = subscriptions.filter(
            (sub) => sub.membershipId === member.membershipId && sub.enabled,
          )
          const blocked = mine.filter((sub) => sub.blockedReason !== null)
          const first = mine[0]
          const known = subscriptionsComplete
          const canEdit = member.active || mine.length > 0 || !known
          return (
            <li
              key={member.membershipId}
              className="flex items-center gap-3 border-b py-3"
            >
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {member.name}
                  {member.role ? (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {formatRole(member.role)}
                    </span>
                  ) : null}
                  {member.active ? null : (
                    <span className="ml-2 bg-secondary px-1.5 text-xs font-normal">
                      Inactive
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  {!known && !mine.length
                    ? "Assignments not loaded yet"
                    : mine.length
                      ? `${mine.length}${known ? "" : "+"} alert ${mine.length === 1 ? "type" : "types"} · ${first ? scopeLabel(first.scope, stores) : ""}`
                      : "No alerts assigned"}
                </p>
                {mine.length ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {mine
                      .map(
                        (sub) =>
                          catalog.find((entry) => entry.type === sub.type)
                            ?.label ?? sub.type,
                      )
                      .join(", ")}
                  </p>
                ) : null}
                {blocked.length ? (
                  <p className="text-xs text-muted-foreground">
                    Not delivered:{" "}
                    {[
                      ...new Set(
                        blocked.map((sub) =>
                          blockedReasonLabel(sub.blockedReason),
                        ),
                      ),
                    ].join(", ")}
                    .
                  </p>
                ) : null}
              </div>
              {canEdit ? (
                <Button
                  variant="outline"
                  onClick={(event) => onEdit(member, event.currentTarget)}
                >
                  {member.active ? "Edit" : "Remove alerts"}
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Edits one member's alert assignments from their own freshly read rows.
 * Inactive members can only have existing assignments turned off.
 */
export function MemberAlertsEditor({
  member,
  subscriptions,
  catalog,
  stores,
  saving,
  error,
  onSave,
  onCancel,
}: {
  member: AlertMember
  /** This member's complete assignment rows, read for this editor. */
  subscriptions: BusinessNotificationSubscriptionView[]
  catalog: BusinessEventCatalogItem[]
  stores: Array<{ id: string; name: string }>
  saving: boolean
  error: string | null
  onSave: (draft: MemberAlertsDraft) => void
  onCancel: () => void
}) {
  const mine = subscriptions.filter(
    (sub) => sub.membershipId === member.membershipId,
  )
  const enabledTypes = mine.filter((sub) => sub.enabled).map((sub) => sub.type)
  const [draft, setDraft] = useState<MemberAlertsDraft>(() => ({
    scope: mine.find((sub) => sub.enabled)?.scope ?? {
      kind: "accessible_stores",
    },
    types: enabledTypes,
  }))
  const removeOnly = !member.active
  const selectable = catalog.filter(
    (entry) =>
      (entry.availability !== "planned" && entry.supports.inApp) ||
      enabledTypes.includes(entry.type),
  )
  const scopes: Array<{ value: string; label: string }> = [
    { value: "accessible_stores", label: "All Stores they can access" },
    ...stores.map((store) => ({
      value: `store:${store.id}`,
      label: `${store.name} only`,
    })),
  ]
  const scopeValue =
    draft.scope.kind === "stores"
      ? `store:${draft.scope.storeIds[0]}`
      : "accessible_stores"
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        onSave(draft)
      }}
    >
      <p className="text-sm text-muted-foreground">
        {removeOnly
          ? "This person isn't an active member, so alerts can only be turned off."
          : `${formatRole(member.role) || "Team member"}. Choosing an alert here doesn't change their access; alerts outside their access are not delivered.`}
      </p>
      {removeOnly ? null : (
        <fieldset className="grid gap-1">
          <legend className="pb-1.5 text-[13px] font-medium">Stores</legend>
          {scopes.map((scope) => (
            <label
              key={scope.value}
              className="flex min-h-10 items-center gap-2.5 text-sm"
            >
              <input
                type="radio"
                name="alert-scope"
                className="size-4 accent-primary"
                checked={scopeValue === scope.value}
                onChange={() =>
                  setDraft((current) => ({
                    ...current,
                    scope: scope.value.startsWith("store:")
                      ? {
                          kind: "stores",
                          storeIds: [scope.value.slice("store:".length)],
                        }
                      : { kind: "accessible_stores" },
                  }))
                }
              />
              {scope.label}
            </label>
          ))}
        </fieldset>
      )}
      <fieldset className="grid gap-1">
        <legend className="pb-1.5 text-[13px] font-medium">Alert types</legend>
        {selectable.length ? null : (
          <p className="text-sm text-muted-foreground">
            No alert types are available to assign yet.
          </p>
        )}
        {selectable.map((entry) => {
          const existing = mine.find((sub) => sub.type === entry.type)
          const blocked = existing?.enabled
            ? blockedReasonLabel(existing.blockedReason)
            : null
          const checked = draft.types.includes(entry.type)
          return (
            <CheckboxField
              key={entry.type}
              className="py-1.5"
              label={entry.label}
              description={
                blocked ? `Not delivered: ${blocked}.` : entry.description
              }
            >
              <Checkbox
                checked={checked}
                disabled={removeOnly && !checked}
                onCheckedChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    types: value
                      ? [...current.types, entry.type]
                      : current.types.filter((type) => type !== entry.type),
                  }))
                }
              />
            </CheckboxField>
          )
        })}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Email alerts aren't available yet.
      </p>
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
