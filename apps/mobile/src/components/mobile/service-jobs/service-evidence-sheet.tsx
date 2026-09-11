import { Modal, useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useEffect, useRef, useState } from "react"
import { Keyboard, useWindowDimensions } from "react-native"
import { ServiceAction } from "./service-action"
import type { WorkJob } from "./service-jobs-model"
import { useServiceAppearance } from "./use-service-appearance"

type EvidenceKind = "photo" | "video"
export function useServiceEvidenceChooser(
  onCapture: (job: WorkJob, media: EvidenceKind) => void,
) {
  const modal = useModal()
  const [job, setJob] = useState<WorkJob | null>(null)
  const current = useRef<WorkJob | null>(null)
  const pending = useRef<EvidenceKind | null>(null)
  useEffect(() => {
    if (job) modal.present()
  }, [job, modal.present])
  function open(value: WorkJob) {
    if (current.current) return
    current.current = value
    setJob(value)
    Keyboard.dismiss()
  }
  function choose(media: EvidenceKind) {
    if (!current.current || pending.current) return
    pending.current = media
    modal.dismiss()
  }
  function afterDismiss() {
    const value = current.current
    const media = pending.current
    current.current = null
    pending.current = null
    setJob(null)
    if (value && media) onCapture(value, media)
  }
  return { modal, job, open, choose, afterDismiss }
}

export function ServiceEvidenceSheet({
  chooser,
  allowed,
  scopeChanged,
}: {
  chooser: ReturnType<typeof useServiceEvidenceChooser>
  allowed: boolean
  scopeChanged: boolean
}) {
  const { market } = useServiceAppearance()
  const { height } = useWindowDimensions()
  return (
    <Modal
      ref={chooser.modal.ref}
      title="Private work evidence"
      snapPoints={[]}
      enableDynamicSizing
      maxDynamicContentSize={height * 0.6}
      onDismiss={chooser.afterDismiss}
    >
      <BottomSheetScrollView keyboardShouldPersistTaps="handled">
        <View className="gap-4 px-5 pb-6 pt-2">
          <Text
            className={
              market
                ? "text-sm text-market-muted-ink"
                : "text-sm text-muted-foreground"
            }
          >
            {scopeChanged
              ? "Return to the original account and Store before continuing."
              : `${chooser.job?.orderNumber ?? ""} · Capture a photo or a video up to 60 seconds. The file stays private on this device; capture is not an upload or publication.`}
          </Text>
          <ServiceAction
            disabled={!allowed}
            onPress={() => chooser.choose("photo")}
          >
            Take photo
          </ServiceAction>
          <ServiceAction
            disabled={!allowed}
            variant="outline"
            onPress={() => chooser.choose("video")}
          >
            Record video
          </ServiceAction>
          <ServiceAction variant="ghost" onPress={chooser.modal.dismiss}>
            Cancel
          </ServiceAction>
        </View>
      </BottomSheetScrollView>
    </Modal>
  )
}
