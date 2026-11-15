"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { FormFeedback } from "@/components/forms/form-feedback"
import {
  StaffMemberContent,
  memberAsStaffRow,
} from "@/components/staff-member-content"
import { RemoveStaffAlert } from "@/components/staff/remove-staff-alert"
import { StaffAccessForm } from "@/components/staff/staff-access-form"
import { SuspendStaffAlert } from "@/components/staff/suspend-staff-alert"
import { useRemoveStaff } from "@/hooks/use-remove-staff"
import { staffAccessQueryKey, useStaffAccess } from "@/hooks/use-staff-access"
import { useStaffInvitationActions } from "@/hooks/use-staff-invitation-actions"
import { STAFF_LIST_QUERY_KEY } from "@/hooks/use-staff-list"
import { useStaffMemberParams } from "@/hooks/use-staff-member-params"
import {
  type StaffAction,
  getStaffActions,
  getStaffContact,
} from "@/lib/staff-management"
import { useTRPC } from "@/trpc/client"
import { Button, Sheet, toast } from "@ewatrade/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { SheetFrame } from "./sheet-frame"

const ACTION_LABEL: Record<StaffAction, string> = {
  access: "Change role or stores",
  cancel: "Cancel invite",
  reactivate: "Reactivate",
  remove: "Remove",
  resend: "Send invite again",
  suspend: "Suspend",
}

const DESTRUCTIVE: StaffAction[] = ["suspend", "cancel", "remove"]

/**
 * One person: role and stores in plain words, one main action. Change role
 * or stores is a view inside this sheet with Back; Suspend, Cancel invite
 * and Remove are alerts over it.
 */
