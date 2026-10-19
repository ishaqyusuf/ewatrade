import { ActionButton } from "@/components/mobile/action-button"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { BottomSheetView } from "@gorhom/bottom-sheet"
import { useRouter } from "expo-router"
import { useEffect, useRef } from "react"

/**
 * Lock explanation (Workshop mobile/attachment-locks 01): why attachments
 * aren't available on the Free plan and one allowed next step. Owners and
 * admins can open the existing plan information (no purchase); other staff
 * are told to ask their owner. It never opens a picker or camera. See plans
 * runs only while this sheet is still open for an owner/admin, and through
 * `onSeePlans` (the entitlement hook's session check) when given.
 */
export function AttachmentLockSheet({
  open,
  canSeePlans,
  surface,
  onClose,
  onSeePlans,
  onPromptAction,
}: {
  open: boolean
  canSeePlans: boolean
  surface: "order" | "service"
  onClose: () => void
  onSeePlans?: (go: () => void) => void
  /** The user's own Close/OK or swipe-away; never a programmatic close. */
  onPromptAction?: (action: "ask_owner" | "dismiss") => void
}) {
  const modal = useModal()
  const router = useRouter()
  const latest = useRef({ open, canSeePlans })
  latest.current = { open, canSeePlans }
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (open) modal.present()
    else modal.dismiss()
  }, [open, modal.present, modal.dismiss])
  const what =
    surface === "order"
      ? "Photos, videos and documents"
      : "Photo and video evidence"
  return (
    <Modal
      ref={modal.ref}
      onDismiss={() => {
        // Still open here means the person swiped it away.
        if (mounted.current && latest.current.open) onPromptAction?.("dismiss")
        onClose()
      }}
      title="On paid plans"
    >
      <BottomSheetView
        style={{ gap: 12, paddingBottom: 28, paddingHorizontal: 20 }}
      >
        <View className="size-12 items-center justify-center rounded-2xl bg-tint-amber">
          <Icon
            className="size-[22px] text-tint-amber-foreground"
            name="Lock"
          />
        </View>
        <Text
          accessibilityRole="header"
          className="text-[19px] font-extrabold tracking-[-0.4px] text-foreground"
        >
          {what} are on paid plans
        </Text>
        <Text className="text-sm [-rn-line-height:22] text-muted-foreground">
          {canSeePlans
            ? `Your business is on the Free plan. Paid plans let your team attach ${surface === "order" ? "photos, videos and PDFs to sales" : "photo and video evidence to Service work"}. Notes keep working on every plan.`
            : "Your business is on the Free plan, so attachments aren't available. Ask your owner if your team needs them. Notes keep working."}
        </Text>
        <View className="gap-2">
          {canSeePlans ? (
            <ActionButton
              icon="Layers"
              onPress={() => {
                // A press retained from an earlier render does nothing.
                if (
                  !mounted.current ||
                  !latest.current.open ||
                  !latest.current.canSeePlans
                )
                  return
                const go = () => {
                  onClose()
                  router.push("/subscription-modal" as never)
                }
                if (onSeePlans) onSeePlans(go)
                else go()
              }}
            >
              See plans
            </ActionButton>
          ) : null}
          <ActionButton
            onPress={() => {
              if (mounted.current && latest.current.open)
                onPromptAction?.(
                  latest.current.canSeePlans ? "dismiss" : "ask_owner",
                )
              onClose()
            }}
            tone="soft"
          >
            {canSeePlans ? "Close" : "OK"}
          </ActionButton>
        </View>
      </BottomSheetView>
    </Modal>
  )
}
