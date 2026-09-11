import {
  getCustomerConversationSoundEnabled,
  setCustomerConversationSoundEnabled,
} from "@/lib/customer-conversation-alert-preference"
import { updateCustomerConversationExpiry } from "@/lib/customer-conversation-store"
import { useCustomerTRPC } from "@/trpc/customer-client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  drainMountedStoreConversationActionRecovery,
  latestStoreConversationSequence,
  mergeStoreConversationActionMessageUpdates,
} from "@ewatrade/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  type AudioPlayer,
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio"
import * as Crypto from "expo-crypto"
import { File, Paths } from "expo-file-system"
import { useCallback, useEffect, useRef, useState } from "react"
import { AppState } from "react-native"

type Message =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]["messages"][number]
type Availability =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationMessagesAfter"]["availability"]
type ChannelMode =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationMessagesAfter"]["channelMode"]
type ActionMessageUpdate =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationMessagesAfter"]["actionMessageUpdates"][number]
type Moderation =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationMessagesAfter"]["moderation"]

function createForegroundAlertWave() {
  const sampleRate = 8_000
  const sampleCount = 1_200
  const bytes = new Uint8Array(44 + sampleCount * 2)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }
  text(0, "RIFF")
  view.setUint32(4, 36 + sampleCount * 2, true)
  text(8, "WAVEfmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, "data")
  view.setUint32(40, sampleCount * 2, true)
  for (let index = 0; index < sampleCount; index += 1) {
    const frequency = index < sampleCount / 2 ? 660 : 880
    const envelope = Math.max(0, 1 - index / sampleCount)
    const sample = Math.round(
      5_000 *
        envelope *
        Math.sin((2 * Math.PI * frequency * index) / sampleRate),
    )
    view.setInt16(44 + index * 2, sample, true)
  }
  return bytes
}

function ensureAlertPlayer(
  playerRef: React.MutableRefObject<AudioPlayer | null>,
) {
  if (playerRef.current) return playerRef.current
  const file = new File(Paths.cache, "store-conversation-alert.wav")
  if (!file.exists) file.write(createForegroundAlertWave())
  playerRef.current = createAudioPlayer(file.uri)
  playerRef.current.volume = 0.25
  return playerRef.current
}

async function prepareForegroundAlertAudio(
  playerRef: React.MutableRefObject<AudioPlayer | null>,
) {
  await setAudioModeAsync({
    allowsRecording: false,
    interruptionMode: "mixWithOthers",
    playsInSilentMode: false,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
  })
  ensureAlertPlayer(playerRef)
}

