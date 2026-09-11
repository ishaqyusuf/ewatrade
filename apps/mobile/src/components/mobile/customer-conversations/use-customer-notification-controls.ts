import { useCustomerTRPC } from "@/trpc/customer-client"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { type SetStateAction, useRef, useState } from "react"

import type { CustomerNotificationGuestChannel } from "./customer-notification-guest-presentation"
import { refreshCustomerNotificationSettingsWhenExpanded } from "./customer-notification-refresh"

export function useCustomerNotificationControls({
  accountAccess,
  conversationId,
  onNotice,
  publicToken,
}: {
  accountAccess: boolean
  conversationId: string
  onNotice(message: string): void
  publicToken: string
}) {
  const trpc = useCustomerTRPC()
  const [expanded, setExpandedState] = useState(false)
  const expandedRef = useRef(false)
  const [channel, setChannel] =
    useState<CustomerNotificationGuestChannel>("email")
  const [consented, setConsented] = useState(false)
  const [destination, setDestination] = useState("")
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const contacts = useQuery({
    ...trpc.serviceCommerce.listMobileStoreConversationNotificationContacts.queryOptions(
      { conversationId, publicToken },
    ),
    enabled: !accountAccess && expanded,
  })
  const preference = useQuery({
    ...trpc.serviceCommerce.accountStoreConversationNotificationPreference.queryOptions(),
    enabled: accountAccess && expanded,
  })
  const requestVerification = useMutation(
    trpc.serviceCommerce.requestMobileStoreConversationNotificationVerification.mutationOptions(),
  )
  const confirmVerification = useMutation(
    trpc.serviceCommerce.confirmMobileStoreConversationNotificationContact.mutationOptions(),
  )
  const revokeContact = useMutation(
    trpc.serviceCommerce.revokeMobileStoreConversationNotificationContact.mutationOptions(),
  )
  const updatePreference = useMutation(
    trpc.serviceCommerce.updateAccountStoreConversationNotificationPreference.mutationOptions(),
  )
  const subscribeReopening = useMutation(
    accountAccess
      ? trpc.serviceCommerce.subscribeAccountStoreConversationReopening.mutationOptions()
      : trpc.serviceCommerce.subscribeMobileStoreConversationReopening.mutationOptions(),
  )
  const busy =
    requestVerification.isPending ||
    confirmVerification.isPending ||
    revokeContact.isPending ||
    updatePreference.isPending ||
    subscribeReopening.isPending

  async function requestCode() {
    if (!consented || !destination.trim()) return
    try {
      const result = await requestVerification.mutateAsync({
        channel,
        clientOperationId: Crypto.randomUUID(),
        consentAccepted: true,
        conversationId,
        destination: destination.trim(),
        publicToken,
      })
      setVerificationId(result.verificationId)
      setCode("")
      onNotice(`Verification code sent to ${result.contact.maskedDestination}.`)
      await refreshCustomerNotificationSettingsWhenExpanded({
        expanded: expandedRef.current,
        refetch: contacts.refetch,
      })
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : "Verification could not be started.",
      )
    }
  }

  async function confirmCode() {
    if (!verificationId || code.trim().length !== 6) return
    try {
      await confirmVerification.mutateAsync({
        clientOperationId: Crypto.randomUUID(),
        code: code.trim(),
        conversationId,
        publicToken,
        verificationId,
      })
      setCode("")
      setVerificationId(null)
      onNotice(
        `${channel === "email" ? "Email" : "Phone"} notifications are ready for this Store conversation.`,
      )
      await refreshCustomerNotificationSettingsWhenExpanded({
        expanded: expandedRef.current,
        refetch: contacts.refetch,
      })
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : "The verification code could not be confirmed.",
      )
    }
  }

  async function notifyWhenAvailable() {
    try {
      await subscribeReopening.mutateAsync({
        clientOperationId: Crypto.randomUUID(),
        confirmed: true,
        conversationId,
        publicToken,
      })
      onNotice("You will be notified when this Store chat is available.")
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : "Reopening notification could not be saved.",
      )
    }
  }

  async function removeContact(contactId: string) {
    try {
      await revokeContact.mutateAsync({
        clientOperationId: Crypto.randomUUID(),
        confirmed: true,
        contactId,
        conversationId,
        publicToken,
      })
      await refreshCustomerNotificationSettingsWhenExpanded({
        expanded: expandedRef.current,
        refetch: contacts.refetch,
      })
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : "Notification contact could not be removed.",
      )
    }
  }

  function changeChannel(nextChannel: CustomerNotificationGuestChannel) {
    setChannel(nextChannel)
    setDestination("")
    setConsented(false)
  }

  function changeContact() {
    setCode("")
    setVerificationId(null)
  }

  function setExpanded(nextExpanded: SetStateAction<boolean>) {
    const resolvedExpanded =
      typeof nextExpanded === "function"
        ? nextExpanded(expandedRef.current)
        : nextExpanded
    expandedRef.current = resolvedExpanded
    setExpandedState(resolvedExpanded)
  }

  async function savePreference(input: {
    orderedChannels: Array<"email" | "push" | "whatsapp">
    reopeningEnabled: boolean
    unreadEnabled: boolean
  }) {
    try {
      await updatePreference.mutateAsync({
        clientOperationId: Crypto.randomUUID(),
        ...input,
      })
      await refreshCustomerNotificationSettingsWhenExpanded({
        expanded: expandedRef.current,
        refetch: preference.refetch,
      })
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : "Notification preference was not saved.",
      )
    }
  }

  return {
    busy,
    channel,
    changeChannel,
    changeContact,
    code,
    consented,
    contacts,
    destination,
    expanded,
    notifyWhenAvailable,
    preference,
    removeContact,
    requestCode,
    savePreference,
    setCode,
    setConsented,
    setDestination,
    setExpanded,
    verificationId,
    confirmCode,
  }
}
