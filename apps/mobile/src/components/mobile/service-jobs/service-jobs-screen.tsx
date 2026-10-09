import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { DetailSkeleton } from "@/components/mobile/loading-skeletons"
import { StatusBanner } from "@/components/mobile/status-banner"
import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"
import { View } from "@/components/ui/view"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { VariableContextProvider } from "nativewind"
import { useRef, useState } from "react"
import { Keyboard, type ScrollView } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ListCreateFab } from "../list-create-fab"
import { ServiceAction } from "./service-action"
import { ServiceCommandReview } from "./service-command-review"
import { ServiceEvidenceSheet } from "./service-evidence-sheet"
import { ServiceHistorySheet } from "./service-history-sheet"
import { ServiceIntakeForm } from "./service-intake-form"
import { ServiceJobWorkspace } from "./service-job-workspace"
import type { ServiceJobsProps } from "./service-jobs-model"
import { ServiceJobsQueue } from "./service-jobs-queue"
import { ServicePaymentSheet } from "./service-payment-sheet"
import { ServiceStatusSheet } from "./service-status-sheet"
import { ServiceTextSheet } from "./service-text-sheet"
import { useServiceAppearance } from "./use-service-appearance"
import { useServiceJobs } from "./use-service-jobs"

export function ServiceJobsChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} screen="service-jobs" />
}

