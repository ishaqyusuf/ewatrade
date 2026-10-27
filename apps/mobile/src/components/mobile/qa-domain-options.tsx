import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useQaAccelerator } from "@/hooks/use-qa-accelerator"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useEffect, useState } from "react"
import { QaBuildDetails } from "./qa-build-details"

/** Both chooser sizes use one overflow owner; runtime proof stays visible on demand. */
export function QaDomainOptions({ onLeave }: { onLeave?: () => void }) {
  const qa = useQaAccelerator()
  const modal = useModal()
  const [details, setDetails] = useState(false)
  const available =
    qa.clientEnabled && qa.capabilityAvailable && !!qa.authorization
  useEffect(() => {
    if (!available) modal.dismiss()
  }, [available, modal.dismiss])
  if (!available) return null

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="QA domain options"
        className="size-11 items-center justify-center"
        disabled={qa.isSelecting}
        onPress={() => {
          setDetails(false)
          modal.present()
        }}
      >
        <Icon name="more" size={22} />
      </Pressable>
      <Modal
        ref={modal.ref}
        title={details ? "Build details" : "QA domain options"}
        stackBehavior="push"
        enableDynamicSizing
        maxDynamicContentSize={480}
        onDismiss={() => setDetails(false)}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 16 }}>
          {details ? (
            <>
              <QaBuildDetails />
              <Option label="Back to QA businesses" onPress={modal.dismiss} />
            </>
          ) : (
            <View>
              <Option
                label={qa.profilesLoading ? "Refreshing…" : "Refresh list"}
                disabled={qa.profilesLoading}
                onPress={() => {
                  modal.dismiss()
                  void qa.refreshProfiles()
                }}
              />
              <Option label="Build details" onPress={() => setDetails(true)} />
              <Option
                label="Change QA domain"
                onPress={() => {
                  modal.dismiss()
                  onLeave?.()
                  void qa.clearQaData().then(qa.openAuthorizationSheet)
                }}
              />
              <Option
                label="Clear QA data"
                destructive
                onPress={() => {
                  modal.dismiss()
                  onLeave?.()
                  void qa.clearQaData()
                }}
              />
            </View>
          )}
        </BottomSheetScrollView>
      </Modal>
    </>
  )
}

function Option({
  label,
  onPress,
  disabled,
  destructive,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-12 justify-center border-b border-border px-5 py-3 active:bg-accent"
      disabled={disabled}
      onPress={onPress}
    >
      <Text
        className={
          destructive
            ? "text-[16px] [-rn-line-height:22] text-destructive"
            : "text-[16px] [-rn-line-height:22] text-foreground"
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}
