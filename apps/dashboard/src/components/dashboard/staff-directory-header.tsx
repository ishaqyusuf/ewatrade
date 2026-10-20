"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { SearchFilter } from "@/components/search-filter"
import { TableToolbarSlot } from "@/components/tables/core"
import { ViewDropdown, type ViewOption } from "@/components/view-switcher"
import { useStaffDirectoryParams } from "@/hooks/use-staff-directory-params"
import { type StaffRoleFilter, getStaffRoleLabel } from "@/lib/staff-management"
import type { DirectoryView } from "@/utils/directory-view-settings"
import {
  Button,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@ewatrade/ui"
import {
  Add01Icon,
  GridViewIcon,
  LayoutTable01Icon,
  ListViewIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

const roles: StaffRoleFilter[] = [
  "owner",
  "admin",
  "manager",
  "cashier",
  "operator",
]
// The saved value stays "cards" so existing view cookies keep working.
const staffViewOptions = [
  { value: "table", label: "Table", icon: LayoutTable01Icon },
  { value: "list", label: "List", icon: ListViewIcon },
  { value: "cards", label: "Grid", icon: GridViewIcon },
] as const satisfies readonly ViewOption<DirectoryView>[]

export function StaffDirectoryHeader({
  businessName,
  onInvite,
  view,
  onViewChange,
}: {
  businessName: string
  onInvite: () => void
  view: DirectoryView
  onViewChange: (view: DirectoryView) => void
}) {
  const { clearFilters, setParams, staffQuery, staffRole } =
    useStaffDirectoryParams()

  return (
    <PageHeader
      eyebrow={businessName}
      title="Staff"
      description="Invite staff and choose what they can do in each store."
    >
      <PageToolbar
        actions={
          <>
            <TableToolbarSlot />
            <ViewDropdown
              label="Staff view"
              value={view}
              options={staffViewOptions}
              onValueChange={onViewChange}
            />
            <Button
              type="button"
              className="rounded-none max-md:size-9 max-md:px-0"
              aria-label="Invite staff"
              onClick={onInvite}
            >
              <HugeiconsIcon
                icon={Add01Icon}
                data-icon="inline-start"
                className="size-4"
                aria-hidden="true"
              />
              <span className="max-md:sr-only">Invite staff</span>
            </Button>
          </>
        }
      >
        <SearchFilter
          mobileFilters={{
            groups: [
              {
                id: "role",
                label: "Role",
                allLabel: "All roles",
                options: roles.map((value) => ({
                  value,
                  label: getStaffRoleLabel(value),
                })),
              },
            ],
            values: {
              role: staffRole === "all" ? [] : [staffRole],
            },
            onApply: (draft) =>
              setParams({
                staffRole:
                  roles.find((value) => value === draft.role?.[0]) ?? null,
              }),
          }}
          placeholder="Search by name or email"
          value={staffQuery}
          onSearch={(value) => void setParams({ staffQuery: value || null })}
          onClear={clearFilters}
          filters={[
            ...(staffRole !== "all"
              ? [
                  {
                    id: "role",
                    label: getStaffRoleLabel(staffRole),
                    onRemove: () => void setParams({ staffRole: null }),
                  },
                ]
              : []),
          ]}
        >
          <DropdownMenuGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Role</DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                appearance="dashboard"
                className="min-w-40 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
                sideOffset={14}
                alignOffset={-4}
              >
                <DropdownMenuCheckboxItem
                  checked={staffRole === "all"}
                  closeOnClick={false}
                  onCheckedChange={() => void setParams({ staffRole: null })}
                >
                  All roles
                </DropdownMenuCheckboxItem>
                {roles.map((role) => (
                  <DropdownMenuCheckboxItem
                    key={role}
                    checked={staffRole === role}
                    closeOnClick={false}
                    onCheckedChange={(checked) =>
                      void setParams({ staffRole: checked ? role : null })
                    }
                  >
                    {getStaffRoleLabel(role)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
        </SearchFilter>
      </PageToolbar>
    </PageHeader>
  )
}
