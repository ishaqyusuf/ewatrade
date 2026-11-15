"use client"

import {
  type StaffInviteRole,
  getStaffRoleLabel,
  staffRoleDescriptions,
} from "@/lib/staff-management"
import {
  Button,
  Checkbox,
  Field,
  FieldLabel,
  SelectControl,
  cn,
} from "@ewatrade/ui"
import { useId } from "react"

const STORE_ROLES: StaffInviteRole[] = ["cashier", "operator", "manager"]
const roleLabel = (role: StaffInviteRole) =>
  getStaffRoleLabel(role.toUpperCase())

export type StaffRolePickerValue = {
  /** The one role used in every chosen store (also the default for new rows). */
  role: StaffInviteRole
  storeIds: string[]
  startStoreId: string | null
  catalogEditor: boolean
  /** Set when the person has a different role in each store. */
  storeRoles: Record<string, StaffInviteRole> | null
}

/** Store and role pairs to save, with the starting store first. */
export function pickerAssignments(value: StaffRolePickerValue) {
  const ordered = [
    ...(value.startStoreId && value.storeIds.includes(value.startStoreId)
      ? [value.startStoreId]
      : []),
    ...value.storeIds.filter((id) => id !== value.startStoreId),
  ]
  return ordered.map((storeId) => ({
    storeId,
    role: value.storeRoles?.[storeId] ?? value.role,
  }))
}

export function pickerHasManager(value: StaffRolePickerValue) {
  return pickerAssignments(value).some((row) => row.role === "manager")
}

/**
 * One role for every chosen store, then the stores and where they start.
 * "Use a different role in each store" switches to a role per store.
 */
export function StaffRolePicker({
  value,
  stores,
  disabled,
  onChange,
}: {
  value: StaffRolePickerValue
  stores: Array<{ id: string; name: string }>
  disabled?: boolean
  onChange: (value: StaffRolePickerValue) => void
}) {
  const id = useId()
  const perStore = value.storeRoles !== null
  const chosen = stores.filter((store) => value.storeIds.includes(store.id))
  function toggleStore(storeId: string, checked: boolean) {
    const storeIds = checked
      ? [...value.storeIds, storeId]
      : value.storeIds.filter((current) => current !== storeId)
    onChange({
      ...value,
      storeIds,
      startStoreId:
        value.startStoreId && storeIds.includes(value.startStoreId)
          ? value.startStoreId
          : (storeIds[0] ?? null),
      storeRoles:
        value.storeRoles && checked
          ? { ...value.storeRoles, [storeId]: value.role }
          : value.storeRoles,
    })
  }
  function setPerStore(on: boolean) {
    if (on)
      onChange({
        ...value,
        storeRoles: Object.fromEntries(
          value.storeIds.map((storeId) => [storeId, value.role]),
        ),
      })
    else {
      const first = pickerAssignments(value)[0]
      onChange({ ...value, role: first?.role ?? value.role, storeRoles: null })
    }
  }
  const switchLink =
    stores.length > 1 ? (
      <Button
        type="button"
        variant="link"
        className="h-11 justify-self-start px-0"
        disabled={disabled}
        onClick={() => setPerStore(!perStore)}
      >
        {perStore
          ? "Use the same role in every store"
          : "Use a different role in each store"}
      </Button>
    ) : null
  const rowClass =
    "flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--ui-radius-item)] border border-border px-3 py-2.5 text-base"

  return (
    <div className="grid gap-5">
      {perStore ? (
        <fieldset className="grid gap-2" disabled={disabled}>
          <legend className="mb-2 text-sm font-medium">Stores and roles</legend>
          {stores.map((store) => {
            const checked = value.storeIds.includes(store.id)
            return (
              <div
                key={store.id}
                className="grid grid-cols-[minmax(0,1fr)_9.5rem] items-center gap-3"
              >
                <label
                  className="flex min-h-11 items-center gap-3 text-base"
                  htmlFor={`${id}-store-${store.id}`}
                >
                  <Checkbox
                    id={`${id}-store-${store.id}`}
                    checked={checked}
                    onCheckedChange={(next) =>
                      toggleStore(store.id, next === true)
                    }
                  />
                  <span className="min-w-0 truncate">{store.name}</span>
                </label>
                <SelectControl
                  aria-label={`Role in ${store.name}`}
                  value={value.storeRoles?.[store.id] ?? value.role}
                  disabled={!checked || disabled}
                  options={STORE_ROLES.map((role) => ({
                    value: role,
                    label: roleLabel(role),
                  }))}
                  onValueChange={(role) =>
                    onChange({
                      ...value,
                      storeRoles: {
                        ...value.storeRoles,
                        [store.id]: role as StaffInviteRole,
                      },
                    })
                  }
                />
              </div>
            )
          })}
          {switchLink}
        </fieldset>
      ) : (
        <>
          <fieldset className="grid gap-2" disabled={disabled}>
            <legend className="mb-2 text-sm font-medium">Role</legend>
            {STORE_ROLES.map((role) => {
              const checked = value.role === role
              return (
                <label
                  key={role}
                  className={cn(
                    rowClass,
                    checked && "border-foreground ring-1 ring-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-role`}
                    value={role}
                    checked={checked}
                    className="size-4 shrink-0 accent-[var(--foreground)]"
                    onChange={() => onChange({ ...value, role })}
                  />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="font-medium">{roleLabel(role)}</span>
                    <span className="text-sm text-muted-foreground">
                      {staffRoleDescriptions[role.toUpperCase()]}
                    </span>
                  </span>
                </label>
              )
            })}
          </fieldset>
          {stores.length > 1 ? (
            <fieldset className="grid gap-2" disabled={disabled}>
              <legend className="mb-2 text-sm font-medium">Stores</legend>
              {stores.map((store) => (
                <label
                  key={store.id}
                  className={rowClass}
                  htmlFor={`${id}-store-${store.id}`}
                >
                  <Checkbox
                    id={`${id}-store-${store.id}`}
                    checked={value.storeIds.includes(store.id)}
                    onCheckedChange={(checked) =>
                      toggleStore(store.id, checked === true)
                    }
                  />
                  <span className="min-w-0 truncate">{store.name}</span>
                </label>
              ))}
              {switchLink}
            </fieldset>
          ) : null}
        </>
      )}
      {chosen.length > 1 ? (
        <Field>
          <FieldLabel htmlFor={`${id}-start`}>Starts in</FieldLabel>
          <SelectControl
            id={`${id}-start`}
            value={value.startStoreId ?? ""}
            options={chosen.map((store) => ({
              value: store.id,
              label: store.name,
            }))}
            onValueChange={(startStoreId) =>
              onChange({ ...value, startStoreId })
            }
          />
        </Field>
      ) : null}
      {pickerHasManager(value) ? (
        <label className={rowClass} htmlFor={`${id}-catalog`}>
          <Checkbox
            id={`${id}-catalog`}
            checked={value.catalogEditor}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange({ ...value, catalogEditor: checked === true })
            }
          />
          Can change items and prices
        </label>
      ) : null}
    </div>
  )
}
