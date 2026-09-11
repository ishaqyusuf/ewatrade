import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { CustomerAccountInvitationContent } from "./customer-account-invitation-content"
import { CustomerAccountInvitationMessage } from "./customer-account-invitation-message"
import { CustomerAttachment } from "./customer-attachment"
import { resolveCustomerMessageMeta } from "./customer-conversation-detail-presentation"
import { CustomerQuoteMessage } from "./customer-quote-message"

type Message =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]["messages"][number]

export function CustomerMessage({
  accountAccess,
  accountInvitationActionsDisabled = false,
  accountInvitationInteractive = true,
  conversationId,
  message,
  onContactStore,
  onRecoverAttachment,
  onRefresh,
  publicToken,
  quoteInteractive = true,
  storeName,
}: {
  accountAccess: boolean
  accountInvitationActionsDisabled?: boolean
  accountInvitationInteractive?: boolean
  conversationId: string
  message: Message
  onContactStore: () => void
  onRecoverAttachment?: (
    message: Message,
    recovery: "contact_store" | "remove_and_retry" | "retry",
  ) => void
  onRefresh: () => Promise<unknown>
  publicToken: string
  quoteInteractive?: boolean
  storeName: string
}) {
  if (message.accountInvitation) {
    if (!accountInvitationInteractive) {
      return (
        <CustomerAccountInvitationContent
          accountSession={false}
          actionsDisabled={accountInvitationActionsDisabled}
          dismissing={false}
          invitation={message.accountInvitation}
          invitationError={null}
          onCreateAccount={() => {}}
          onDismiss={() => {}}
          onSignIn={() => {}}
        />
      )
    }
    return (
      <CustomerAccountInvitationMessage
        conversationId={conversationId}
        invitation={message.accountInvitation}
        messageId={message.id}
        onRefresh={onRefresh}
        publicToken={publicToken}
      />
    )
  }

  if (message.actionMessage) {
    return (
      <CustomerQuoteMessage
        accountAccess={accountAccess}
        actionMessage={message.actionMessage}
        conversationId={conversationId}
        interactive={quoteInteractive}
        messageId={message.id}
        onContactStore={onContactStore}
        onRefresh={onRefresh}
        publicToken={publicToken}
      />
    )
  }

  const isCustomer = message.author.kind === "customer"
  const attachmentOnly = message.attachments.length > 0
  const messageMeta = resolveCustomerMessageMeta({
    authorKind: message.author.kind,
    channel: message.channel,
    occurredAt: message.occurredAt,
    storeName,
    whatsAppObservationStatus: message.whatsAppObservation?.status,
  })
  return (
    <View className={isCustomer ? "items-end" : "items-start"}>
      <View
        className={
          attachmentOnly
            ? "max-w-[82%]"
            : isCustomer
              ? "max-w-[82%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5"
              : "max-w-[82%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5"
        }
      >
        {message.attachments.map((attachment) => {
          const recovery = attachment.recovery
          return (
            <CustomerAttachment
              attachment={attachment}
              conversationId={conversationId}
              customer={isCustomer}
              key={attachment.id}
              onRecover={
                recovery && onRecoverAttachment
                  ? () => onRecoverAttachment(message, recovery)
                  : undefined
              }
              publicToken={publicToken}
            />
          )
        })}
        {!attachmentOnly ? (
          <>
            <Text
              className={
                isCustomer
                  ? "leading-6 text-primary-foreground"
                  : "leading-6 text-foreground"
              }
            >
              {message.text}
            </Text>
          </>
        ) : null}
      </View>
      {!attachmentOnly ? (
        <Text className="mt-1 px-1 text-[10px] text-muted-foreground">
          {messageMeta}
        </Text>
      ) : null}
    </View>
  )
}
