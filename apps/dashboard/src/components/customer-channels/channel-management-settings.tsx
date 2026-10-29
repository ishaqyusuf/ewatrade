"use client"

import {
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-page"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { ChannelReadContent } from "./channel-read-content"
import { chatHoursSummary } from "./channel-settings-labels"
import { ConversationModeChoice } from "./conversation-mode-choice"

export function ConversationModeSection({
  onShowDetails,
  storeId,
  storeName,
}: { onShowDetails: () => void; storeId: string; storeName: string }) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.serviceCommerce.storeConversationChannelModeSettings.queryOptions(
      { storeId },
      { retry: false },
    ),
  )
  return (
    <SettingsSection title={`How customers reach ${storeName}`}>
      <ChannelReadContent label="customer contact settings" query={query}>
        {(settings) => (
          <ConversationModeChoice
            key={storeId}
            onShowDetails={onShowDetails}
            settings={settings}
            storeId={storeId}
          />
        )}
      </ChannelReadContent>
    </SettingsSection>
  )
}

export function ChatHoursRow({
  onChange,
  storeId,
}: { onChange: () => void; storeId: string }) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.serviceCommerce.storeConversationAvailabilitySettings.queryOptions(
      { storeId },
      { retry: false },
    ),
  )
  return (
    <ChannelReadContent label="chat hours" query={query}>
      {(settings) => (
        <SettingsRow
          label="Chat hours"
          description={
            settings.manualPaused
              ? "New chats are paused. Your team can still reply to existing chats."
              : "Chat is open in these hours when someone is free to reply."
          }
        >
          <span className="text-sm font-medium">
            {settings.manualPaused
              ? "Paused"
              : chatHoursSummary(settings.weeklyHours)}
          </span>
          <Button onClick={onChange} size="sm" variant="outline">
            Change
          </Button>
        </SettingsRow>
      )}
    </ChannelReadContent>
  )
}

export function QuoteReleasePolicyRow({
  onChange,
  storeId,
}: { onChange: () => void; storeId: string }) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.serviceCommerce.quoteReleaseSettings.queryOptions(
      { storeId },
      { retry: false },
    ),
  )
  return (
    <ChannelReadContent label="quote approval settings" query={query}>
      {(settings) => {
        const count = settings.policy.selectedApproverMembershipIds.length
        return (
          <SettingsRow
            label="Quotes need approval"
            description="Another person must approve each quote before the customer sees it."
          >
            <span className="text-sm font-medium">
              {settings.policy.mode === "approval_required"
                ? `On · ${count === 1 ? "1 approver" : `${count} approvers`}`
                : "Off"}
            </span>
            <Button onClick={onChange} size="sm" variant="outline">
              Change
            </Button>
          </SettingsRow>
        )
      }}
    </ChannelReadContent>
  )
}
