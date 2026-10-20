"use client"

import {
  type StaffInviteRole,
  getStaffRoleLabel,
  staffRoleDescriptions,
} from "@/lib/staff-management"
import { Checkbox, Field, FieldLabel, SelectControl, cn } from "@ewatrade/ui"
import { useId } from "react"

const STORE_ROLES: StaffInviteRole[] = ["cashier", "operator", "manager"]

export type StaffRolePickerValue = {
  role: StaffInviteRole
  storeIds: string[]
  startStoreId: string | null
  catalogEditor: boolean
}

/** One role for every chosen store, then the stores and where they start. */
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
    })
  }
  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-2" disabled={disabled}>
        <legend className="mb-2 text-sm font-medium">Role</legend>
        {STORE_ROLES.map((role) => {
          const checked = value.role === role
          return (
            <label
              key={role}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 border px-3 py-2.5 text-sm",
                checked && "border-primary bg-primary/5 ring-1 ring-primary",
              )}
            >
              <input
                type="radio"
                name={`${id}-role`}
                value={role}
                checked={checked}
                className="mt-0.5 accent-primary"
                onChange={() => onChange({ ...value, role })}
              />
              <span className="grid gap-0.5">
                <span className="font-medium">
                  {getStaffRoleLabel(role.toUpperCase())}
                </span>
                <span className="text-muted-foreground">
                  {staffRoleDescriptions[role.toUpperCase()]}
                </span>
              </span>
            </label>
          )
        })}
      </fieldset>
      <fieldset className="grid gap-3" disabled={disabled}>
        <legend className="mb-2 text-sm font-medium">Stores</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {stores.map((store) => (
            <label
              key={store.id}
              className="flex items-center gap-2 text-sm"
              htmlFor={`${id}-store-${store.id}`}
            >
              <Checkbox
                id={`${id}-store-${store.id}`}
                checked={value.storeIds.includes(store.id)}
                onCheckedChange={(checked) =>
                  toggleStore(store.id, checked === true)
                }
              />
              {store.name}
            </label>
          ))}
        </div>
        {chosen.length > 1 ? (
          <Field className="max-w-sm">
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
        <p className="text-sm text-muted-foreground">
          Same role in each store.
        </p>
      </fieldset>
      {value.role === "manager" ? (
        <label
          className="flex items-start gap-2.5 text-sm"
          htmlFor={`${id}-catalog`}
        >
          <Checkbox
            id={`${id}-catalog`}
            checked={value.catalogEditor}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange({ ...value, catalogEditor: checked === true })
            }
          />
          <span className="grid gap-0.5">
            Can edit Products and prices
            <span className="text-muted-foreground">
              Changes apply to every store.
            </span>
          </span>
        </label>
      ) : null}
    </div>
  )
}
