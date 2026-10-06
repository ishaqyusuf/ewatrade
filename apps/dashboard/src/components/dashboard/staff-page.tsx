"use client"

import { CollapsibleSummary } from "@/components/collapsible-summary"
import { StaffDirectoryHeader } from "@/components/dashboard/staff-directory-header"
import { StaffInviteModal } from "@/components/modals/staff-invite-modal"
import { MetricCard } from "@/components/reports/metric-card"
import { ScrollableContent } from "@/components/scrollable-content"
import { ManageStaffAccessModal } from "@/components/staff/manage-staff-access-modal"
import { StaffDataTable } from "@/components/tables/staff/data-table"
import { useDirectoryView } from "@/hooks/use-directory-view"
import { useStaffDirectoryParams } from "@/hooks/use-staff-directory-params"
import { useStaffParams } from "@/hooks/use-staff-params"
import {
  type StaffMemberRow,
  type StaffRoleFilter,
  type StaffStatusFilter,
  getNextStaffStatus,
} from "@/lib/staff-management"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"
import { Alert, AlertDescription, AlertTitle, Button } from "@ewatrade/ui"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

type StaffResponse = {
  staff: StaffMemberRow[]
  store: {
    currencyCode: string
    id: string
    name: string
  }
}

export function StaffPage({
  initialViewSettings,
  initialQuery,
  initialRole,
  initialStaff,
  initialStatus,
  store,
}: {
  initialViewSettings: DirectoryViewSettings
  initialQuery: string
  initialRole: StaffRoleFilter
  initialStaff: StaffMemberRow[]
  initialStatus: StaffStatusFilter
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
  const { staffQuery, staffRole, staffStatus } = useStaffDirectoryParams()
  const [staff, setStaff] = useState(initialStaff)
  const [isLoading, setIsLoading] = useState(false)
  const [updatingStaffUserId, setUpdatingStaffUserId] = useState<string | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [qaInviteUrl, setQaInviteUrl] = useState<string | null>(null)

  const lastFilters = useRef({
    search: initialQuery,
    role: initialRole,
    status: initialStatus,
  })

  useEffect(() => {
    const previous = lastFilters.current
    if (
      previous.search === staffQuery &&
      previous.role === staffRole &&
      previous.status === staffStatus
    )
      return
    lastFilters.current = {
      search: staffQuery,
      role: staffRole,
      status: staffStatus,
    }
    setError(null)
    setIsLoading(true)
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setIsLoading(true)

      try {
        const params = new URLSearchParams()
        if (staffQuery.trim()) params.set("search", staffQuery.trim())
        if (staffRole !== "all") params.set("role", staffRole)
        if (staffStatus !== "all") params.set("status", staffStatus)

        const response = await fetch(`/api/staff?${params.toString()}`, {
          signal: controller.signal,
        })
        const result = (await response.json()) as
          | StaffResponse
          | { error?: string }

        if (!response.ok) {
          throw new Error(
            "error" in result && result.error
              ? result.error
              : "Staff refresh failed.",
          )
        }

        setStaff((result as StaffResponse).staff)
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Staff refresh failed.",
          )
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }, 250)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [staffQuery, staffRole, staffStatus])

  const summary = useMemo(() => {
    const active = staff.filter((member) => member.status === "ACTIVE").length
    const invited = staff.filter((member) => member.status === "INVITED").length
    const suspended = staff.filter(
      (member) => member.status === "SUSPENDED",
    ).length
    const attendants = staff.filter((member) =>
      ["CASHIER", "OPERATOR"].includes(member.role),
    ).length

    return {
      active,
      attendants,
      invited,
      suspended,
      total: staff.length,
    }
  }, [staff])

  function openInvite() {
    setError(null)
    setNotice(null)
    setQaInviteUrl(null)
    void setInviteOpen(true).catch((failure: unknown) => {
      setError(
        failure instanceof Error
          ? failure.message
          : "The invitation sheet could not be opened.",
      )
    })
  }

  async function refreshStaff() {
    const params = new URLSearchParams()
    if (staffQuery.trim()) params.set("search", staffQuery.trim())
    if (staffRole !== "all") params.set("role", staffRole)
    if (staffStatus !== "all") params.set("status", staffStatus)

    const response = await fetch(`/api/staff?${params.toString()}`)
    const result = (await response.json()) as StaffResponse

    if (response.ok) {
      setStaff(result.staff)
    }
  }

  async function onInvited(inviteUrl: string | null) {
    setQaInviteUrl(inviteUrl)
    setNotice("Staff invite sent.")
    router.refresh()
    await refreshStaff().catch(() => {
      setError("Invitation sent. Refresh the page to update the staff list.")
    })
  }

  async function updateStatus(member: StaffMemberRow) {
    setError(null)
    setNotice(null)
    setUpdatingStaffUserId(member.user.id)

    try {
      const nextStatus = getNextStaffStatus(member)
      const response = await fetch("/api/staff", {
        body: JSON.stringify({
          operation: "status",
          staffUserId: member.user.id,
          status: nextStatus,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const result = (await response.json()) as { error?: string }

      if (!response.ok) {
        throw new Error(result.error ?? "Staff status update failed.")
      }

      await refreshStaff()
      setNotice(
        nextStatus === "active" ? "Staff reactivated." : "Staff suspended.",
      )
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Staff status update failed.",
      )
    } finally {
      setUpdatingStaffUserId(null)
    }
  }

  return (
    <ScrollableContent>
      <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
        <CollapsibleSummary>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Staff", summary.total],
              ["Active", summary.active],
              ["Invited", summary.invited],
              ["Suspended", summary.suspended],
              ["Cashiers", summary.attendants],
            ].map(([label, value]) => (
              <MetricCard key={label} label={String(label)} value={value} />
            ))}
          </div>
        </CollapsibleSummary>

        <StaffDirectoryHeader
          storeName={store.name}
          onInvite={openInvite}
          view={view}
          onViewChange={setView}
        />
        {persistenceError ? (
          <Alert appearance="dashboard" role="alert">
            <AlertDescription>{persistenceError}</AlertDescription>
            <Button variant="outline" size="sm" onClick={retryPersistence}>
              Retry saving view
            </Button>
          </Alert>
        ) : null}

        {error ? (
          <div className="border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}
        {qaInviteUrl ? (
          <Alert
            appearance="dashboard"
            aria-label="QA staff invitation"
            className="flex flex-col gap-3 border border-border bg-muted/30 p-4"
          >
            <AlertTitle>QA staff invitation</AlertTitle>
            <AlertDescription>
              Open this link to create the staff password and complete setup
              without checking email.
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
              appearance="form"
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard
                  .writeText(qaInviteUrl)
                  .then(() => setNotice("Invitation link copied."))
                  .catch(() =>
                    setError("Select and copy the invitation link above."),
                  )
              }}
            >
              Copy invitation link
            </Button>
          </Alert>
        ) : null}

        <section className="flex flex-col gap-4">
          <StaffDataTable
            key={JSON.stringify([staffQuery, staffRole, staffStatus])}
            rows={staff}
            view={view}
            isLoading={isLoading}
            updatingId={updatingStaffUserId}
            onUpdateStatus={updateStatus}
          />
        </section>

        <ManageStaffAccessModal
          onSaved={async () => {
            setNotice("Staff Store access updated.")
            router.refresh()
            await refreshStaff()
          }}
        />
        <StaffInviteModal storeId={store.id} onInvited={onInvited} />
      </div>
    </ScrollableContent>
  )
}
