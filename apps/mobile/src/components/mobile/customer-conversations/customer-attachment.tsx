import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { View } from "@/components/ui/view"
import { getBaseUrl } from "@/lib/base-url"
import { useCustomerTRPC } from "@/trpc/customer-client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { useMutation } from "@tanstack/react-query"
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio"
import { MessageSquare, Pause, Play, RotateCw } from "lucide-react-native"
import { useEffect, useState } from "react"

type StoreConversationAttachmentProjection =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]["messages"][number]["attachments"][number]

const STATUS_COPY: Record<
  StoreConversationAttachmentProjection["state"],
  string
> = {
  deleted: "No longer available",
  pending: "Safety review in progress",
  quarantined: "Store review required",
  rejected: "Could not be accepted",
  retryable: "Needs another upload",
  safe: "Delivered privately",
}

export function CustomerAttachment({
  attachment,
  conversationId,
  customer,
  onRecover,
  publicToken,
}: {
  attachment: StoreConversationAttachmentProjection
  conversationId: string
  customer: boolean
  onRecover?: () => void
  publicToken: string
}) {
  const trpc = useCustomerTRPC()
  const player = useAudioPlayer(null)
  const playerStatus = useAudioPlayerStatus(player)
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)
  const authorize = useMutation(
    trpc.serviceCommerce.authorizeMobileStoreConversationVoiceNote.mutationOptions(
      {
        onSuccess: (grant) => {
          const source = grant.url.startsWith("/")
            ? `${getBaseUrl()}${grant.url}`
            : grant.url
          player.replace(source)
          setExpiresAt(grant.expiresAt)
          player.play()
        },
      },
    ),
  )

  useEffect(() => {
    if (!expiresAt) return
    const timeout = setTimeout(
      () => {
        player.pause()
        player.replace(null)
        setExpiresAt(null)
      },
      Math.max(0, expiresAt.getTime() - Date.now()) + 50,
    )
    return () => clearTimeout(timeout)
  }, [expiresAt, player])

  function toggleVoice() {
    if (expiresAt && expiresAt > new Date()) {
      if (playerStatus.playing) player.pause()
      else player.play()
      return
    }
    authorize.mutate({
      conversationId,
      messageAttachmentId: attachment.id,
      publicToken,
    })
  }

  return (
    <View
      accessibilityLabel={`${attachment.label}. ${STATUS_COPY[attachment.state]}`}
      className={
        customer
          ? "flex-row items-center gap-1 self-end rounded-full border border-primary-foreground/25 bg-primary-foreground/10 p-1"
          : "flex-row items-center gap-1 self-start rounded-full border border-border bg-muted/40 p-1"
      }
    >
      <View
        className={
          customer
            ? "size-12 items-center justify-center rounded-full bg-primary-foreground/15"
            : "size-12 items-center justify-center rounded-full bg-background"
        }
      >
        {attachment.kind === "audio" ? (
          <Pressable
            accessibilityLabel={
              playerStatus.playing
                ? "Pause private voice note"
                : "Play private voice note"
            }
            accessibilityRole="button"
            className="size-12 items-center justify-center rounded-full"
            disabled={!attachment.viewable || authorize.isPending}
            onPress={toggleVoice}
          >
            <Icon
              as={playerStatus.playing ? Pause : Play}
              className={
                customer
                  ? "size-sm text-primary-foreground"
                  : "size-sm text-foreground"
              }
            />
          </Pressable>
        ) : (
          <Icon
            className={
              customer
                ? "size-sm text-primary-foreground"
                : "size-sm text-foreground"
            }
            name={attachment.kind === "image" ? "Camera" : "FileText"}
          />
        )}
      </View>
      {attachment.recovery && onRecover ? (
        <Pressable
          accessibilityLabel={
            attachment.recovery === "contact_store"
              ? "Message the Store about this attachment"
              : "Upload a replacement attachment"
          }
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full"
          onPress={onRecover}
        >
          <Icon
            as={
              attachment.recovery === "contact_store" ? MessageSquare : RotateCw
            }
            className={
              customer
                ? "size-sm text-primary-foreground"
                : "size-sm text-primary"
            }
          />
        </Pressable>
      ) : null}
      {authorize.isError ? (
        <View
          accessibilityLabel="Voice note unavailable. Reauthorize and try again."
          accessibilityLiveRegion="polite"
        />
      ) : null}
    </View>
  )
}
