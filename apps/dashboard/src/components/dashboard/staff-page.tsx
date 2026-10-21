"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { StaffDirectoryHeader } from "@/components/dashboard/staff-directory-header"
import { StaffInviteModal } from "@/components/modals/staff-invite-modal"
import { ScrollableContent } from "@/components/scrollable-content"
import { OrderVisibilityLine } from "@/components/staff/order-visibility-line"
import { RemoveStaffAlert } from "@/components/staff/remove-staff-alert"
import { TableToolbarSlotProvider } from "@/components/tables/core"
import type { StaffRowActions } from "@/components/tables/staff/actions"
import { StaffDataTable } from "@/components/tables/staff/data-table"
import { useDirectoryView } from "@/hooks/use-directory-view"
import { useRemoveStaff } from "@/hooks/use-remove-staff"
import { useStaffDirectoryParams } from "@/hooks/use-staff-directory-params"
import { useStaffInvitationActions } from "@/hooks/use-staff-invitation-actions"
import { STAFF_LIST_QUERY_KEY, useStaffList } from "@/hooks/use-staff-list"
import { useStaffMemberParams } from "@/hooks/use-staff-member-params"
import { useStaffParams } from "@/hooks/use-staff-params"
import {
  type StaffAction,
  type StaffMemberRow,
  type StaffRoleFilter,
  type StaffStatusFilter,
  getStaffDisplayName,
  getStaffStatusKey,
} from "@/lib/staff-management"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@ewatrade/ui"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState } from "react"

type StaffResponse = {
  staff: StaffMemberRow[]
  store: {
    currencyCode: string
    id: string
    name: string
  }
}

type Notice = { text: string; error?: boolean }

const STATUS_TABS: Array<{ value: StaffStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "suspended", label: "Suspended" },
]

function matchesStatus(member: StaffMemberRow, status: StaffStatusFilter) {
  if (status === "all") return true
  const key = getStaffStatusKey(member)
  return status === "invited"
    ? key === "invited" || key === "expired"
    : key === status
}

