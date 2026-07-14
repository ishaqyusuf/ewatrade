"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { DashboardTable } from "@/components/dashboard/dashboard-table"
import {
  type StaffInviteRole,
  type StaffMemberRow,
  type StaffRoleFilter,
  type StaffStatusFilter,
  canUpdateStaffStatus,
  filterStaffRows,
  getNextStaffStatus,
  getStaffDisplayName,
  getStaffRoleLabel,
  getStaffStatusLabel,
} from "@/lib/staff-management"
import { cn } from "@/utils"
import { Badge, Button } from "@ewatrade/ui"
import {
  Add01Icon,
  Edit02Icon,
  Search01Icon,
  UserCircle02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type {
  FormEvent,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react"
import { useEffect, useMemo, useState } from "react"

type StaffResponse = {
  staff: StaffMemberRow[]
  store: {
    currencyCode: string
    id: string
    name: string
  }
}

type InviteForm = {
  email: string
  name: string
  role: StaffInviteRole
}

const emptyInviteForm: InviteForm = {
  email: "",
  name: "",
  role: "cashier",
}

function statusTone(status: string) {
  const normalized = status.trim().toUpperCase()

  if (normalized === "ACTIVE") return "bg-emerald-50 text-emerald-700"
  if (normalized === "INVITED") return "bg-amber-50 text-amber-700"
  if (normalized === "SUSPENDED") return "bg-destructive/10 text-destructive"

  return "bg-muted text-muted-foreground"
}

function roleTone(role: string) {
  const normalized = role.trim().toUpperCase()

  if (normalized === "OWNER" || normalized === "ADMIN") {
    return "bg-primary/10 text-primary"
  }

  if (normalized === "MANAGER") return "bg-sky-50 text-sky-700"

  return "bg-muted text-muted-foreground"
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </div>
  )
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20",
        props.className,
      )}
    />
  )
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20",
        props.className,
      )}
    />
  )
}

function formatDate(value: string | null) {
  if (!value) return "Not yet"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
  }).format(date)
}

