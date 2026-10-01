import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { resolveCustomerOperation } from "@/lib/customer-conversation-state"
import { useCustomerTRPC } from "@/trpc/customer-client"
import { useMutation } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useRef, useState } from "react"
import { ScrollView } from "react-native"
import {
  CUSTOMER_CONVERSATION_REPORT_REASONS,
  type CustomerConversationReportReason,
  customerConversationBlockDescription,
} from "./customer-conversation-safety-presentation"

export function CustomerConversationSafetyControl({
  accountAccess,
  blocked,
  conversationId,
  onBlockedChange,
  publicToken,
}: {
  accountAccess: boolean
  blocked: boolean
  conversationId: string
  onBlockedChange: (blocked: boolean) => void
  publicToken: string
}) {
  const modal = useModal()
  const trpc = useCustomerTRPC()
  const reportOperation = useRef<{ id: string; key: string } | null>(null)
  const blockOperation = useRef<{ id: string; key: string } | null>(null)
  const [reason, setReason] = useState<CustomerConversationReportReason | null>(
    null,
  )
  const [reportSubmitted, setReportSubmitted] = useState(false)
  const [blockNotice, setBlockNotice] = useState<string | null>(null)
  const guestReport = useMutation(
    trpc.serviceCommerce.mobileReportStoreConversation.mutationOptions(),
  )
  const accountReport = useMutation(
    trpc.serviceCommerce.accountReportStoreConversation.mutationOptions(),
  )
  const guestBlock = useMutation(
    trpc.serviceCommerce.mobileBlockStoreConversation.mutationOptions(),
  )
  const accountBlock = useMutation(
    trpc.serviceCommerce.accountBlockStoreConversation.mutationOptions(),
  )
  const guestUnblock = useMutation(
    trpc.serviceCommerce.mobileUnblockStoreConversation.mutationOptions(),
  )
  const accountUnblock = useMutation(
    trpc.serviceCommerce.accountUnblockStoreConversation.mutationOptions(),
  )
  const report = accountAccess ? accountReport : guestReport
  const blockMutation = accountAccess ? accountBlock : guestBlock
  const unblockMutation = accountAccess ? accountUnblock : guestUnblock
  const changingBlock = blockMutation.isPending || unblockMutation.isPending
  const blockError = blockMutation.error ?? unblockMutation.error

  const submitReport = async () => {
    if (!reason || report.isPending || reportSubmitted) return
    reportOperation.current = resolveCustomerOperation(
      reportOperation.current,
      reason,
      () => Crypto.randomUUID(),
    )
    const input = {
      clientOperationId: reportOperation.current.id,
      conversationId,
      publicToken,
      reason,
    }
    try {
      const result = accountAccess
        ? await accountReport.mutateAsync(input)
        : await guestReport.mutateAsync(input)
      if (result.status !== "submitted") return
      reportOperation.current = null
      guestReport.reset()
      accountReport.reset()
      setReportSubmitted(true)
    } catch {
      // The mutation error is shown in the sheet; preserve the operation ID for retry.
    }
  }

  const changeBlock = async () => {
    if (changingBlock) return
    const action = blocked ? "unblock" : "block"
    blockOperation.current = resolveCustomerOperation(
      blockOperation.current,
      action,
      () => Crypto.randomUUID(),
    )
    const input = {
      clientOperationId: blockOperation.current.id,
      conversationId,
      publicToken,
    }
    setBlockNotice(null)
    guestBlock.reset()
    accountBlock.reset()
    guestUnblock.reset()
    accountUnblock.reset()
    try {
      const result = blocked
        ? accountAccess
          ? await accountUnblock.mutateAsync(input)
          : await guestUnblock.mutateAsync(input)
        : accountAccess
          ? await accountBlock.mutateAsync(input)
          : await guestBlock.mutateAsync(input)
      blockOperation.current = null
      guestBlock.reset()
      accountBlock.reset()
      guestUnblock.reset()
      accountUnblock.reset()
      onBlockedChange(result.blocked)
      setBlockNotice(
        result.blocked
          ? "Store blocked. Your conversation remains available to read."
          : "Store unblocked. You can message again when the Store is available.",
      )
    } catch {
      // The mutation error is shown in the sheet; preserve the operation ID for retry.
    }
  }

  return (
    <>
      <Pressable
        accessibilityHint="Report a concern or block this Store"
        accessibilityLabel="Report or block Store"
        accessibilityRole="button"
        className="min-h-14 w-full flex-row items-center gap-3 border-y border-border px-2 py-2 active:bg-accent"
        haptic
        onPress={() => modal.present()}
      >
        <View className="size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-sm text-primary" name="ShieldCheck" />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-sm font-bold text-foreground">
            Report or block Store
          </Text>
          <Text className="text-xs text-muted-foreground">
            {blocked
              ? "Store blocked · Report a concern"
              : "Keep this conversation safe"}
          </Text>
        </View>
        <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
      </Pressable>

      <Modal
        enableDynamicSizing
        maxDynamicContentSize={760}
        ref={modal.ref}
        title="Report or block Store"
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
          <View className="gap-5 px-5 pb-6">
            <View className="gap-2">
              <Text
                accessibilityRole="header"
                className="text-base font-bold text-foreground"
              >
                Report this conversation
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Choose why you want ẸwáTrade to review this Store conversation.
                Reporting does not block the Store.
              </Text>
              <View className="border-b border-border">
                {CUSTOMER_CONVERSATION_REPORT_REASONS.map((option) => (
                  <Pressable
                    accessibilityLabel={option.label}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: reason === option.value,
                      disabled: reportSubmitted,
                    }}
                    className="min-h-12 flex-row items-center gap-3 border-t border-border px-1 py-2 active:bg-accent"
                    disabled={reportSubmitted}
                    key={option.value}
                    onPress={() => setReason(option.value)}
                  >
                    <View
                      className={`size-5 rounded-full border-2 ${reason === option.value ? "border-primary bg-primary" : "border-muted-foreground/50"}`}
                    />
                    <Text className="min-w-0 flex-1 text-sm text-foreground">
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {report.error ? (
                <StatusBanner
                  message={report.error.message}
                  title="Report could not be submitted"
                  tone="destructive"
                />
              ) : null}
              {reportSubmitted ? (
                <StatusBanner
                  message="ẸwáTrade received your report for review. This does not block the Store."
                  title="Report submitted"
                  tone="success"
                />
              ) : null}
              <Pressable
                accessibilityLabel={
                  report.isPending ? "Submitting report" : "Submit report"
                }
                accessibilityRole="button"
                accessibilityState={{
                  disabled: !reason || report.isPending || reportSubmitted,
                }}
                className="min-h-12 items-center justify-center rounded-full bg-primary px-5 disabled:opacity-50"
                disabled={!reason || report.isPending || reportSubmitted}
                haptic
                onPress={() => void submitReport()}
              >
                <Text className="font-bold text-primary-foreground">
                  {report.isPending
                    ? "Submitting report…"
                    : reportSubmitted
                      ? "Report submitted"
                      : "Submit report"}
                </Text>
              </Pressable>
            </View>

            <View className="gap-3 border-t border-border pt-5">
              <Text
                accessibilityRole="header"
                className="text-base font-bold text-foreground"
              >
                {blocked ? "Unblock this Store" : "Block this Store"}
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                {customerConversationBlockDescription(blocked)}
              </Text>
              {blockError ? (
                <StatusBanner
                  message={blockError.message}
                  title="Block setting could not be changed"
                  tone="destructive"
                />
              ) : null}
              {blockNotice ? (
                <StatusBanner
                  message={blockNotice}
                  title={blocked ? "Store blocked" : "Store unblocked"}
                  tone="success"
                />
              ) : null}
              <Pressable
                accessibilityLabel={
                  changingBlock
                    ? "Updating Store block"
                    : blocked
                      ? "Unblock Store"
                      : "Block Store"
                }
                accessibilityRole="button"
                accessibilityState={{ disabled: changingBlock }}
                className="min-h-12 items-center justify-center rounded-full border border-border px-5 disabled:opacity-50"
                disabled={changingBlock}
                haptic
                onPress={() => void changeBlock()}
              >
                <Text className="font-bold text-foreground">
                  {changingBlock
                    ? "Updating…"
                    : blocked
                      ? "Unblock Store"
                      : "Block Store"}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </Modal>
    </>
  )
}
