"use client"

import { FilterPills } from "@/components/inventory/filter-pills"
import { StaffInviteModal } from "@/components/modals/staff-invite-modal"
import { PageFab } from "@/components/page-fab/page-fab"
import { ScrollableContent } from "@/components/scrollable-content"
import { SearchField } from "@/components/search-field"
import { OrderVisibilityLine } from "@/components/staff/order-visibility-line"
import { StaffList } from "@/components/staff/staff-list"
import { useStaffDirectoryParams } from "@/hooks/use-staff-directory-params"
import { useStaffList } from "@/hooks/use-staff-list"
import { useStaffMemberParams } from "@/hooks/use-staff-member-params"
import { useStaffParams } from "@/hooks/use-staff-params"
import {
  type StaffMemberRow,
  type StaffStatusFilter,
  filterStaffRows,
  getStaffStatusKey,
} from "@/lib/staff-management"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMemo, useState } from "react"

const STATUS_FILTERS: Array<{ id: StaffStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "invited", label: "Invited" },
  { id: "suspended", label: "Suspended" },
]

function matchesStatus(member: StaffMemberRow, status: StaffStatusFilter) {
  if (status === "all") return true
  const key = getStaffStatusKey(member)
  return status === "invited"
    ? key === "invited" || key === "expired" || key === "cancelled"
    : key === status
}

/** Owners first, then everyone else A to Z. */
function byRoleThenName(a: StaffMemberRow, b: StaffMemberRow) {
  const lead = (row: StaffMemberRow) =>
    ["OWNER", "ADMIN"].includes(row.role.toUpperCase()) ? 0 : 1
  return (
    lead(a) - lead(b) ||
    (a.user.displayName || a.user.name || a.user.email).localeCompare(
      b.user.displayName || b.user.name || b.user.email,
    )
  )
}

export function StaffPage({
  businessName,
  canManageAccess,
  canOpenMember,
  initialStaff,
  store,
  stores,
  storeAccessReady,
}: {
  businessName: string
  /** Owners and admins: invite, order rule, store access and history. */
  canManageAccess: boolean
  canOpenMember: boolean
  initialStaff: StaffMemberRow[]
  store: { id: string; name: string }
  stores: Array<{ id: string; name: string }>
  storeAccessReady: boolean
}) {
  const { setInviteOpen } = useStaffParams()
  const member = useStaffMemberParams()
  const { setParams, staffQuery, staffStatus } = useStaffDirectoryParams()
  const list = useStaffList(initialStaff)
  const staff = list.data
  const [notice, setNotice] = useState<string | null>(null)
  const [qaInviteUrl, setQaInviteUrl] = useState<string | null>(null)

  const searched = useMemo(
    () => filterStaffRows(staff, { search: staffQuery }).sort(byRoleThenName),
    [staff, staffQuery],
  )
  const counts = useMemo(
    () =>
      Object.fromEntries(
        STATUS_FILTERS.map((option) => [
          option.id,
          staff.filter((row) => matchesStatus(row, option.id)).length,
        ]),
      ) as Record<StaffStatusFilter, number>,
    [staff],
  )
  // Only filters that have someone in them (plus the one in the URL).
  const filters = STATUS_FILTERS.filter(
    (option) =>
      option.id === "all" || option.id === staffStatus || counts[option.id],
  ).map((option) => ({
    id: option.id,
    label: `${option.label} ${counts[option.id]}`,
  }))
  const rows = searched.filter((row) => matchesStatus(row, staffStatus))

  function openInvite() {
    setNotice(null)
    setQaInviteUrl(null)
    void setInviteOpen(true)
  }

  async function onInvited(contact: string, inviteUrl: string | null) {
    setQaInviteUrl(inviteUrl)
    setNotice(`Invite sent to ${contact}.`)
    await list.refetch()
  }

  return (
    <ScrollableContent>
      <div className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pb-24 sm:pb-8">
        <div className="flex min-w-0 items-center gap-3">
          <SearchField
            className="min-w-0 flex-1 sm:max-w-[420px]"
            placeholder="Search name or email"
            value={staffQuery}
            onSearch={(value) =>
              void setParams({ staffQuery: value.trim() || null })
            }
          />
          {canManageAccess ? (
            <>
              <Button onClick={openInvite} className="ml-auto max-sm:hidden">
                <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
                Invite staff
              </Button>
              <PageFab label="Invite staff" onClick={openInvite} />
            </>
          ) : null}
        </div>

        {filters.length > 2 ? (
          <FilterPills
            label="Show"
            options={filters}
            value={staffStatus}
            onChange={(next) =>
              void setParams({ staffStatus: next === "all" ? null : next })
            }
          />
        ) : null}

        {list.isError ? (
          <Alert appearance="dashboard" variant="destructive" role="alert">
            <AlertDescription>Couldn’t load staff. Try again.</AlertDescription>
            <Button variant="outline" onClick={() => void list.refetch()}>
              Try again
            </Button>
          </Alert>
        ) : null}

        {notice ? (
          <output
            aria-live="polite"
            className="flex items-center justify-between gap-3 rounded-[var(--ui-radius-item)] border border-border bg-card px-4 py-3 text-sm"
          >
            {notice}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Dismiss"
              onClick={() => setNotice(null)}
            >
              <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
            </Button>
          </output>
        ) : null}

        {qaInviteUrl ? (
          <QaInviteLink
            url={qaInviteUrl}
            onCopied={(text) => setNotice(text)}
          />
        ) : null}

        {rows.length ? (
          <StaffList
            rows={rows}
            onOpen={
              canOpenMember
                ? (target) => void member.open(target.id)
                : undefined
            }
          />
        ) : (
          <div className="grid justify-items-center gap-3 rounded-[var(--ui-radius-surface)] border border-border bg-card px-4 py-10 text-center">
            <p className="text-base">
              {staffQuery ? `No one matches “${staffQuery}”.` : "No one here."}
            </p>
            {staffQuery || staffStatus !== "all" ? (
              <Button
                variant="outline"
                onClick={() =>
                  void setParams({ staffQuery: null, staffStatus: null })
                }
              >
                Show everyone
              </Button>
            ) : null}
          </div>
        )}

        {canManageAccess ? (
          <OrderVisibilityLine storeId={store.id} storeName={store.name} />
        ) : null}

        {canManageAccess ? (
          <StaffInviteModal
            businessName={businessName}
            storeId={store.id}
            stores={stores}
            storeAccessReady={storeAccessReady}
            onInvited={onInvited}
          />
        ) : null}
      </div>
    </ScrollableContent>
  )
}

/** QA businesses only: open the invite link here instead of checking email. */
function QaInviteLink({
  url,
  onCopied,
}: {
  url: string
  onCopied: (text: string) => void
}) {
  return (
    <div className="grid gap-3 rounded-[var(--ui-radius-item)] border border-border bg-card p-4">
      <p className="text-sm font-medium">QA invite link</p>
      <a
        href={url}
        className="text-sm break-all underline"
        target="_blank"
        rel="noreferrer"
      >
        {url}
      </a>
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        onClick={() => {
          void navigator.clipboard
            .writeText(url)
            .then(() => onCopied("Invite link copied."))
            .catch(() => onCopied("Select and copy the invite link above."))
        }}
      >
        Copy link
      </Button>
    </div>
  )
}
