import { AppBottomSheetBackdrop } from "@/components/app/bottom-sheet-backdrop"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  BottomSheetFooter,
  BottomSheetScrollView,
  type BottomSheetFooterProps,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { useCallback, useState } from "react"
import { useWindowDimensions } from "react-native"
import { ServiceAction } from "./service-action"
import { useServiceAppearance } from "./use-service-appearance"
import type { ServiceCommandModel } from "./use-service-command"

export function ServiceCommandReview({
  command,
}: { command: ServiceCommandModel }) {
  const { market } = useServiceAppearance()
  const { height } = useWindowDimensions()
  const [footerHeight, setFooterHeight] = useState(144)
  const accepted = command.isAccepted
  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <AppBottomSheetBackdrop {...props} dismissible={!command.pending} />
    ),
    [command.pending],
  )
  const footer = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <View
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          className={
            market
              ? "gap-2 border-t border-market-line bg-market-field px-5 pb-5 pt-3"
              : "gap-2 border-t border-border bg-card px-5 pb-5 pt-3"
          }
        >
          {accepted ? (
            <ServiceAction
              onPress={command.dismiss}
              isLoading={command.pending}
              loadingLabel="Finishing follow-up"
            >
              Done
            </ServiceAction>
          ) : (
            <>
              <ServiceAction
                disabled={!command.canAct(command.review?.kind === "message")}
                isLoading={command.pending}
                loadingLabel="Confirming"
                onPress={() => void command.confirm()}
              >
                {command.hasAttempt ? "Retry same action" : "Confirm action"}
              </ServiceAction>
              <ServiceAction
                variant="outline"
                disabled={command.pending}
                onPress={command.dismiss}
              >
                {command.hasAttempt ? "Close review" : "Back to edit"}
              </ServiceAction>
            </>
          )}
        </View>
      </BottomSheetFooter>
    ),
    [accepted, command, market],
  )
  const ink = market ? "text-market-ink" : "text-foreground"
  const muted = market ? "text-market-muted-ink" : "text-muted-foreground"
  return (
    <Modal
      ref={command.modal.ref}
      snapPoints={["44%"]}
      enableDynamicSizing
      maxDynamicContentSize={height * 0.64}
      title={command.review?.title ?? "Review action"}
      backdropComponent={backdrop}
      enablePanDownToClose={!command.pending}
      onDismiss={command.afterDismiss}
      footerComponent={footer}
    >
      <VariableContextProvider
        value={{ "--service-review-footer": footerHeight + 16 }}
      >
        <BottomSheetScrollView keyboardShouldPersistTaps="handled">
          <View className="gap-4 px-5 pt-2 pb-[var(--service-review-footer)]">
            {command.scopeChanged ? (
              <StatusBanner
                icon="Lock"
                title="Workspace changed"
                message="Return to the original account and Store to review this action."
                tone="warning"
              />
            ) : (
              command.review?.facts.map((fact, index) => (
                <View key={index} className="gap-1">
                  <Text className={muted + " text-xs font-semibold"}>
                    {fact.label}
                  </Text>
                  <Text
                    className={ink + " text-sm font-bold [-rn-line-height:21]"}
                  >
                    {fact.value}
                  </Text>
                </View>
              ))
            )}
            {command.error ? (
              <StatusBanner
                icon="AlertCircle"
                title="Action not confirmed"
                message={command.error}
                tone="destructive"
              />
            ) : null}
            {accepted && command.notice ? (
              <StatusBanner
                icon="CircleCheck"
                title="Accepted"
                message={command.notice}
                tone="success"
              />
            ) : null}
            {!accepted ? (
              <Text className={muted + " text-xs [-rn-line-height:19]"}>
                {command.hasAttempt
                  ? "The reviewed payload stays locked. Retry the same action. Leaving this workflow loses the in-memory retry handle; reconcile the record before entering another command."
                  : "Check these facts before confirming. The server rechecks permissions and current business rules."}
              </Text>
            ) : null}
          </View>
        </BottomSheetScrollView>
      </VariableContextProvider>
    </Modal>
  )
}
