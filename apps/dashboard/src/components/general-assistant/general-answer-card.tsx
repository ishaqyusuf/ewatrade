"use client"

import { OpenAssistantFinanceReview } from "@/components/open-assistant-finance-review"
import { OpenBusinessReportSheet } from "@/components/open-business-report-sheet"
import { OpenStaffDirectorySheet } from "@/components/open-staff-directory-sheet"
import { OpenStaffHistorySheet } from "@/components/open-staff-history-sheet"
import { OpenStaffInvitationSheet } from "@/components/open-staff-invitation-sheet"
import { OpenStaffMemberSheet } from "@/components/open-staff-member-sheet"
import { OpenStaffStatusSheet } from "@/components/open-staff-status-sheet"
import { OpenStaffAccessSheet } from "@/components/open-staff-access-sheet"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { useSyncExternalStore } from "react"

const subscribe = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false

export function GeneralAnswerCard({ answer }: { answer: GeneralAnswer }) {
  const hydrated = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  )
  const asOf = new Date(answer.asOf)
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="text-xs text-muted-foreground">{answer.title}</p>
      <p className="text-xl font-semibold tabular-nums">{answer.value}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {answer.scope} · as of{" "}
        <time dateTime={answer.asOf}>
          {hydrated ? asOf.toLocaleString() : asOf.toISOString()}
        </time>
      </p>
      <p className="mt-2 text-sm">{answer.detail}</p>
      {answer.target ? (
        <div className="mt-3">
          {answer.target.kind === "staff_access" ? (
            <OpenStaffAccessSheet eventId={answer.target.eventId} />
          ) : answer.target.kind === "staff_status" ? (
            <OpenStaffStatusSheet eventId={answer.target.eventId} />
          ) : answer.target.kind === "business_report" ? (
            <OpenBusinessReportSheet target={answer.target} />
          ) : answer.target.kind === "finance_cash_count" ||
            answer.target.kind === "finance_day_close" ? (
            <OpenAssistantFinanceReview target={answer.target} />
          ) : answer.target.kind === "staff_history" ? (
            <OpenStaffHistorySheet target={answer.target} />
          ) : answer.target.kind === "staff_directory" ? (
            <OpenStaffDirectorySheet target={answer.target} />
          ) : answer.target.kind === "staff_invitation" ? (
            <OpenStaffInvitationSheet commandId={answer.target.commandId} />
          ) : (
            <OpenStaffMemberSheet membershipId={answer.target.membershipId} />
          )}
        </div>
      ) : null}
    </div>
  )
}
