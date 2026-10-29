"use client"

import {
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-page"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"
import { type ChannelRead, ChannelReadContent } from "./channel-read-content"
import { quoteSourceLabel } from "./channel-settings-labels"

type PendingApprovals =
  RouterOutputs["serviceCommerce"]["pendingQuoteApprovals"]

export function PendingQuoteApprovals({
  onReview,
  query,
}: {
  onReview: (approval: PendingApprovals[number]) => void
  query: ChannelRead<PendingApprovals>
}) {
  return (
    <SettingsSection title="Quotes waiting for approval">
      <ChannelReadContent label="quotes waiting for approval" query={query}>
        {(approvals) =>
          approvals.length > 0 ? (
            approvals.map((approval) => (
              <SettingsRow
                key={approval.id}
                label={`${quoteSourceLabel(approval.sourceKind)} · ${formatMoney(approval.totalMinor, approval.currencyCode)}`}
                description={`Quote ${approval.version}. ${approval.canApprove || approval.canReject ? "You can approve this quote." : "Waiting for another approver."}`}
              >
                <Button
                  onClick={() => onReview(approval)}
                  size="sm"
                  variant="outline"
                >
                  Review quote
                </Button>
              </SettingsRow>
            ))
          ) : (
            <p className="px-4 py-3.5 text-sm text-muted-foreground">
              No quotes waiting for approval.
            </p>
          )
        }
      </ChannelReadContent>
    </SettingsSection>
  )
}

function formatMoney(amount: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
  }).format(amount / 100)
}