export function StaffMemberSheet({
  historyAllowed,
}: { historyAllowed: boolean }) {
  const { isOpen, membershipId, view, setView, close, openHistory } =
    useStaffMemberParams()
  const trpc = useTRPC()
  const client = useQueryClient()
  const workflow = useDashboardWorkflow()
  const invitations = useStaffInvitationActions()
  const [notice, setNotice] = useState<{
    text: string
    error?: boolean
  } | null>(null)
  const [removeMode, setRemoveMode] = useState<"cancel" | "remove" | null>(null)
  const removeStaff = useRemoveStaff()
  const [busy, setBusy] = useState(false)
  const query = useQuery(
    trpc.retailOps.staffDirectoryMember.queryOptions(
      { membershipId: membershipId ?? "" },
      { enabled: isOpen && Boolean(membershipId), retry: false, staleTime: 0 },
    ),
  )
  const member = query.data
  // Store access and the live invite link are Owner and Admin reads.
  const access = useStaffAccess(historyAllowed && member ? member.userId : null)
  const row = member
    ? memberAsStaffRow(member, historyAllowed ? access.data : undefined)
    : null
  const accessLoading = historyAllowed && access.isPending
  const actions =
    row && !accessLoading
      ? getStaffActions(row).filter(
          (action) =>
            historyAllowed || action === "suspend" || action === "reactivate",
        )
      : []
  const main = actions.find((action) => !DESTRUCTIVE.includes(action))
  const others = actions.filter((action) => action !== main)
  const invitationId = row?.access?.invitationId ?? null

  async function refreshAll() {
    await Promise.all([
      client.invalidateQueries({ queryKey: STAFF_LIST_QUERY_KEY }),
      client.invalidateQueries({
        queryKey: trpc.retailOps.staffDirectoryMember.queryKey(),
      }),
      member
        ? client.invalidateQueries({
            queryKey: staffAccessQueryKey(member.userId),
          })
        : undefined,
    ])
  }

  async function finishView(text: string) {
    await refreshAll()
    setNotice({ text })
    await setView(null)
  }

  async function reactivate() {
    if (!member) return
    setBusy(true)
    setNotice(null)
    try {
      const response = await workflow.fetch("staff_update", "/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "status",
          staffUserId: member.userId,
          status: "active",
        }),
      })
      if (!response.ok) throw new Error()
      await refreshAll()
      setNotice({ text: `${member.name} can sign in again.` })
    } catch {
      setNotice({
        error: true,
        text: `Couldn’t reactivate ${member.name}. Try again.`,
      })
    } finally {
      setBusy(false)
    }
  }

  async function resendInvite() {
    if (!member || !invitationId) return
    setBusy(true)
    setNotice(null)
    try {
      await invitations.run("RESEND", invitationId)
      await refreshAll()
      setNotice({
        text: `Invite sent again to ${getStaffContact(member.email) ?? member.name}.`,
      })
    } catch (failure) {
      setNotice({
        error: true,
        text:
          failure instanceof Error && failure.message
            ? failure.message
            : "Couldn’t send the invite again. Try again.",
      })
    } finally {
      setBusy(false)
    }
  }

  // They leave the list, so the sheet closes and a toast confirms it.
  async function confirmRemove() {
    if (!member || !removeMode) return
    try {
      await removeStaff.mutateAsync(member.userId)
      toast(
        removeMode === "cancel"
          ? `Invite cancelled for ${member.name}.`
          : `${member.name} was removed.`,
      )
      setRemoveMode(null)
      setNotice(null)
      await close()
    } catch (failure) {
      setRemoveMode(null)
      setNotice({
        error: true,
        text:
          failure instanceof Error && failure.message
            ? failure.message
            : "Couldn’t remove them. Try again.",
      })
    }
  }

  function runAction(action: StaffAction) {
    setNotice(null)
    if (action === "access" || action === "suspend") void setView(action)
    else if (action === "reactivate") void reactivate()
    else if (action === "resend") void resendInvite()
    else setRemoveMode(action === "cancel" ? "cancel" : "remove")
  }

  const back = member
    ? { label: `Back to ${member.name}`, onClick: () => void setView(null) }
    : undefined

  function frame() {
    if (!membershipId)
      return (
        <SheetFrame title="Staff">
          <p role="alert">This link no longer works.</p>
        </SheetFrame>
      )
    if (query.isPending)
      return (
        <SheetFrame title="Staff">
          <output aria-live="polite">Loading…</output>
        </SheetFrame>
      )
    if (query.isError || !member || !row)
      return (
        <SheetFrame title="Staff">
          <div role="alert" className="grid gap-3">
            <p>You can’t see this person.</p>
            <Button
              variant="outline"
              className="justify-self-start"
              onClick={() => void query.refetch()}
            >
              Try again
            </Button>
          </div>
        </SheetFrame>
      )
    if (view === "access" && actions.includes("access"))
      return (
        <SheetFrame title="Change role or stores" back={back}>
          <StaffAccessForm
            userId={member.userId}
            name={member.name}
            onSaved={() => finishView(`Saved ${member.name}’s access.`)}
            onCancel={() => void setView(null)}
          />
        </SheetFrame>
      )
    return (
      <SheetFrame
        title={member.name}
        description={getStaffContact(member.email) ?? undefined}
        footer={
          actions.length || historyAllowed ? (
            <div className="grid w-full gap-2 sm:flex sm:flex-wrap sm:justify-end">
              {main ? (
                <Button
                  type="button"
                  className="sm:order-last"
                  disabled={busy}
                  onClick={() => runAction(main)}
                >
                  {busy && (main === "resend" || main === "reactivate")
                    ? "Sending…"
                    : ACTION_LABEL[main]}
                </Button>
              ) : null}
              {historyAllowed ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void openHistory(member.membershipId)}
                >
                  History
                </Button>
              ) : null}
              {others.map((action) => (
                <Button
                  key={action}
                  type="button"
                  variant="outline"
                  className={
                    DESTRUCTIVE.includes(action)
                      ? "text-destructive sm:order-first sm:mr-auto"
                      : undefined
                  }
                  disabled={busy}
                  onClick={() => runAction(action)}
                >
                  {ACTION_LABEL[action]}
                </Button>
              ))}
            </div>
          ) : undefined
        }
      >
        <div className="grid gap-5">
          {notice ? (
            <FormFeedback
              appearance="dashboard"
              variant={notice.error ? undefined : "default"}
            >
              {notice.text}
            </FormFeedback>
          ) : null}
          <StaffMemberContent
            row={row}
            showStores={historyAllowed}
            loading={accessLoading}
          />
        </div>
      </SheetFrame>
    )
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(value) => {
        if (!value) {
          setNotice(null)
          void close()
        }
      }}
    >
      {isOpen ? frame() : null}
      <RemoveStaffAlert
        mode={removeMode ?? "cancel"}
        name={member?.name ?? ""}
        open={Boolean(removeMode)}
        pending={removeStaff.isPending}
        onOpenChange={(open) => {
          if (!open && !removeStaff.isPending) setRemoveMode(null)
        }}
        onConfirm={() => void confirmRemove()}
      />
      {member ? (
        <SuspendStaffAlert
          open={view === "suspend" && actions.includes("suspend")}
          userId={member.userId}
          name={member.name}
          onOpenChange={(open) => {
            if (!open) void setView(null)
          }}
          onSuspended={() => finishView(`${member.name} is suspended.`)}
        />
      ) : null}
    </Sheet>
  )
}
