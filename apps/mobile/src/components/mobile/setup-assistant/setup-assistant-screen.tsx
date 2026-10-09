import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useRef, useState } from "react"
import { FlatList } from "react-native"
import { KeyboardAvoidingView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ActionButton } from "../action-button"
import {
  AssistantBubble,
  AssistantComposer,
  AssistantHeader,
  AssistantThinking,
} from "../assistant/assistant-ui"
import { HeroCard } from "../green-till/hero-card"
import { StatusBanner } from "../status-banner"
import { SetupAssistantQa } from "./setup-assistant-qa"
import {
  type SetupEntity,
  setupAreas,
  setupCommitKeys,
  setupCounts,
  setupPlainText,
} from "./setup-model"
import { SetupPrerequisites } from "./setup-prerequisites"
import { SetupRecordCard } from "./setup-record-card"
import { SetupRecordEditor } from "./setup-record-editor"
import { useSetupAssistant } from "./use-setup-assistant"

export function SetupAssistantScreen() {
  const auth = useAuthContext()
  const { qaState } = useLocalSearchParams<{ qaState?: string }>()
  if (
    __DEV__ &&
    typeof qaState === "string" &&
    [
      "normal",
      "loading",
      "offline",
      "allowance",
      "outage",
      "noaccess",
      "returning",
      "review",
    ].includes(qaState)
  )
    return <SetupAssistantQa state={qaState} />
  if (
    !["OWNER", "ADMIN"].includes(auth.profile?.role?.toUpperCase() ?? "") ||
    (auth.profile?.status?.toUpperCase() ?? "ACTIVE") !== "ACTIVE"
  )
    return (
      <SetupUnavailable
        title="Owner or admin access needed"
        message="Only the business owner or an admin can use the setup assistant."
      />
    )
  if (!auth.profile?.storeId)
    return (
      <SetupUnavailable
        title="Choose a Store"
        message="Open your active Store before setting up its products, services and customers."
      />
    )
  return <SetupAssistantLive />
}
export function SetupUnavailable({
  title,
  message,
}: { title: string; message: string }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <View className="flex-1 bg-background">
        <AssistantHeader title="Setup assistant" />
        <View className="gap-4 px-[18px] pt-4">
          <HeroCard title={title} sub={message} />
          <ActionButton variant="outline" onPress={() => router.back()}>
            Go back
          </ActionButton>
        </View>
      </View>
    </View>
  )
}
function SetupAssistantLive() {
  const vm = useSetupAssistant()
  const router = useRouter()
  const tray = useModal()
  const editor = useModal()
  const [editing, setEditing] = useState<SetupEntity | null>(null)
  const insets = useSafeAreaInsets()
  const list = useRef<FlatList>(null)
  const atBottom = useRef(true)
  const entities = vm.data?.draft?.entities ?? []
  const counts = setupCounts(entities)
  const addKeys = setupCommitKeys(entities)
  const disabled =
    vm.offline ||
    vm.scopeChanged ||
    vm.state.isError ||
    !!vm.pending ||
    vm.busy ||
    !!vm.runId
  const active = vm.data?.conversation?.status === "ACTIVE"
  const unavailable = vm.scopeChanged
    ? "Your session or Store changed. Close and reopen the assistant."
    : vm.offline && !vm.data
      ? "No saved setup list is available. Reconnect to load it."
      : vm.state.isError && !vm.data
        ? "Setup could not load. Reconnect and try again."
        : !vm.state.isPending && !vm.data
          ? "The setup assistant is not available for this Store."
          : null
  const close = async () => {
    if (vm.offline || !vm.data?.conversation) {
      router.back()
      return
    }
    if (await vm.close(counts.added > 0)) router.back()
  }
  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <KeyboardAvoidingView behavior="padding" className="flex-1 bg-background">
        <AssistantHeader
          title="Setup assistant"
          business={vm.auth.profile?.businessName}
          action={counts.added > 0 ? "Done for now" : "Skip for now"}
          onAction={() => void close()}
          disabled={vm.busy || !!vm.pending}
        />
        {unavailable ? (
          <View className="gap-4 px-[18px] pt-4">
            <StatusBanner
              title="Setup unavailable"
              message={unavailable}
              tone="warning"
              actionLabel={
                !vm.offline && !vm.scopeChanged ? "Try again" : undefined
              }
              onActionPress={() => void vm.refresh().catch(() => {})}
            />
            <ActionButton
              variant="outline"
              onPress={() => router.push("/first-product-setup-modal")}
            >
              Add it myself
            </ActionButton>
          </View>
        ) : (vm.state.isPending && !vm.data && !vm.offline) ||
          (vm.offline && vm.cacheLoading) ? (
          <View className="gap-4 p-[18px]">
            <Skeleton className="h-24 rounded-[18px]" />
            <Skeleton className="h-36 rounded-[18px]" />
          </View>
        ) : (
          <>
            <FlatList
              ref={list}
              className="flex-1"
              data={vm.chat.messages.filter((m) => m.role !== "system")}
              contentContainerClassName="gap-4 px-[18px] py-4"
              keyExtractor={(m) => m.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } =
                  e.nativeEvent
                atBottom.current =
                  contentSize.height -
                    contentOffset.y -
                    layoutMeasurement.height <
                  80
              }}
              onContentSizeChange={() => {
                if (atBottom.current)
                  list.current?.scrollToEnd({ animated: false })
              }}
              ListHeaderComponent={
                <View className="gap-3">
                  {vm.offline ? (
                    <StatusBanner
                      title="Offline"
                      message={`Saved as of ${vm.savedAt ? new Date(vm.savedAt).toLocaleString() : "time unavailable"}. Reconnect to chat, confirm or add.`}
                      tone="warning"
                    />
                  ) : null}
                  {vm.state.isError && vm.data ? (
                    <StatusBanner
                      title="Saved setup list"
                      message={`As of ${new Date(vm.savedAt).toLocaleString()}. Reconnect and refresh before changing records.`}
                      actionLabel={!vm.offline ? "Refresh" : undefined}
                      onActionPress={() => void vm.refresh().catch(() => {})}
                      tone="warning"
                    />
                  ) : null}
                  {vm.notice ? (
                    <StatusBanner
                      title={
                        vm.pending
                          ? "Adding to your business"
                          : "Check your setup list"
                      }
                      message={vm.notice}
                      actionLabel={
                        vm.runId && !vm.busy ? "Check reply" : undefined
                      }
                      onActionPress={() => void vm.recover()}
                      tone="warning"
                    />
                  ) : null}
                  {!active ? (
                    <HeroCard
                      title={
                        vm.data?.conversation
                          ? "How can I help today?"
                          : "Let’s set up your business"
                      }
                      sub="Nothing is compulsory. Describe what you sell, the services you offer or customers to add. You can continue later."
                      cta={
                        disabled
                          ? undefined
                          : {
                              label: vm.data?.conversation
                                ? "Continue setup"
                                : "Set up with AI",
                              icon: "Sparkles",
                              onPress: () => void vm.open(),
                            }
                      }
                    />
                  ) : null}
                </View>
              }
              renderItem={({ item }) => (
                <AssistantBubble
                  text={setupPlainText(item.parts)}
                  user={item.role === "user"}
                />
              )}
              ListFooterComponent={
                <View className="gap-3">
                  {vm.busy ? <AssistantThinking /> : null}
                  {vm.error ? (
                    <StatusBanner
                      title="Not sent"
                      message={vm.error.message}
                      tone="warning"
                      actionLabel={
                        vm.error.allowance ? "Open setup list" : "Try again"
                      }
                      onActionPress={
                        vm.error.allowance ? () => tray.present() : vm.retry
                      }
                    />
                  ) : null}
                  {active && entities.length > 0 ? (
                    <ActionButton
                      variant="outline"
                      disabled={disabled}
                      onPress={() => tray.present()}
                    >
                      Review your setup list
                    </ActionButton>
                  ) : null}
                </View>
              }
            />
            <AssistantComposer
              value={vm.draft}
              onChange={vm.setDraft}
              onSend={vm.send}
              onStop={() => void vm.chat.stop()}
              busy={vm.busy}
              disabled={disabled || !active || !!vm.error?.allowance}
              reason={
                vm.offline
                  ? "Reconnect to chat. Your saved setup list is here."
                  : vm.error?.allowance
                    ? "Your list is still editable and addable."
                    : "Nothing is added until you press Add. Setup is by typing for this release."
              }
            >
              {entities.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open setup list, ${counts.open} records to review`}
                  className="min-h-[56px] flex-row items-center gap-3 rounded-[18px] bg-ink px-3 py-2"
                  onPress={() => tray.present()}
                >
                  <Icon
                    name="ClipboardList"
                    className="size-[20px] text-background"
                  />
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm font-bold text-background">
                      Setup list · {counts.open}
                    </Text>
                    <Text className="text-xs text-background">
                      {counts.confirmed} confirmed · {counts.check} to check
                    </Text>
                  </View>
                  <View className="rounded-xl bg-gold px-3 py-2">
                    <Text className="text-xs font-bold text-gold-foreground">
                      Review ↑
                    </Text>
                  </View>
                </Pressable>
              ) : null}
            </AssistantComposer>
          </>
        )}
        <Modal
          ref={tray.ref}
          title={
            vm.pending?.startsWith("Adding")
              ? "Adding to your business"
              : "Setup list"
          }
          snapPoints={["90%"]}
          enablePanDownToClose={!vm.pending}
        >
          <BottomSheetScrollView
            contentContainerClassName="gap-3 px-[18px] pb-8"
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-xs text-muted-foreground">
              {vm.offline
                ? `Saved as of ${new Date(vm.savedAt).toLocaleString()}. Reconnect to confirm or add.`
                : "Check each record. Nothing is in your business until you add it."}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {setupAreas(vm.data).map((area) => (
                <View
                  key={area.area}
                  className="rounded-full bg-card px-3 py-2"
                >
                  <Text className="text-xs font-bold text-muted-foreground">
                    {
                      {
                        sell: "Sell",
                        use: "Use",
                        customers: "Customers",
                        money: "Money",
                      }[area.area]
                    }{" "}
                    ·{" "}
                    {
                      {
                        OPEN: "Not started",
                        STARTED: `${area.records} staged`,
                        DONE: "Done",
                        SKIPPED: "Skipped",
                      }[area.status]
                    }
                  </Text>
                </View>
              ))}
            </View>
            <SetupPrerequisites
              terms={!!vm.data?.prerequisites?.termsRequired}
              finance={!!vm.data?.prerequisites?.financeBookMissing}
              disabled={disabled}
              onReady={() => void vm.refresh().catch(() => {})}
            />
            {vm.pending?.startsWith("Adding") ? (
              <HeroCard
                title="Adding to your business"
                sub="Each confirmed record is added once. Keep this list open while the batch finishes."
                stats={[
                  { label: "Added", value: String(counts.added) },
                  { label: "Waiting", value: String(counts.confirmed) },
                ]}
              />
            ) : null}
            {vm.notice ? (
              <StatusBanner
                title="Check the saved results"
                message={vm.notice}
                tone="warning"
              />
            ) : null}
            {entities.length === 0 ? (
              <Text className="text-sm text-muted-foreground">
                Your setup list is empty. Describe your business in the chat to
                begin.
              </Text>
            ) : null}
            {entities.map((e) => (
              <SetupRecordCard
                key={e.key}
                entity={e}
                currency={vm.data?.currencyCode ?? "NGN"}
                disabled={disabled}
                onState={(next) => void vm.setEntity(e.key, next)}
                onAdd={() => void vm.add([e.key])}
                onEdit={() => {
                  setEditing(e)
                  editor.present()
                }}
              />
            ))}
            <ActionButton
              disabled={disabled || !addKeys.length || !active}
              isLoading={!!vm.pending}
              icon="Plus"
              onPress={() => void vm.add(addKeys)}
            >
              Add {addKeys.length} confirmed{" "}
              {addKeys.length === 1 ? "record" : "records"}
            </ActionButton>
            <Text className="text-xs text-muted-foreground">
              Only confirmed records are added. You can change them later.
            </Text>
          </BottomSheetScrollView>
        </Modal>
        <Modal
          ref={editor.ref}
          title="Record details"
          stackBehavior="push"
          snapPoints={["90%"]}
          enablePanDownToClose={!vm.pending}
          keyboardBehavior="extend"
        >
          {editing ? (
            <SetupRecordEditor
              key={editing.key}
              entity={editing}
              countryCode={vm.data?.countryCode}
              disabled={disabled}
              onSave={async (payload) => {
                if (await vm.saveEntity(editing.key, payload)) editor.dismiss()
              }}
            />
          ) : null}
        </Modal>
      </KeyboardAvoidingView>
    </View>
  )
}
