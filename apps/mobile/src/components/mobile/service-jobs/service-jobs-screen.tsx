import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { DetailSkeleton } from "@/components/mobile/loading-skeletons"
import { StatusBanner } from "@/components/mobile/status-banner"
import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { View } from "@/components/ui/view"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { VariableContextProvider } from "nativewind"
import { useLayoutEffect, useRef, useState } from "react"
import { Keyboard, type ScrollView } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ListCreateFab } from "../list-create-fab"
import { getListCreateFabFooterOffset } from "../list-create-fab-model"
import { useSearchFold } from "../search-fold"
import { SearchFooterScope, SearchFooterSpacer } from "../search-footer-scope"
import { ServiceAction } from "./service-action"
import {
  ServiceChromeContext,
  type ServiceChromeHeader,
  useSetServiceChromeHeader,
} from "./service-chrome-context"
import { ServiceCommandReview } from "./service-command-review"
import { ServiceHistorySheet } from "./service-history-sheet"
import { ServiceIntakeForm } from "./service-intake-form"
import { ServiceJobWorkspace } from "./service-job-workspace"
import type { ServiceJobsProps } from "./service-jobs-model"
import { ServiceJobsQueue } from "./service-jobs-queue"
import { ServicePaymentSheet } from "./service-payment-sheet"
import { ServiceStatusSheet } from "./service-status-sheet"
import { ServiceTextSheet } from "./service-text-sheet"
import { useServiceJobs } from "./use-service-jobs"

export function ServiceJobsChrome(props: WorkflowModalChromeProps) {
  const [header, setHeader] = useState<ServiceChromeHeader | null>(null)
  return (
    <ServiceChromeContext.Provider value={setHeader}>
      <MobileWorkflowChrome
        {...props}
        title={header?.title ?? props.title}
        onBack={header?.onBack}
        backLabel={props.back ? props.closeLabel : "Back to work queue"}
        trailing={
          header ? (
            <Pressable
              accessibilityLabel="Job history"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-card shadow-sm active:bg-accent"
              haptic
              onPress={header.onHistory}
            >
              <Icon className="size-[18px] text-foreground" name="Clock" />
            </Pressable>
          ) : undefined
        }
      />
    </ServiceChromeContext.Provider>
  )
}

export function ServiceJobsContent(props: ServiceJobsProps = {}) {
  const model = useServiceJobs(props.focusedJob)
  const scroll = useRef<ScrollView>(null)
  const intakeTop = useRef(0)
  const choicesTop = useRef(0)
  const workspaceTop = useRef(0)
  const linesTop = useRef(0)
  const [footerHeight, setFooterHeight] = useState(88)
  const scrollHide = useBottomSearchScroll()
  const searchFold = useSearchFold(model.search)
  const insets = useSafeAreaInsets()
  const {
    creating,
    selectedJob,
    selectedJobId,
    error,
    notice,
    isOfflineMode,
    jobs,
    showQueueSearch,
    search,
    setSearch,
  } = model
  const setChromeHeader = useSetServiceChromeHeader()
  const focusedCurrent = model.focusedJob?.isCurrent() ?? true
  useLayoutEffect(() => {
    if (!focusedCurrent) setChromeHeader(null)
  }, [focusedCurrent, setChromeHeader])
  // Hooks and the command owner remain mounted while a same-Job fresh read is
  // checking/refused. No old workspace, editor, history or command facts render.
  if (model.focusedJob && !focusedCurrent)
    return (
      <View className="gap-4 p-5">
        <StatusBanner
          icon="Lock"
          title="Current Job access required"
          message={
            model.focusedJob.checking
              ? "Checking current access to this exact saved Service Job…"
              : "This exact saved Service Job is unavailable with current access. Any retained action stays locked until a fresh authorized read."
          }
        />
        {!model.focusedJob.checking ? (
          <ServiceAction
            variant="outline"
            onPress={() => void model.focusedJob?.refresh().catch(() => {})}
          >
            Retry exact Job
          </ServiceAction>
        ) : null}
        <ServiceAction variant="outline" onPress={model.focusedJob.onBack}>
          Back to the assistant
        </ServiceAction>
      </View>
    )
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
      {!model.focusedJob && selectedJobId && model.jobQuery.isError ? (
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
  // The queue search sits at the bottom with the gold New service button
  // above it, both hiding on scroll like the tab bar.
  const classicQueue =
    !model.focusedJob && !blocked && !creating && !selectedJobId
  return (
    <VariableContextProvider
      value={{
        "--service-jobs-bottom":
          showQueueSearch || classicQueue ? footerHeight + 24 : 48,
      }}
    >
      <SearchFooterScope className="flex-1 bg-background">
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
              Boolean(model.history.kind)
            }
            importantForAccessibility={
              model.command.locked ||
              model.statusEditor.draft ||
              model.paymentEditor.draft ||
              model.textEditor.draft ||
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
                  ) : !model.focusedJob &&
                    model.jobQuery.isPending &&
                    !isOfflineMode ? (
                    <DetailSkeleton label="Loading the selected job" rows={3} />
                  ) : (
                    <View className="gap-4">
                      <StatusBanner
                        icon="Info"
                        title="Selected job"
                        message={
                          model.focusedJob
                            ? "This exact saved job is unavailable with current access. Return to the assistant; no queue or cached job substitutes for it."
                            : "This job is not available in the current Store or offline cache."
                        }
                      />
                      <ServiceAction
                        variant="outline"
                        onPress={() =>
                          model.focusedJob
                            ? model.focusedJob.onBack()
                            : model.setSelectedJobId(null)
                        }
                      >
                        {model.focusedJob
                          ? "Back to the assistant"
                          : "Back to work queue"}
                      </ServiceAction>
                    </View>
                  )}
                </View>
                <SearchFooterSpacer />
              </KeyboardAwareScrollView>
            ) : (
              <ServiceJobsQueue
                model={model}
                feedback={feedback}
                heroFolded={searchFold.folded}
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
                      : getListCreateFabFooterOffset({
                          bottomInset: insets.bottom,
                          footerHeight,
                        })
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
                  onFocusChange={searchFold.onFocusChange}
                  onHeightChange={setFooterHeight}
                  placeholder="Receipt, customer or service"
                  totalCount={jobs.length}
                  value={search}
                />
              </>
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
        <ServiceHistorySheet model={model} />
      </SearchFooterScope>
    </VariableContextProvider>
  )
}
