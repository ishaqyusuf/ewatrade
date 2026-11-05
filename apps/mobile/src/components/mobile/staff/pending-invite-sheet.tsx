import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/client"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useState } from "react"
import type { StaffRow } from "./staff-model"

/** Resend or cancel one pending invite (Workshop staff-invite-channels 01). */
export function usePendingInviteActions(storeId: string | undefined) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const modal = useModal()
  const [row, setRow] = useState<StaffRow | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const resend = useMutation(trpc.retailOps.inviteStaff.mutationOptions())
  const cancel = useMutation(
    trpc.retailOps.removeUnacceptedStaff.mutationOptions(),
  )
  const busy = resend.isPending || cancel.isPending

  async function finish(message: string) {
    modal.dismiss()
    setRow(null)
    setNotice(message)
    await queryClient
      .invalidateQueries(trpc.retailOps.staff.queryFilter())
      .catch(() => {})
  }

  return {
    modal,
    row,
    confirmCancel,
    notice,
    error,
    busy,
    open(next: StaffRow) {
      setRow(next)
      setConfirmCancel(false)
      setError(null)
      modal.present()
    },
    askCancel: () => setConfirmCancel(true),
    keep: () => setConfirmCancel(false),
    async resend() {
      if (!row || !storeId || busy) return
      setError(null)
      try {
        const result = await resend.mutateAsync({
          email: row.inviteEmail || undefined,
          phone: row.phoneE164 || undefined,
          name: row.name,
          role: "cashier",
          storeId,
          externalId: Crypto.randomUUID(),
        })
        const whatsapp = result.delivery.whatsapp
        await finish(
          !whatsapp || whatsapp === "SENT" || whatsapp === "LOCAL_ONLY"
            ? `Invite sent again to ${row.name}.`
            : `Invite renewed for ${row.name}, but WhatsApp couldn’t send it.`,
        )
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Couldn’t resend the invite.",
        )
      }
    },
    async cancel() {
      if (!row || busy) return
      setError(null)
      try {
        await cancel.mutateAsync({ membershipId: row.id })
        await finish(`Invite for ${row.name} cancelled.`)
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Couldn’t cancel the invite.",
        )
      }
    },
  }
}

function SheetOption({
  icon,
  label,
  detail,
  destructive,
  disabled,
  onPress,
}: {
  icon: IconKeys
  label: string
  detail?: string
  destructive?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  const largeText = useLargeTextLayout()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        "min-h-14 flex-row gap-3 px-5 py-3",
        largeText ? "items-start" : "items-center",
      )}
      disabled={disabled}
      haptic
      onPress={onPress}
    >
      <Icon
        className={cn(
          "size-[20px]",
          destructive ? "text-destructive" : "text-foreground",
        )}
        name={icon}
      />
      <View className="flex-1 gap-0.5">
        <Text
          className={cn(
            "text-base font-semibold",
            destructive ? "text-destructive" : "text-foreground",
          )}
        >
          {label}
        </Text>
        {detail ? (
          <Text className="text-sm text-muted-foreground">{detail}</Text>
        ) : null}
      </View>
    </Pressable>
  )
}

export function PendingInviteSheet({
  actions,
}: {
  actions: ReturnType<typeof usePendingInviteActions>
}) {
  const largeText = useLargeTextLayout()
  const { row } = actions
  const channels = row
    ? [
        row.phoneE164 ? "on WhatsApp" : null,
        row.inviteEmail ? "by email" : null,
      ]
        .filter(Boolean)
        .join(" and ")
    : ""
  return (
    <Modal
      accessibilityLabel={row ? `Invite for ${row.name}` : "Invite"}
      hideHeader
      ref={actions.modal.ref}
      snapPoints={[largeText ? "80%" : "44%"]}
    >
      <BottomSheetScrollView showsVerticalScrollIndicator={false}>
        {row ? (
          <View className="gap-1 pb-8">
            <View className="gap-1 px-5 pb-3">
              <Text className="text-xl font-extrabold text-foreground">
                {actions.confirmCancel
                  ? `Cancel ${row.name}’s invite?`
                  : row.name}
              </Text>
              <Text className="text-sm [-rn-line-height:22] text-muted-foreground">
                {actions.confirmCancel
                  ? "The invite link stops working. You can invite them again later."
                  : [row.phone, row.inviteEmail].filter(Boolean).join(" · ")}
              </Text>
            </View>
            {actions.error ? (
              <View className="px-5 pb-2">
                <StatusBanner
                  icon="TriangleAlert"
                  message={actions.error}
                  tone="warning"
                />
              </View>
            ) : null}
            {actions.confirmCancel ? (
              <>
                <SheetOption
                  icon="Ban"
                  label="Cancel invite"
                  destructive
                  disabled={actions.busy}
                  onPress={() => void actions.cancel()}
                />
                <SheetOption
                  icon="ArrowLeft"
                  label="Keep invite"
                  disabled={actions.busy}
                  onPress={actions.keep}
                />
              </>
            ) : (
              <>
                <SheetOption
                  icon="RefreshCw"
                  label="Resend invite"
                  detail={channels ? `Sends it again ${channels}.` : undefined}
                  disabled={actions.busy}
                  onPress={() => void actions.resend()}
                />
                <SheetOption
                  icon="Ban"
                  label="Cancel invite"
                  destructive
                  disabled={actions.busy}
                  onPress={actions.askCancel}
                />
              </>
            )}
          </View>
        ) : null}
      </BottomSheetScrollView>
    </Modal>
  )
}