export function StaffPage({
  initialStaff,
  store,
}: {
  initialStaff: StaffMemberRow[]
  store: StaffResponse["store"]
}) {
  const [staff, setStaff] = useState(initialStaff)
  const [search, setSearch] = useState("")
  const [role, setRole] = useState<StaffRoleFilter>("all")
  const [status, setStatus] = useState<StaffStatusFilter>("all")
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState<InviteForm>(emptyInviteForm)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [updatingStaffUserId, setUpdatingStaffUserId] = useState<string | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setIsLoading(true)

      try {
        const params = new URLSearchParams()
        if (search.trim()) params.set("search", search.trim())
        if (role !== "all") params.set("role", role)
        if (status !== "all") params.set("status", status)

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
  }, [search, role, status])

  const visibleStaff = useMemo(
    () => filterStaffRows(staff, { role, search, status }),
    [staff, role, search, status],
  )
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
    setInviteForm(emptyInviteForm)
    setInviteOpen(true)
  }

  async function refreshStaff() {
    const params = new URLSearchParams()
    if (search.trim()) params.set("search", search.trim())
    if (role !== "all") params.set("role", role)
    if (status !== "all") params.set("status", status)

    const response = await fetch(`/api/staff?${params.toString()}`)
    const result = (await response.json()) as StaffResponse

    if (response.ok) {
      setStaff(result.staff)
    }
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    if (!inviteForm.email.trim()) {
      setError("Enter a staff email.")
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch("/api/staff", {
        body: JSON.stringify({
          email: inviteForm.email.trim(),
          name: inviteForm.name.trim() || undefined,
          operation: "invite",
          role: inviteForm.role,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const result = (await response.json()) as { error?: string }

      if (!response.ok) {
        throw new Error(result.error ?? "Staff invite failed.")
      }

      await refreshStaff()
      setInviteOpen(false)
      setNotice("Staff invite sent.")
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Staff invite failed.",
      )
    } finally {
      setIsSaving(false)
    }
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
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <HugeiconsIcon icon={UserCircle02Icon} className="size-4" />
            Staff
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Staff management
          </h1>
          <p className="text-sm text-muted-foreground">{store.name}</p>
        </div>
        <Button type="button" className="gap-2 rounded-lg" onClick={openInvite}>
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          Invite staff
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Staff", summary.total],
          ["Active", summary.active],
          ["Invited", summary.invited],
          ["Suspended", summary.suspended],
          ["Attendants", summary.attendants],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-background p-4"
          >
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {value}
            </p>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search staff"
              className="pl-9"
            />
          </div>
          <Select
            value={role}
            onChange={(event) => setRole(event.target.value as StaffRoleFilter)}
            className="xl:w-[180px]"
            aria-label="Staff role"
          >
            <option value="all">All roles</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="cashier">Cashier</option>
            <option value="operator">Operator</option>
          </Select>
          <Select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as StaffStatusFilter)
            }
            className="xl:w-[180px]"
            aria-label="Staff status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="suspended">Suspended</option>
          </Select>
        </div>

        <DashboardTable
          rows={visibleStaff}
          isLoading={isLoading}
          getRowKey={(member) => member.id}
          emptyState={
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <HugeiconsIcon
                  icon={UserCircle02Icon}
                  className="size-5 text-muted-foreground"
                />
              </div>
              <div>
                <p className="text-sm font-medium">No staff found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Invite a staff member or adjust the current filters.
                </p>
              </div>
            </div>
          }
          columns={[
            {
              header: "Staff",
              key: "staff",
              render: (member) => (
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <HugeiconsIcon
                      icon={UserCircle02Icon}
                      className="size-5 text-muted-foreground"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {getStaffDisplayName(member)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.user.email}
                    </p>
                  </div>
                </div>
              ),
            },
            {
              header: "Role",
              key: "role",
              render: (member) => (
                <Badge className={cn("rounded-full", roleTone(member.role))}>
                  {getStaffRoleLabel(member.role)}
                </Badge>
              ),
            },
            {
              header: "Status",
              key: "status",
              render: (member) => (
                <Badge
                  className={cn("rounded-full", statusTone(member.status))}
                >
                  {getStaffStatusLabel(member.status)}
                </Badge>
              ),
            },
            {
              header: "Invited",
              key: "invited",
              render: (member) => (
                <span className="text-muted-foreground">
                  {formatDate(member.invitedAt)}
                </span>
              ),
            },
            {
              header: "Accepted",
              key: "accepted",
              render: (member) => (
                <span className="text-muted-foreground">
                  {formatDate(member.acceptedAt)}
                </span>
              ),
            },
            {
              className: "text-right",
              header: "",
              key: "actions",
              render: (member) => {
                const nextStatus = getNextStaffStatus(member)
                const canUpdate = canUpdateStaffStatus(member)
                const isUpdating = updatingStaffUserId === member.user.id

                return (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 rounded-lg"
                    disabled={!canUpdate || isUpdating}
                    onClick={() => updateStatus(member)}
                  >
                    <HugeiconsIcon icon={Edit02Icon} className="size-4" />
                    {isUpdating
                      ? "Saving"
                      : nextStatus === "active"
                        ? "Reactivate"
                        : "Suspend"}
                  </Button>
                )
              },
            },
          ]}
        />
      </section>

      <DashboardSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite staff"
        description="Cashier, operator, or manager access"
      >
        <form className="grid gap-4" onSubmit={submitInvite}>
          <Field label="Email">
            <TextInput
              type="email"
              value={inviteForm.email}
              onChange={(event) =>
                setInviteForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              required
            />
          </Field>

          <Field label="Name">
            <TextInput
              value={inviteForm.name}
              onChange={(event) =>
                setInviteForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="Role">
            <Select
              value={inviteForm.role}
              onChange={(event) =>
                setInviteForm((current) => ({
                  ...current,
                  role: event.target.value as StaffInviteRole,
                }))
              }
            >
              <option value="cashier">Cashier</option>
              <option value="operator">Operator</option>
              <option value="manager">Manager</option>
            </Select>
          </Field>

          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Invited staff complete onboarding from the staff invite link using
            the existing OTP-backed staff onboarding flow.
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => setInviteOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-lg" disabled={isSaving}>
              {isSaving ? "Sending..." : "Send invite"}
            </Button>
          </div>
        </form>
      </DashboardSheet>
    </div>
  )
}
