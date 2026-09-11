import { Modal, useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { BottomSheetFlatList } from "@gorhom/bottom-sheet"
import { useEffect, useRef, useState } from "react"
import { Keyboard, useWindowDimensions } from "react-native"
import { ServiceAction } from "./service-action"
import { textLabel } from "./service-jobs-model"
import { useServiceAppearance } from "./use-service-appearance"
import type { ServiceJobsModel } from "./use-service-jobs"

export type ServiceHistoryKind = "notes" | "evidence" | "pending"
export function useServiceHistory() {
  const modal = useModal()
  const [kind, setKind] = useState<ServiceHistoryKind | null>(null)
  const current = useRef<ServiceHistoryKind | null>(null)
  useEffect(() => {
    if (kind) modal.present()
  }, [kind, modal.present])
  function open(value: ServiceHistoryKind) {
    if (current.current) return
    current.current = value
    setKind(value)
    Keyboard.dismiss()
  }
  function afterDismiss() {
    current.current = null
    setKind(null)
  }
  return { modal, kind, open, afterDismiss }
}

type RecordRow = {
  id: string
  title: string
  detail: string
  removable: boolean
}
export function ServiceHistorySheet({ model }: { model: ServiceJobsModel }) {
  const { market } = useServiceAppearance()
  const { height } = useWindowDimensions()
  const history = model.history
  const rows: RecordRow[] =
    model.scopeChanged || !model.canOperate
      ? []
      : history.kind === "pending"
        ? model.pendingIntakeEvidence.map((entry) => ({
            id: entry.clientEvidenceId,
            title: entry.label,
            detail: "Private · On this device · Not submitted",
            removable: true,
          }))
        : history.kind === "notes"
          ? (model.selectedJob?.notes ?? []).map((entry) => ({
              id: entry.id,
              title: entry.body,
              detail: "Internal note",
              removable: false,
            }))
          : (model.selectedJob?.evidence ?? []).map((entry) => ({
              id: entry.id,
              title: entry.label || textLabel(entry.purpose),
              detail: `${textLabel(entry.mediaType)} · ${textLabel(entry.uploadStatus)} · Private work record`,
              removable: false,
            }))
  const title =
    history.kind === "pending"
      ? "Intake attachments"
      : history.kind === "notes"
        ? "Internal notes"
        : "Private evidence"
  return (
    <Modal
      ref={history.modal.ref}
      title={title}
      snapPoints={["65%"]}
      enableDynamicSizing={false}
      maxDynamicContentSize={height * 0.85}
      onDismiss={history.afterDismiss}
    >
      <BottomSheetFlatList<RecordRow>
        data={rows}
        keyExtractor={(row) => row.id}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        ListHeaderComponent={
          <Text
            className={
              market
                ? "px-5 pb-4 text-xs text-market-muted-ink"
                : "px-5 pb-4 text-xs text-muted-foreground"
            }
          >
            {rows.length} loaded{" "}
            {history.kind === "notes" ? "notes" : "attachments"}.{" "}
            {history.kind === "pending"
              ? "Removing an unsubmitted attachment also removes its retained device file."
              : "This is the loaded private work record, not a public customer page."}
          </Text>
        }
        ListEmptyComponent={
          <Text
            className={
              market ? "px-5 py-5 text-market-ink" : "px-5 py-5 text-foreground"
            }
          >
            {model.scopeChanged
              ? "Return to the original account and Store to view these records."
              : "No loaded records."}
          </Text>
        }
        renderItem={({ item }) => (
          <View
            className={
              market
                ? "mx-5 gap-3 border-b border-market-line py-4"
                : "mx-5 gap-3 border-b border-border py-4"
            }
          >
            <Text
              className={
                market ? "text-sm text-market-ink" : "text-sm text-foreground"
              }
            >
              {item.title}
            </Text>
            <Text
              className={
                market
                  ? "text-xs text-market-muted-ink"
                  : "text-xs text-muted-foreground"
              }
            >
              {item.detail}
            </Text>
            {item.removable ? (
              <ServiceAction
                variant="outline"
                disabled={
                  !model.command.canAct() ||
                  model.captureBusy ||
                  model.command.locked
                }
                onPress={() => model.removePendingEvidence(item.id)}
              >
                Remove attachment
              </ServiceAction>
            ) : null}
          </View>
        )}
        ListFooterComponent={
          <View className="px-5 pb-10 pt-5">
            <ServiceAction variant="outline" onPress={history.modal.dismiss}>
              Done
            </ServiceAction>
          </View>
        }
      />
    </Modal>
  )
}
