"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { FormFeedback } from "@/components/forms/form-feedback"
import {
  StaffMemberContent,
  memberAsStaffRow,
} from "@/components/staff-member-content"
import { CancelInviteAlert } from "@/components/staff/cancel-invite-alert"
import { StaffAccessForm } from "@/components/staff/staff-access-form"
import { StaffSuspendForm } from "@/components/staff/staff-suspend-form"
import { staffAccessQueryKey, useStaffAccess } from "@/hooks/use-staff-access"
import { useStaffInvitationActions } from "@/hooks/use-staff-invitation-actions"
import { useStaffInvitationParams } from "@/hooks/use-staff-invitation-params"
import { STAFF_LIST_QUERY_KEY } from "@/hooks/use-staff-list"
import { useStaffMemberParams } from "@/hooks/use-staff-member-params"
import { type StaffAction, getStaffActions } from "@/lib/staff-management"
import { useTRPC } from "@/trpc/client"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { SheetFrame } from "./sheet-frame"

const ACTION_LABEL: Record<StaffAction, string> = {
  access: "Change access",
  cancel: "Cancel invite",
  reactivate: "Reactivate",
  resend: "Resend invite",
  suspend: "Suspend",
}

/**
 * One person's details. Change access and Suspend are views inside this
 * sheet with Back; Cancel invite is an alert over it.
 */
export function StaffMemberSheet({
  historyAllowed,
}: { historyAllowed: boolean }) {
  const { isOpen, membershipId, view, setView, close, openHistory } =
    useStaffMemberParams()
  const trpc = useTRPC()
  const client = useQueryClient()
  const workflow = useDashboardWorkflow()
  const invitationSheet = useStaffInvitationParams()
  const invitations = useStaffInvitationActions()
  const [notice, setNotice] = useState<{
    text: string
    error?: boolean
  } | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const query = useQuery(
    trpc.retailOps.staffDirectoryMember.queryOptions(
      { membershipId: membershipId ?? "" },
      { enabled: isOpen && Boolean(membershipId), retry: false, staleTime: 0 },
    ),
  )
  const member = query.data
  // Store access and invite links are Owner and Admin reads.
  const access = useStaffAccess(historyAllowed && member ? member.userId : null)
  const invites = useQuery(
    trpc.retailOps.staffInvitations.queryOptions(
      { membershipId: membershipId ?? "" },
      {
        enabled: isOpen && historyAllowed && member?.status === "INVITED",
        retry: false,
      },
    ),
  )
  const invitation = invites.data?.data.find((row) =>
    ["ACTIVE", "EXPIRED"].includes(row.status),
  )
  const inviteCommandId = invitation?.commandId ?? null
  const row = member ? memberAsStaffRow(member, access.data, invitation) : null
  const actions = row
    ? getStaffActions(row).filter(
        (action) =>
          historyAllowed || action === "suspend" || action === "reactivate",
      )
    : []

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

  async function changeInvite(kind: "RESEND" | "REVOKE") {
    if (!member || !invitation) return
    setBusy(true)
    setNotice(null)
    try {
      await invitations.run(kind, invitation.id)
      await refreshAll()
      await invites.refetch()
      setNotice({
        text:
          kind === "RESEND"
            ? `Invite sent again to ${member.email}.`
            : `Invite cancelled for ${member.email}. The link no longer works.`,
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
      setBusy(false)
      setCancelOpen(false)
    }
  }

  function runAction(action: StaffAction) {
    if (action === "access" || action === "suspend") void setView(action)
    else if (action === "reactivate") void reactivate()
    else if (action === "resend") void changeInvite("RESEND")
    else setCancelOpen(true)
  }

  const back = member
    ? { label: `Back to ${member.name}`, onClick: () => void setView(null) }
    : undefined

  function frame() {
    if (!membershipId)
      return (
        <SheetFrame title="Staff">
          <p role="alert">
            This link no longer works. Ask the assistant again.
          </p>
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
            <p>You don’t have access to this person.</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        </SheetFrame>
      )
    if (view === "access" && actions.includes("access"))
      return (
        <SheetFrame
          title="Change access"
          description={`${member.name} · ${member.email}`}
          back={back}
        >
          <StaffAccessForm
            userId={member.userId}
            onSaved={() => finishView(`Access saved for ${member.name}.`)}
            onCancel={() => void setView(null)}
          />
        </SheetFrame>
      )
    if (view === "suspend" && actions.includes("suspend"))
      return (
        <SheetFrame
          title={`Suspend ${member.name}`}
          description={member.email}
          back={back}
        >
          <StaffSuspendForm
            userId={member.userId}
            name={member.name}
            onSaved={() => finishView(`${member.name} is suspended.`)}
            onCancel={() => void setView(null)}
          />
        </SheetFrame>
      )
    return (
      <SheetFrame
        title={member.name}
        description={member.email}
        footer={
          <>
            {actions.map((action, index) => (
              <Button
                key={action}
                type="button"
                variant={
                  index === 0
                    ? "default"
                    : action === "suspend" || action === "cancel"
                      ? "ghost"
                      : "outline"
                }
                className={
                  index > 0 && (action === "suspend" || action === "cancel")
                    ? "text-destructive"
                    : undefined
                }
                disabled={busy}
                onClick={() => runAction(action)}
              >
                {ACTION_LABEL[action]}
              </Button>
            ))}
            {historyAllowed ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void openHistory(member.membershipId)}
              >
                See history
              </Button>
            ) : null}
          </>
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
            loading={historyAllowed && (access.isPending || invites.isLoading)}
            onOpenInvitation={
              inviteCommandId
                ? () => void invitationSheet.open(inviteCommandId)
                : undefined
            }
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
      <CancelInviteAlert
        name={member?.name ?? ""}
        open={cancelOpen}
        pending={invitations.isPending}
        onOpenChange={(open) => {
          if (!open && !invitations.isPending) setCancelOpen(false)
        }}
        onConfirm={() => void changeInvite("REVOKE")}
      />
    </Sheet>
  )
}