export function StaffPage({
  businessName,
  canManageAccess,
  canOpenMember,
  initialViewSettings,
  initialQuery,
  initialRole,
  initialStaff,
  store,
}: {
  businessName: string
  /** Owners and admins: order rule, store access and history. */
  canManageAccess: boolean
  canOpenMember: boolean
  initialViewSettings: DirectoryViewSettings
  initialQuery: string
  initialRole: StaffRoleFilter
  initialStaff: StaffMemberRow[]
  store: StaffResponse["store"]
}) {
  const { view, setView, persistenceError, retryPersistence } =
    useDirectoryView({
      pageId: "staff",
      queryKey: "staffView",
      initialSettings: initialViewSettings,
    })
  const router = useRouter()
  const { setInviteOpen } = useStaffParams()
  const client = useQueryClient()
  const member = useStaffMemberParams()
  const { setParams, staffQuery, staffRole, staffStatus } =
    useStaffDirectoryParams()
  const workflow = useDashboardWorkflow()
  const invitations = useStaffInvitationActions()
  const list = useStaffList({
    search: staffQuery,
    role: staffRole,
    initial: { search: initialQuery, role: initialRole, staff: initialStaff },
  })
  const staff = list.data ?? []
  const isLoading = list.isFetching && (list.isPlaceholderData || !list.data)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [qaInviteUrl, setQaInviteUrl] = useState<string | null>(null)
  const [removing, setRemoving] = useState<{
    member: StaffMemberRow
    mode: "cancel" | "remove"
  } | null>(null)
  const removeStaff = useRemoveStaff()

  const refreshStaff = () =>
    client.invalidateQueries({ queryKey: STAFF_LIST_QUERY_KEY })

  const counts = useMemo(
    () =>
      Object.fromEntries(
        STATUS_TABS.map((tab) => [
          tab.value,
          staff.filter((row) => matchesStatus(row, tab.value)).length,
        ]),
      ) as Record<StaffStatusFilter, number>,
    [staff],
  )
  const expiredCount = staff.filter(
    (row) => getStaffStatusKey(row) === "expired",
  ).length
  const rows = useMemo(
    () => staff.filter((row) => matchesStatus(row, staffStatus)),
    [staff, staffStatus],
  )

  function openInvite() {
    setNotice(null)
    setQaInviteUrl(null)
    void setInviteOpen(true).catch(() =>
      setNotice({ error: true, text: "Couldn’t open the invite form." }),
    )
  }

  async function onInvited(email: string, inviteUrl: string | null) {
    setQaInviteUrl(inviteUrl)
    setNotice({ text: `Invite sent to ${email}.` })
    router.refresh()
    await refreshStaff().catch(() =>
      setNotice({
        text: "Invite sent. Refresh the page to see them in the list.",
      }),
    )
  }

  async function updateStatus(
    target: StaffMemberRow,
    status: "active" | "suspended",
  ) {
    const name = getStaffDisplayName(target)
    setNotice(null)
    setBusyId(target.id)
    try {
      const response = await workflow.fetch("staff_update", "/api/staff", {
        body: JSON.stringify({
          operation: "status",
          staffUserId: target.user.id,
          status,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error)
      await refreshStaff()
      setNotice({
        text:
          status === "active"
            ? `${name} can sign in again.`
            : `${name} is suspended.`,
      })
    } catch {
      setNotice({
        error: true,
        text:
          status === "active"
            ? `Couldn’t reactivate ${name}. Try again.`
            : `Couldn’t suspend ${name}. Try again.`,
      })
    } finally {
      setBusyId(null)
    }
  }

  async function resendInvite(target: StaffMemberRow) {
    const invitationId = target.access?.invitationId
    if (!invitationId) {
      setNotice({
        error: true,
        text: "This invite has changed. Refresh the page and try again.",
      })
      return
    }
    setNotice(null)
    setBusyId(target.id)
    try {
      await invitations.run("RESEND", invitationId)
      await refreshStaff()
      setNotice({ text: `Invite sent again to ${target.user.email}.` })
    } catch (failure) {
      setNotice({
        error: true,
        text:
          failure instanceof Error && failure.message
            ? failure.message
            : "Couldn’t change this invite. Try again.",
      })
    } finally {
      setBusyId(null)
    }
  }

  async function confirmRemove() {
    if (!removing) return
    const { member: target, mode } = removing
    setNotice(null)
    setBusyId(target.id)
    try {
      await removeStaff.mutateAsync(target.user.id)
      setNotice({
        text:
          mode === "cancel"
            ? `Invite cancelled for ${target.user.email}. The link no longer works.`
            : `${getStaffDisplayName(target)} was removed.`,
      })
    } catch (failure) {
      setNotice({
        error: true,
        text:
          failure instanceof Error && failure.message
            ? failure.message
            : "Couldn’t remove them. Try again.",
      })
    } finally {
      setBusyId(null)
      setRemoving(null)
    }
  }

  function runAction(action: StaffAction, target: StaffMemberRow) {
    if (action === "access" || action === "suspend")
      void member.open(target.id, action)
    else if (action === "reactivate") void updateStatus(target, "active")
    else if (action === "resend") void resendInvite(target)
    else
      setRemoving({
        member: target,
        mode: action === "cancel" ? "cancel" : "remove",
      })
  }

  // Columns are rebuilt when actions change, so keep them stable and read
  // the latest handlers through a ref; otherwise every render remounts cells.
  const latest = useRef({ runAction, member })
  latest.current = { runAction, member }
  const actions = useMemo<StaffRowActions>(
    () => ({
      busyId,
      canSeeHistory: canManageAccess,
      onOpen: canOpenMember
        ? (target) => void latest.current.member.open(target.id)
        : undefined,
      onHistory: (target) => void latest.current.member.openHistory(target.id),
      onAction: (action, target) => latest.current.runAction(action, target),
    }),
    [busyId, canManageAccess, canOpenMember],
  )

  return (
    <ScrollableContent>
      <TableToolbarSlotProvider>
        <div className="flex min-w-0 flex-1 flex-col gap-5 pt-6">
          <StaffDirectoryHeader
            businessName={businessName}
            onInvite={openInvite}
            view={view}
            onViewChange={setView}
          />
          {canManageAccess ? (
            <OrderVisibilityLine storeId={store.id} storeName={store.name} />
          ) : null}
          <Tabs
            value={staffStatus}
            onValueChange={(value) =>
              void setParams({
                staffStatus:
                  value === "all" ? null : (value as StaffStatusFilter),
              })
            }
          >
            <TabsList
              variant="line"
              aria-label="Staff status"
              className="max-w-full justify-start overflow-x-auto pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {STATUS_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                  <span className="rounded-full bg-muted px-1.5 text-xs font-semibold tabular-nums text-foreground">
                    {counts[tab.value]}
                  </span>
                  {tab.value === "invited" && expiredCount ? (
                    <span className="rounded-full bg-warning px-1.5 text-xs font-semibold text-warning-foreground">
                      {expiredCount} expired
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {list.isError ? (
            <div
              role="alert"
              className="border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              Couldn’t load staff. Try again.
            </div>
          ) : null}
          {persistenceError ? (
            <Alert appearance="dashboard" role="alert">
              <AlertDescription>{persistenceError}</AlertDescription>
              <Button variant="outline" size="sm" onClick={retryPersistence}>
                Try again
              </Button>
            </Alert>
          ) : null}
          {notice ? (
            <div
              role={notice.error ? "alert" : "status"}
              className={
                notice.error
                  ? "flex items-center justify-between gap-3 border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  : "flex items-center justify-between gap-3 border border-success-border bg-success px-4 py-3 text-sm text-success-foreground"
              }
            >
              {notice.text}
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setNotice(null)}
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  className="size-4"
                  aria-hidden="true"
                />
              </button>
            </div>
          ) : null}
          {qaInviteUrl ? (
            <Alert
              appearance="dashboard"
              aria-label="QA staff invitation"
              className="flex flex-col gap-3 border border-border bg-muted/30 p-4"
            >
              <AlertTitle>QA invite link</AlertTitle>
              <AlertDescription>
                Open this link to set the password and finish setup without
                checking email.
              </AlertDescription>
              <a
                href={qaInviteUrl}
                className="break-all text-sm underline"
                target="_blank"
                rel="noreferrer"
              >
                {qaInviteUrl}
              </a>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(qaInviteUrl)
                    .then(() => setNotice({ text: "Invite link copied." }))
                    .catch(() =>
                      setNotice({
                        error: true,
                        text: "Select and copy the invite link above.",
                      }),
                    )
                }}
              >
                Copy invite link
              </Button>
            </Alert>
          ) : null}

          <StaffDataTable
            key={JSON.stringify([staffQuery, staffRole, staffStatus])}
            rows={rows}
            view={view}
            isLoading={isLoading}
            filtered={Boolean(staffQuery.trim()) || staffRole !== "all"}
            actions={actions}
          />

          <StaffInviteModal
            businessName={businessName}
            storeId={store.id}
            onInvited={onInvited}
          />
          <RemoveStaffAlert
            mode={removing?.mode ?? "cancel"}
            name={removing ? getStaffDisplayName(removing.member) : ""}
            open={Boolean(removing)}
            pending={removeStaff.isPending}
            onOpenChange={(open) => {
              if (!open && !removeStaff.isPending) setRemoving(null)
            }}
            onConfirm={() => void confirmRemove()}
          />
        </div>
      </TableToolbarSlotProvider>
    </ScrollableContent>
  )
}
