import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { resolveCustomerOperation } from "@/lib/customer-conversation-state"
import { useCustomerTRPC } from "@/trpc/customer-client"
import {
  type StoreConversationAccountInvitationProjection,
  canSelectStoreConversationAccountCandidate,
} from "@ewatrade/service-commerce"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useRouter } from "expo-router"
import { useMemo, useRef, useState } from "react"

import { CustomerAccountInvitationContent } from "./customer-account-invitation-content"

export function CustomerAccountInvitationMessage({
  conversationId,
  invitation,
  messageId,
  onRefresh,
  publicToken,
}: {
  conversationId: string
  invitation: StoreConversationAccountInvitationProjection
  messageId: string
  onRefresh: () => Promise<unknown>
  publicToken: string
}) {
  const modal = useModal()
  const router = useRouter()
  const { isAuthenticated } = useAuthContext()
  const trpc = useCustomerTRPC()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitationError, setInvitationError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const dismissOperation = useRef<{ id: string; key: string } | null>(null)
  const linkOperation = useRef<{ id: string; key: string } | null>(null)
  const candidates = useQuery(
    trpc.serviceCommerce.mobileStoreConversationAccountCandidates.queryOptions(
      {},
      { enabled: isAuthenticated && reviewOpen, retry: false },
    ),
  )
  const candidateItems = candidates.data?.items ?? []
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const dismissInvitation = useMutation(
    trpc.serviceCommerce.dismissMobileStoreConversationAccountInvitation.mutationOptions(),
  )
  const linkConversations = useMutation(
    trpc.serviceCommerce.linkMobileStoreConversationsToAccount.mutationOptions(),
  )

  const open = () => {
    setError(null)
    if (!isAuthenticated) {
      router.push({
        pathname: "/login",
        params: {
          returnTo: `/(customer)/conversations/${conversationId}?publicToken=${encodeURIComponent(publicToken)}`,
        },
      })
      return
    }
    setReviewOpen(true)
    modal.present()
  }

  const linkSelected = async () => {
    if (selectedIds.length === 0) return
    const selectionKey = [...selectedIds].sort().join(":")
    linkOperation.current = resolveCustomerOperation(
      linkOperation.current,
      selectionKey,
      () => `account-link-${Crypto.randomUUID()}`,
    )
    setError(null)
    try {
      await linkConversations.mutateAsync({
        clientOperationId: linkOperation.current.id,
        confirmed: true,
        conversationIds: selectedIds,
      })
      linkOperation.current = null
      await onRefresh()
      modal.dismiss()
    } catch (linkError) {
      setError(
        linkError instanceof Error
          ? linkError.message
          : "These conversations could not be linked.",
      )
    }
  }

  const dismiss = async () => {
    dismissOperation.current = resolveCustomerOperation(
      dismissOperation.current,
      `${conversationId}:${messageId}:${invitation.id}`,
      () => `account-dismiss-${Crypto.randomUUID()}`,
    )
    setInvitationError(null)
    try {
      await dismissInvitation.mutateAsync({
        clientOperationId: dismissOperation.current.id,
        conversationId,
        invitationId: invitation.id,
        messageId,
        publicToken,
      })
      dismissOperation.current = null
      await onRefresh()
    } catch (dismissError) {
      setInvitationError(
        dismissError instanceof Error
          ? dismissError.message
          : "This invitation could not be dismissed.",
      )
    }
  }

  return (
    <>
      <CustomerAccountInvitationContent
        accountSession={isAuthenticated}
        dismissing={dismissInvitation.isPending}
        invitation={invitation}
        invitationError={invitationError}
        onCreateAccount={open}
        onDismiss={() => void dismiss()}
        onSignIn={open}
      />

      <Modal
        enableDynamicSizing
        maxDynamicContentSize={720}
        onDismiss={() => {
          setReviewOpen(false)
          setError(null)
        }}
        ref={modal.ref}
        snapPoints={["84%"]}
        title="Link conversations"
      >
        <BottomSheetKeyboardAwareScrollView
          bottomOffset={280}
          contentContainerStyle={{ paddingBottom: 180 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-5 px-5 pb-6">
            <View className="gap-1">
              <Text className="text-xl font-extrabold text-foreground">
                Choose what to link
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Only conversations already available on this device appear here.
                Nothing is matched by email or phone.
              </Text>
            </View>
            {error ? <StatusBanner message={error} tone="destructive" /> : null}
            {candidates.isLoading ? (
              <Text className="py-6 text-center text-muted-foreground">
                Loading conversations…
              </Text>
            ) : null}
            {candidateItems.map((candidate) => {
              const checked = selected.has(candidate.conversationId)
              const selectable =
                canSelectStoreConversationAccountCandidate(candidate)
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked, disabled: !selectable }}
                  className="min-h-14 flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                  disabled={!selectable}
                  haptic
                  key={candidate.conversationId}
                  onPress={() => {
                    linkOperation.current = null
                    setSelectedIds((current) =>
                      current.includes(candidate.conversationId)
                        ? current.filter(
                            (id) => id !== candidate.conversationId,
                          )
                        : [...current, candidate.conversationId],
                    )
                  }}
                >
                  <View
                    className={
                      checked
                        ? "size-6 items-center justify-center rounded-md bg-primary"
                        : "size-6 rounded-md border border-border"
                    }
                  >
                    {checked ? (
                      <Icon
                        className="size-xs text-primary-foreground"
                        name="Check"
                      />
                    ) : null}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text
                      className="font-bold text-foreground"
                      numberOfLines={1}
                    >
                      {candidate.storeName}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {candidate.linked
                        ? "Already linked"
                        : candidate.state === "restricted"
                          ? "Linked to another account"
                          : candidate.invitationState === "dismissed"
                            ? "Previously dismissed — linking is still optional"
                            : "Available on this device"}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
            <ActionButton
              disabled={selectedIds.length === 0}
              isLoading={linkConversations.isPending}
              loadingLabel="Linking conversations"
              onPress={() => void linkSelected()}
            >
              Link selected conversations
            </ActionButton>
            <ActionButton onPress={modal.dismiss} variant="ghost">
              Continue as guest
            </ActionButton>
          </View>
        </BottomSheetKeyboardAwareScrollView>
      </Modal>
    </>
  )
}
