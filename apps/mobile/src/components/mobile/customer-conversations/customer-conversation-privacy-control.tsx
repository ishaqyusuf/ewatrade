import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { resolveCustomerOperation } from "@/lib/customer-conversation-state"
import { useCustomerTRPC } from "@/trpc/customer-client"
import type { StoreConversationRetentionClassification } from "@ewatrade/service-commerce"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useRef, useState } from "react"
import {
  CUSTOMER_CONVERSATION_PRIVACY_OPTIONS,
  projectCustomerConversationPrivacyRequestStatus,
  projectCustomerConversationPrivacySubmit,
} from "./customer-conversation-privacy-presentation"

export function CustomerConversationPrivacyControl({
  conversationId,
  inert = false,
  publicToken,
}: {
  conversationId: string
  inert?: boolean
  publicToken: string
}) {
  const modal = useModal()
  const trpc = useCustomerTRPC()
  const operation = useRef<{ id: string; key: string } | null>(null)
  const [selected, setSelected] = useState<
    StoreConversationRetentionClassification[]
  >(["presentation_message"])
  const [privacyRequestId, setPrivacyRequestId] = useState<string | null>(null)
  const createRequest = useMutation(
    trpc.serviceCommerce.accountCreateStoreConversationPrivacyRequest.mutationOptions(),
  )
  const status = useQuery(
    trpc.serviceCommerce.accountStoreConversationPrivacyRequest.queryOptions(
      {
        conversationId,
        privacyRequestId: privacyRequestId ?? "pending",
        publicToken,
      },
      { enabled: false, retry: false },
    ),
  )
  const submitPresentation = projectCustomerConversationPrivacySubmit({
    hasSelection: selected.length > 0,
    pending: createRequest.isPending,
    submitted: privacyRequestId !== null,
  })

  const toggle = (classification: StoreConversationRetentionClassification) => {
    setSelected((current) =>
      current.includes(classification)
        ? current.filter((item) => item !== classification)
        : [...current, classification],
    )
  }

  const submit = async () => {
    if (inert || submitPresentation.disabled) return
    const selectionKey = [...selected].sort().join(":")
    operation.current = resolveCustomerOperation(
      operation.current,
      selectionKey,
      () => `privacy-${Crypto.randomUUID()}`,
    )
    try {
      const request = await createRequest.mutateAsync({
        classifications: selected,
        clientOperationId: operation.current.id,
        conversationId,
        publicToken,
      })
      setPrivacyRequestId(request.id)
      operation.current = null
    } catch {
      // React Query exposes the failure through createRequest.error.
    }
  }

  return (
    <>
      <Pressable
        accessibilityHint="Choose conversation data to remove or review"
        accessibilityLabel="Conversation privacy"
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
            Conversation privacy
          </Text>
          <Text className="text-xs text-muted-foreground">
            Choose data to remove or review
          </Text>
        </View>
        <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
      </Pressable>

      <Modal
        enableDynamicSizing
        maxDynamicContentSize={760}
        ref={modal.ref}
        snapPoints={["82%"]}
        title="Conversation privacy"
      >
        <BottomSheetKeyboardAwareScrollView
          contentContainerStyle={{ paddingBottom: 80 }}
        >
          <View className="gap-4 px-5 pb-6">
            <Text className="text-sm leading-5 text-muted-foreground">
              Choose what ẸwáTrade should remove or review. Each category gets
              its own result.
            </Text>

            <View className="min-h-11 flex-row items-center gap-2 border-l-2 border-primary bg-muted/60 px-3 py-2">
              <Icon className="size-sm text-primary" name="ShieldCheck" />
              <Text className="min-w-0 flex-1 text-xs leading-4 text-muted-foreground">
                Required records are reported, not silently deleted.
              </Text>
            </View>

            <View className="border-b border-border">
              {CUSTOMER_CONVERSATION_PRIVACY_OPTIONS.map((option) => {
                const checked = selected.includes(option.value)
                return (
                  <Pressable
                    accessibilityLabel={`${option.label}, ${checked ? "selected" : "not selected"}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    className="min-h-16 flex-row items-center gap-3 border-t border-border px-1 py-3 active:bg-accent"
                    haptic
                    key={option.value}
                    onPress={() => toggle(option.value)}
                  >
                    <View className="min-w-0 flex-1 gap-1">
                      <Text className="font-bold text-foreground">
                        {option.label}
                      </Text>
                      <Text className="text-xs leading-4 text-muted-foreground">
                        {option.description}
                      </Text>
                    </View>
                    <View
                      className={`size-6 shrink-0 items-center justify-center rounded-md border ${checked ? "border-primary bg-primary" : "border-muted-foreground/50 bg-background"}`}
                    >
                      {checked ? (
                        <Icon
                          className="size-4 text-primary-foreground"
                          name="Check"
                        />
                      ) : null}
                    </View>
                  </Pressable>
                )
              })}
            </View>

            {createRequest.error ? (
              <StatusBanner
                message={createRequest.error.message}
                title="Privacy request unavailable"
                tone="destructive"
              />
            ) : null}

            {privacyRequestId ? (
              <PrivacyRequestStatus
                fetching={status.isFetching}
                onRefresh={() => void status.refetch()}
                outcomes={status.data?.outcomes ?? []}
                readError={status.isError}
                status={status.data?.status ?? null}
              />
            ) : null}

            <Pressable
              accessibilityLabel={submitPresentation.label}
              accessibilityRole="button"
              accessibilityState={{ disabled: submitPresentation.disabled }}
              className="min-h-12 items-center justify-center rounded-full bg-primary px-5 disabled:opacity-50"
              disabled={submitPresentation.disabled}
              haptic
              onPress={() => void submit()}
            >
              <Text className="font-bold text-primary-foreground">
                {submitPresentation.label}
              </Text>
            </Pressable>
          </View>
        </BottomSheetKeyboardAwareScrollView>
      </Modal>
    </>
  )
}

function PrivacyRequestStatus({
  fetching,
  onRefresh,
  outcomes,
  readError,
  status,
}: {
  fetching: boolean
  onRefresh: () => void
  outcomes: Parameters<
    typeof projectCustomerConversationPrivacyRequestStatus
  >[0]["outcomes"]
  readError: boolean
  status: Parameters<
    typeof projectCustomerConversationPrivacyRequestStatus
  >[0]["status"]
}) {
  const presentation = projectCustomerConversationPrivacyRequestStatus({
    outcomes,
    readError,
    status,
  })

  return (
    <StatusBanner
      actionLabel={fetching ? undefined : "Refresh status"}
      message={presentation.detail}
      onActionPress={onRefresh}
      title={presentation.title}
      tone={presentation.tone}
    />
  )
}