export function ServiceJobsContent(_props: ServiceJobsProps = {}) {
  const model = useServiceJobs()
  const { market } = useServiceAppearance()
  const scroll = useRef<ScrollView>(null)
  const intakeTop = useRef(0)
  const choicesTop = useRef(0)
  const workspaceTop = useRef(0)
  const linesTop = useRef(0)
  const [footerHeight, setFooterHeight] = useState(88)
  const scrollHide = useBottomSearchScroll()
  const insets = useSafeAreaInsets()
  const {
    creating,
    selectedJob,
    selectedJobId,
    error,
    notice,
    isOfflineMode,
    jobsQuery,
    jobs,
    showQueueSearch,
    search,
    setSearch,
  } = model
  const feedback = (
    <>
      {error ? (
        <StatusBanner
          icon="AlertCircle"
          message={error}
          title="Could not complete action"
          tone="destructive"
        />
      ) : null}
      {notice ? (
        <StatusBanner
          icon="ClipboardCheck"
          message={notice}
          title="Service work"
          tone="success"
        />
      ) : null}
      {isOfflineMode ? (
        <StatusBanner
          icon="Lock"
          message="Cached work can be viewed. Reconnect to create or update Services."
          title="Online connection required"
          tone="warning"
        />
      ) : null}
      {model.attachmentCount ? (
        <View className="gap-3">
          <StatusBanner
            icon="Info"
            title="Evidence needs attention"
            message={`${model.attachmentCount} private attachment(s) are not confirmed. The order is already accepted.`}
          />
          <ServiceAction
            variant="outline"
            disabled={isOfflineMode || model.locked}
            isLoading={model.attachmentPosting}
            onPress={() => void model.retryAttachments()}
          >
            Retry evidence attachments
          </ServiceAction>
        </View>
      ) : null}
      {selectedJobId && model.jobQuery.isError ? (
        <View className="gap-3">
          <StatusBanner
            icon="AlertCircle"
            title="Could not reload this job"
            message={model.jobQuery.error.message}
            tone="destructive"
          />
          <ServiceAction
            variant="outline"
            disabled={isOfflineMode}
            onPress={() => void model.jobQuery.refetch()}
          >
            Retry job
          </ServiceAction>
        </View>
      ) : null}
    </>
  )
  const blocked = model.scopeChanged || !model.canOperate || !model.storeId
  // Classic keeps the queue search at the bottom with the gold New service
  // button above it, both hiding on scroll like the tab bar.
  const classicQueue = !market && !blocked && !creating && !selectedJobId
  return (
    <VariableContextProvider
      value={{
        "--service-jobs-bottom":
          showQueueSearch || classicQueue ? footerHeight + 24 : 48,
      }}
    >
      <View
        className={market ? "flex-1 bg-market-canvas" : "flex-1 bg-background"}
      >
        {model.command.locked ? (
          <View className="gap-2 px-5 py-3">
            <ServiceAction
              disabled={model.command.pending}
              onPress={() => model.command.resume()}
            >
              {model.command.isAccepted
                ? "View accepted action"
                : model.command.hasAttempt
                  ? "Resume unconfirmed action"
                  : "Return to action review"}
            </ServiceAction>
          </View>
        ) : null}
        {blocked ? (
          <View className="gap-4 px-5 py-5">
            <StatusBanner
              icon={model.contextPending ? "Loader2" : "Lock"}
              title={
                model.scopeChanged
                  ? "Workspace changed"
                  : !model.canOperate
                    ? "Service access unavailable"
                    : "Current Store"
              }
              message={
                model.scopeChanged
                  ? "Return to the original account and Store, or close this workflow. Reconcile any unconfirmed action before starting it again."
                  : !model.canOperate
                    ? "You do not have permission to operate Service work."
                    : (model.contextError ??
                      (model.contextPending
                        ? "Loading workspace context."
                        : "Select a Store before operating Services."))
              }
              tone="warning"
            />
            {model.contextError && !model.scopeChanged && model.canOperate ? (
              <ServiceAction
                variant="outline"
                disabled={isOfflineMode || model.contextPending}
                onPress={() => void model.retryContext()}
              >
                Retry workspace
              </ServiceAction>
            ) : null}
          </View>
        ) : (
          <View
            className="flex-1"
            pointerEvents={model.locked ? "none" : "auto"}
            accessibilityElementsHidden={
              model.command.locked ||
              Boolean(model.statusEditor.draft) ||
              Boolean(model.paymentEditor.draft) ||
              Boolean(model.textEditor.draft) ||
              Boolean(model.evidenceChooser.job) ||
              Boolean(model.history.kind)
            }
            importantForAccessibility={
              model.command.locked ||
              model.statusEditor.draft ||
              model.paymentEditor.draft ||
              model.textEditor.draft ||
              model.evidenceChooser.job ||
              model.history.kind
                ? "no-hide-descendants"
                : "auto"
            }
          >
            {creating || selectedJobId ? (
              <KeyboardAwareScrollView
                ref={scroll}
                bottomOffset={12}
                extraKeyboardSpace={0}
                className="flex-1"
                disableScrollOnKeyboardHide
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
              >
                <View className="gap-5 px-5 pb-[var(--service-jobs-bottom)]">
                  {feedback}
                  {creating ? (
                    <View
                      onLayout={(event) => {
                        intakeTop.current = event.nativeEvent.layout.y
                      }}
                    >
                      <ServiceIntakeForm
                        model={model}
                        onChoicesLayout={(y) => {
                          choicesTop.current = y
                        }}
                        onPageChange={() => {
                          Keyboard.dismiss()
                          scroll.current?.scrollTo({
                            y: intakeTop.current + choicesTop.current,
                            animated: true,
                          })
                        }}
                      />
                    </View>
                  ) : selectedJob ? (
                    <View
                      onLayout={(event) => {
                        workspaceTop.current = event.nativeEvent.layout.y
                      }}
                    >
                      <ServiceJobWorkspace
                        model={model}
                        onLinesLayout={(y) => {
                          linesTop.current = y
                        }}
                        onPageChange={() => {
                          Keyboard.dismiss()
                          scroll.current?.scrollTo({
                            y: workspaceTop.current + linesTop.current,
                            animated: true,
                          })
                        }}
                      />
                    </View>
                  ) : model.jobQuery.isPending && !isOfflineMode ? (
                    <DetailSkeleton label="Loading the selected job" rows={3} />
                  ) : (
                    <View className="gap-4">
                      <StatusBanner
                        icon="Info"
                        title="Selected job"
                        message="This job is not available in the current Store or offline cache."
                      />
                      <ServiceAction
                        variant="outline"
                        onPress={() => model.setSelectedJobId(null)}
                      >
                        Back to work queue
                      </ServiceAction>
                    </View>
                  )}
                </View>
              </KeyboardAwareScrollView>
            ) : (
              <ServiceJobsQueue
                model={model}
                feedback={feedback}
                onScroll={scrollHide.onScroll}
              />
            )}
            {classicQueue ? (
              <>
                <ListCreateFab
                  accessibilityLabel={
                    isOfflineMode
                      ? "New service, needs a connection"
                      : "New service"
                  }
                  bottomOffset={
                    scrollHide.hidden && !search
                      ? 0
                      : Math.max(
                          0,
                          footerHeight + 14 - Math.max(insets.bottom + 16, 24),
                        )
                  }
                  disabled={isOfflineMode}
                  onPress={() => {
                    model.setAmountPaid("")
                    model.setPaymentReference("")
                    model.setCreating(true)
                  }}
                  testID="service-new-fab"
                  tone="gold"
                />
                <BottomSearchFooter
                  alwaysShowSearch
                  accessibilityLabel="Search service jobs"
                  hidden={scrollHide.hidden}
                  localSearch={isOfflineMode}
                  maxLength={160}
                  onChangeText={setSearch}
                  onHeightChange={setFooterHeight}
                  placeholder="Receipt, customer or service"
                  totalCount={jobs.length}
                  value={search}
                  variant="action-bar"
                />
              </>
            ) : null}
            {market && showQueueSearch ? (
              <BottomSearchFooter
                variant={market ? "market-day" : "default"}
                accessibilityLabel="Search service jobs"
                hidden={scrollHide.hidden}
                onHeightChange={setFooterHeight}
                localSearch={isOfflineMode}
                alwaysShowSearch
                maxLength={160}
                onChangeText={setSearch}
                placeholder="Receipt or service"
                totalCount={jobsQuery.data?.pages[0]?.totalCount ?? 0}
                value={search}
              />
            ) : null}
          </View>
        )}
        <ServiceCommandReview command={model.command} />
        <ServiceStatusSheet
          editor={model.statusEditor}
          allowed={model.command.canAct()}
          scopeChanged={model.scopeChanged}
        />
        <ServicePaymentSheet
          editor={model.paymentEditor}
          allowed={model.command.canAct()}
          scopeChanged={model.scopeChanged}
        />
        <ServiceTextSheet
          editor={model.textEditor}
          allowed={model.command.canAct(
            model.textEditor.draft?.kind === "message",
          )}
          scopeChanged={model.scopeChanged}
        />
        <ServiceEvidenceSheet
          chooser={model.evidenceChooser}
          allowed={model.command.canAct()}
          scopeChanged={model.scopeChanged}
        />
        <ServiceHistorySheet model={model} />
      </View>
    </VariableContextProvider>
  )
}