export function useCustomerRealtime(input: {
  accountAccess: boolean
  conversationId: string | null
  messages: Message[]
  onAvailability: (availability: Availability) => void
  onChannelMode: (channelMode: ChannelMode) => void
  onMessages: (
    messages: Message[],
    actionMessageUpdates: ActionMessageUpdate[],
  ) => void
  onModeration: (moderation: Moderation) => void
  onNotice: (message: string) => void
  publicToken: string | null
}) {
  const trpc = useCustomerTRPC()
  const queryClient = useQueryClient()
  const messagesRef = useRef(input.messages)
  messagesRef.current = input.messages
  const scopeRef = useRef(
    `${input.accountAccess}:${input.publicToken}:${input.conversationId}`,
  )
  scopeRef.current = `${input.accountAccess}:${input.publicToken}:${input.conversationId}`
  const operationRef = useRef<{ id: string; sequence: number } | null>(null)
  const acknowledgedRef = useRef(0)
  const pollingRef = useRef(false)
  const queuedPollRef = useRef(false)
  const playerRef = useRef<AudioPlayer | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const soundEnabledRef = useRef(false)

  const acknowledgeGuest = useMutation(
    trpc.serviceCommerce.acknowledgeMobileStoreConversationProgress.mutationOptions(),
  )
  const acknowledgeAccount = useMutation(
    trpc.serviceCommerce.acknowledgeAccountStoreConversationProgress.mutationOptions(),
  )
  const acknowledge = input.accountAccess
    ? acknowledgeAccount
    : acknowledgeGuest

  useEffect(() => {
    let active = true
    void getCustomerConversationSoundEnabled().then(async (enabled) => {
      if (!active) return
      soundEnabledRef.current = enabled
      setSoundEnabled(enabled)
      if (enabled) await prepareForegroundAlertAudio(playerRef)
    })
    return () => {
      active = false
      playerRef.current?.remove()
      playerRef.current = null
    }
  }, [])

  const setSound = useCallback(async (enabled: boolean) => {
    soundEnabledRef.current = enabled
    setSoundEnabled(enabled)
    await setCustomerConversationSoundEnabled(enabled)
    if (enabled) {
      await prepareForegroundAlertAudio(playerRef)
    }
  }, [])

  const poll = useCallback(async () => {
    if (pollingRef.current) {
      queuedPollRef.current = true
      return
    }
    if (
      AppState.currentState !== "active" ||
      !input.conversationId ||
      !input.publicToken
    )
      return
    pollingRef.current = true
    const scope = `${input.accountAccess}:${input.publicToken}:${input.conversationId}`
    try {
      const afterSequence = latestStoreConversationSequence(messagesRef.current)
      const actionMessageIds = messagesRef.current
        .filter((message) => Boolean(message.actionMessage))
        .map((message) => message.id)
      const actionMessageUpdates: ActionMessageUpdate[] = []
      let availability: Availability | null = null
      let channelMode: ChannelMode | null = null
      let moderation: Moderation | null = null
      const recovery =
        await drainMountedStoreConversationActionRecovery<Message>({
          actionMessageIds,
          afterSequence,
          fetchPage: async (batch, cursor) => {
            const pageInput = {
              actionMessageIds: batch,
              afterSequence: cursor,
              conversationId: input.conversationId as string,
              limit: 100,
              publicToken: input.publicToken as string,
            }
            const page = input.accountAccess
              ? await queryClient.fetchQuery(
                  trpc.serviceCommerce.accountStoreConversationMessagesAfter.queryOptions(
                    pageInput,
                    { staleTime: 0 },
                  ),
                )
              : await queryClient.fetchQuery(
                  trpc.serviceCommerce.mobileStoreConversationMessagesAfter.queryOptions(
                    pageInput,
                    { staleTime: 0 },
                  ),
                )
            if ("credentialExpiresAt" in page) {
              updateCustomerConversationExpiry(page.credentialExpiresAt)
            }
            availability = page.availability
            channelMode = page.channelMode
            moderation = page.moderation
            actionMessageUpdates.push(...page.actionMessageUpdates)
            return page
          },
          sequenceOf: (message) => message.sequence,
        })
      if (scopeRef.current !== scope) return
      if (availability) input.onAvailability(availability)
      if (channelMode) input.onChannelMode(channelMode)
      if (moderation) input.onModeration(moderation)
      if (recovery.messages.length > 0 || actionMessageUpdates.length > 0) {
        if (scopeRef.current !== scope) return
        input.onMessages(recovery.messages, actionMessageUpdates)
        if (
          recovery.messages.some(
            (message) => message.author.kind === "store_attendant",
          )
        ) {
          const shouldPlaySound = soundEnabledRef.current
          if (shouldPlaySound) {
            const player = ensureAlertPlayer(playerRef)
            void player.seekTo(0).then(() => player.play())
          }
          input.onNotice(
            shouldPlaySound
              ? "New response from the Store. Sound alert is enabled."
              : "New response from the Store.",
          )
        }
      }
      const sequence = Math.max(afterSequence, recovery.throughSequence)
      if (sequence <= acknowledgedRef.current) return
      if (scopeRef.current !== scope) return
      const operation =
        operationRef.current?.sequence === sequence
          ? operationRef.current
          : { id: Crypto.randomUUID(), sequence }
      operationRef.current = operation
      const progress = await acknowledge.mutateAsync({
        clientOperationId: operation.id,
        conversationId: input.conversationId,
        deliveredThroughSequence: sequence,
        publicToken: input.publicToken,
        readThroughSequence: sequence,
      })
      if (scopeRef.current !== scope) return
      if ("credentialExpiresAt" in progress) {
        updateCustomerConversationExpiry(progress.credentialExpiresAt)
      }
      acknowledgedRef.current = sequence
      operationRef.current = null
    } catch {
      if (scopeRef.current !== scope) return
      input.onNotice("Reconnecting. Messages already shown remain available.")
    } finally {
      pollingRef.current = false
      if (queuedPollRef.current) {
        queuedPollRef.current = false
        queueMicrotask(() => void poll())
      }
    }
  }, [
    acknowledge.mutateAsync,
    input.accountAccess,
    input.conversationId,
    input.onAvailability,
    input.onChannelMode,
    input.onMessages,
    input.onNotice,
    input.publicToken,
    queryClient,
    trpc,
  ])

  useEffect(() => {
    if (!input.conversationId || !input.publicToken) return
    acknowledgedRef.current = 0
    operationRef.current = null
    queuedPollRef.current = false
    const interval = setInterval(() => void poll(), 5_000)
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void poll()
    })
    void poll()
    return () => {
      clearInterval(interval)
      subscription.remove()
    }
  }, [input.conversationId, input.publicToken, poll])

  return { setSound, soundEnabled }
}
