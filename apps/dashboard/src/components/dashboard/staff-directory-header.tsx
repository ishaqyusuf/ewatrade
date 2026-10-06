"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { SearchFilter } from "@/components/search-filter"
import { ViewSwitcher, directoryViewOptions } from "@/components/view-switcher"
import { useStaffDirectoryParams } from "@/hooks/use-staff-directory-params"
import {
  type StaffRoleFilter,
  type StaffStatusFilter,
  getStaffRoleLabel,
  getStaffStatusLabel,
} from "@/lib/staff-management"
import type { DirectoryView } from "@/utils/directory-view-settings"
import {
  Button,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@ewatrade/ui"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

const roles: StaffRoleFilter[] = [
  "owner",
  "admin",
  "manager",
  "cashier",
  "operator",
]
const statuses: StaffStatusFilter[] = ["active", "invited", "suspended"]

export function StaffDirectoryHeader({
  onInvite,
  storeName,
  view,
  onViewChange,
}: {
  onInvite: () => void
  storeName: string
  view: DirectoryView
  onViewChange: (view: DirectoryView) => void
}) {
  const { clearFilters, setParams, staffQuery, staffRole, staffStatus } =
    useStaffDirectoryParams()

  return (
    <PageHeader
      eyebrow={storeName}
      title="Staff management"
      description="Manage staff access and invitations for this store."
    >
      <PageToolbar
        actions={
          <>
            <ViewSwitcher
              label="Staff view"
              value={view}
              options={directoryViewOptions}
              onValueChange={onViewChange}
            />
            <Button
              aria-label="Invite staff"
              type="button"
              variant="outline"
              className="size-9 rounded-none"
              onClick={onInvite}
            >
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
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
              {
                id: "status",
                label: "Status",
                allLabel: "All statuses",
                options: statuses.map((value) => ({
                  value,
                  label: getStaffStatusLabel(value),
                })),
              },
            ],
            values: {
              role: staffRole === "all" ? [] : [staffRole],
              status: staffStatus === "all" ? [] : [staffStatus],
            },
            onApply: (draft) =>
              setParams({
                staffRole:
                  roles.find((value) => value === draft.role?.[0]) ?? null,
                staffStatus:
                  statuses.find((value) => value === draft.status?.[0]) ?? null,
              }),
          }}
          placeholder="Search staff..."
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
            ...(staffStatus !== "all"
              ? [
                  {
                    id: "status",
                    label: getStaffStatusLabel(staffStatus),
                    onRemove: () => void setParams({ staffStatus: null }),
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
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                appearance="dashboard"
                className="min-w-40 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
                sideOffset={14}
                alignOffset={-4}
              >
                <DropdownMenuCheckboxItem
                  checked={staffStatus === "all"}
                  closeOnClick={false}
                  onCheckedChange={() => void setParams({ staffStatus: null })}
                >
                  All statuses
                </DropdownMenuCheckboxItem>
                {statuses.map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={staffStatus === status}
                    closeOnClick={false}
                    onCheckedChange={(checked) =>
                      void setParams({ staffStatus: checked ? status : null })
                    }
                  >
                    {getStaffStatusLabel(status)}
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
