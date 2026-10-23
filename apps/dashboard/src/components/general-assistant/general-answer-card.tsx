"use client"

import { OpenAssistantBookingSheet } from "@/components/open-assistant-booking-sheet"
import { OpenAssistantFinanceReview } from "@/components/open-assistant-finance-review"
import { OpenAssistantManualMessageSheet } from "@/components/open-assistant-manual-message-sheet"
import { OpenAssistantQuoteApprovalSheet } from "@/components/open-assistant-quote-approval-sheet"
import { OpenAssistantReadRecord } from "@/components/open-assistant-read-record"
import { OpenAssistantServiceRequestSheet } from "@/components/open-assistant-service-request-sheet"
import { OpenBusinessReportSheet } from "@/components/open-business-report-sheet"
import { OpenServiceWorkOriginalSheet } from "@/components/open-service-work-original-sheet"
import { OpenStaffAccessSheet } from "@/components/open-staff-access-sheet"
import { OpenStaffActivitySheet } from "@/components/open-staff-activity-sheet"
import { OpenStaffDirectorySheet } from "@/components/open-staff-directory-sheet"
import { OpenStaffHistorySheet } from "@/components/open-staff-history-sheet"
import { OpenStaffInvitationSheet } from "@/components/open-staff-invitation-sheet"
import { OpenStaffMemberSheet } from "@/components/open-staff-member-sheet"
import { OpenStaffStatusSheet } from "@/components/open-staff-status-sheet"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { useSyncExternalStore } from "react"
import { GeneralMoneyAccountsAnswer } from "./general-money-accounts-answer"
import { GeneralServiceJobCard } from "./general-service-job-card"
import { OpenMissingCatalogItem } from "./open-missing-catalog-item"

const subscribe = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false

export function GeneralAnswerCard({
  answer,
  messageId,
}: { answer: GeneralAnswer; messageId?: string }) {
  const hydrated = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  )
  const asOf = new Date(answer.asOf)
  if (answer.serviceDraft)
    return (
      <GeneralServiceJobCard
        draft={answer.serviceDraft}
        answerId={answer.id}
        messageId={messageId}
      />
    )
  if (answer.accounts)
    return (
      <GeneralMoneyAccountsAnswer
        answer={answer}
        accounts={answer.accounts}
        asOf={hydrated ? asOf.toLocaleString() : asOf.toISOString()}
      />
    )
  // Value and meaning first; where it came from in a small line; the original
  // record opens from the right (below on narrow chats).
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 rounded-lg border px-4 py-3 [overflow-wrap:anywhere]">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-xs text-muted-foreground">{answer.title}</p>
        <p className="text-xl leading-tight font-semibold tabular-nums">
          {answer.value}
        </p>
        <p className="mt-1 text-sm">{answer.detail}</p>
        {answer.records?.rows.length ? (
          <ol className="mt-3 grid gap-3">
            {answer.records.rows.slice(0, 6).map((row, index) => (
              <li
                key={`${row.type}:${row.title}:${index}`}
                className="grid justify-items-start gap-1 border-t pt-2"
              >
                <p className="text-xs text-muted-foreground">{row.type}</p>
                <p className="text-sm font-medium">{row.title}</p>
                {row.subtitle ? (
                  <p className="text-sm text-muted-foreground">
                    {row.subtitle}
                  </p>
                ) : null}
                {row.target ? (
                  <OpenAssistantReadRecord target={row.target} />
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
        <p className="mt-1.5 text-xs text-muted-foreground">
          {answer.scope} · as of{" "}
          <time dateTime={answer.asOf}>
            {hydrated ? asOf.toLocaleString() : asOf.toISOString()}
          </time>
        </p>
      </div>
      {answer.catalogCreate ? (
        <div className="shrink-0">
          <OpenMissingCatalogItem handoff={answer.catalogCreate} />
        </div>
      ) : answer.target ? (
        <div className="shrink-0">
          {answer.target.kind === "service_request" ? (
            <OpenAssistantServiceRequestSheet target={answer.target} />
          ) : answer.target.kind === "service_manual_message" ? (
            <OpenAssistantManualMessageSheet target={answer.target} />
          ) : answer.target.kind === "commerce_quote_approval" ? (
            <OpenAssistantQuoteApprovalSheet target={answer.target} />
          ) : answer.target.kind === "service_booking" ? (
            <OpenAssistantBookingSheet target={answer.target} />
          ) : answer.target.kind === "service_work" ||
            answer.target.kind === "service_work_note" ||
            answer.target.kind === "service_work_exception" ? (
            <OpenServiceWorkOriginalSheet target={answer.target} />
          ) : answer.target.kind === "staff_access" ? (
            <OpenStaffAccessSheet eventId={answer.target.eventId} />
          ) : answer.target.kind === "staff_status" ? (
            <OpenStaffStatusSheet eventId={answer.target.eventId} />
          ) : answer.target.kind === "business_report" ? (
            <OpenBusinessReportSheet target={answer.target} />
          ) : answer.target.kind === "finance_cash_count" ||
            answer.target.kind === "finance_day_close" ? (
            <OpenAssistantFinanceReview target={answer.target} />
          ) : answer.target.kind === "staff_activity" ? (
            <OpenStaffActivitySheet target={answer.target} />
          ) : answer.target.kind === "staff_history" ? (
            <OpenStaffHistorySheet target={answer.target} />
          ) : answer.target.kind === "staff_directory" ? (
            <OpenStaffDirectorySheet target={answer.target} />
          ) : answer.target.kind === "staff_invitation" ? (
            <OpenStaffInvitationSheet commandId={answer.target.commandId} />
          ) : answer.target.kind === "staff_member" ? (
            <OpenStaffMemberSheet membershipId={answer.target.membershipId} />
          ) : answer.target.kind === "catalog_item" ||
            answer.target.kind === "customer" ||
            answer.target.kind === "customer_directory" ||
            answer.target.kind === "order" ? (
            <OpenAssistantReadRecord target={answer.target} />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
