"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { StaffDirectoryHeader } from "@/components/dashboard/staff-directory-header"
import { StaffInviteModal } from "@/components/modals/staff-invite-modal"
import { ScrollableContent } from "@/components/scrollable-content"
import { CancelInviteAlert } from "@/components/staff/cancel-invite-alert"
import { ManageStaffAccessModal } from "@/components/staff/manage-staff-access-modal"
import { OrderVisibilityLine } from "@/components/staff/order-visibility-line"
import { TableToolbarSlotProvider } from "@/components/tables/core"
import type { StaffRowActions } from "@/components/tables/staff/actions"
import { StaffDataTable } from "@/components/tables/staff/data-table"
import { useDirectoryView } from "@/hooks/use-directory-view"
import { useStaffDirectoryParams } from "@/hooks/use-staff-directory-params"
import { useStaffInvitationActions } from "@/hooks/use-staff-invitation-actions"
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
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

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
  const { setInviteOpen, setAccessUserId } = useStaffParams()
  const member = useStaffMemberParams()
  const { setParams, staffQuery, staffRole, staffStatus } =
    useStaffDirectoryParams()
  const workflow = useDashboardWorkflow()
  const invitations = useStaffInvitationActions()
  const [staff, setStaff] = useState(initialStaff)
  const [isLoading, setIsLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [qaInviteUrl, setQaInviteUrl] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<StaffMemberRow | null>(null)

  // Status is a tab over the loaded list, so only search and role reload it.
  const lastFilters = useRef({ search: initialQuery, role: initialRole })

  const staffUrl = useCallback(() => {
    const params = new URLSearchParams()
    if (staffQuery.trim()) params.set("search", staffQuery.trim())
    if (staffRole !== "all") params.set("role", staffRole)
    return `/api/staff?${params.toString()}`
  }, [staffQuery, staffRole])

  useEffect(() => {
    const previous = lastFilters.current
    if (previous.search === staffQuery && previous.role === staffRole) return
    lastFilters.current = { search: staffQuery, role: staffRole }
    setNotice(null)
    setIsLoading(true)
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(staffUrl(), { signal: controller.signal })
        const result = (await response.json()) as
          | StaffResponse
          | { error?: string }
        if (!response.ok)
          throw new Error(
            "error" in result && result.error
              ? result.error
              : "Couldn’t load staff. Try again.",
          )
        setStaff((result as StaffResponse).staff)
      } catch (fetchError) {
        if (!controller.signal.aborted)
          setNotice({
            error: true,
            text:
              fetchError instanceof Error
                ? fetchError.message
                : "Couldn’t load staff. Try again.",
          })
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }, 250)
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [staffQuery, staffRole, staffUrl])

  const refreshStaff = useCallback(async () => {
    const response = await fetch(staffUrl())
    const result = (await response.json()) as StaffResponse
    if (response.ok) setStaff(result.staff)
  }, [staffUrl])

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

  async function changeInvitation(
    kind: "RESEND" | "REVOKE",
    target: StaffMemberRow,
  ) {
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
      await invitations.run(kind, invitationId)
      await refreshStaff()
      setNotice({
        text:
          kind === "RESEND"
            ? `Invite sent again to ${target.user.email}.`
            : `Invite cancelled for ${target.user.email}. The link no longer works.`,
      })
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
      setCancelling(null)
    }
  }

  function runAction(action: StaffAction, target: StaffMemberRow) {
    if (action === "access") void setAccessUserId(target.user.id)
    else if (action === "suspend") void updateStatus(target, "suspended")
    else if (action === "reactivate") void updateStatus(target, "active")
    else if (action === "resend") void changeInvitation("RESEND", target)
    else setCancelling(target)
  }

  const actions: StaffRowActions = {
    busyId,
    canSeeHistory: canManageAccess,
    onOpen: canOpenMember ? (target) => void member.open(target.id) : undefined,
    onHistory: (target) => void member.openHistory(target.id),
    onAction: runAction,
  }

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
            <TabsList variant="line" aria-label="Staff status">
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

          <ManageStaffAccessModal
            onSaved={async () => {
              setNotice({ text: "Access saved." })
              router.refresh()
              await refreshStaff()
            }}
          />
          <StaffInviteModal storeId={store.id} onInvited={onInvited} />
          <CancelInviteAlert
            name={cancelling ? getStaffDisplayName(cancelling) : ""}
            open={Boolean(cancelling)}
            pending={invitations.isPending}
            onOpenChange={(open) => {
              if (!open && !invitations.isPending) setCancelling(null)
            }}
            onConfirm={() => {
              if (cancelling) void changeInvitation("REVOKE", cancelling)
            }}
          />
        </div>
      </TableToolbarSlotProvider>
    </ScrollableContent>
  )
}
