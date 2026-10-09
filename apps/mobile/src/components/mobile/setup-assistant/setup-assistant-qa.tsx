import { Modal, useModal } from "@/components/ui/modal"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useEffect, useState } from "react"
import { ScrollView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ActionButton } from "../action-button"
import {
  AssistantBubble,
  AssistantComposer,
  AssistantHeader,
} from "../assistant/assistant-ui"
import { HeroCard } from "../green-till/hero-card"
import { StatusBanner } from "../status-banner"
import { type SetupEntity, setupCounts } from "./setup-model"
import { SetupRecordCard } from "./setup-record-card"
import { SetupRecordEditor } from "./setup-record-editor"
export function SetupAssistantQa({ state }: { state: string }) {
  const tray = useModal()
  const editor = useModal()
  const [editing, setEditing] = useState<SetupEntity | null>(null)
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState("")
  const [entities, setEntities] = useState<SetupEntity[]>([
    {
      key: "eggs",
      kind: "PRODUCT",
      state: "PROPOSED",
      payload: {
        kind: "product",
        name: "Crate of eggs",
        unitName: "Crate",
        priceMinor: 450000,
        openingStock: "40",
      },
    },
    {
      key: "customer",
      kind: "CUSTOMER",
      state: "CONFIRMED",
      payload: {
        kind: "customer",
        name: "Aisha Bello",
        phone: "+2348035550142",
        opening: { direction: "owes_business", amountMinor: 1300000 },
      },
    },
    {
      key: "cash",
      kind: "MONEY_ACCOUNT",
      state: "PROPOSED",
      payload: {
        kind: "money_account",
        name: "Shop cash",
        purpose: "CASH",
        openingBalanceMinor: 1250000,
      },
    },
  ])
  const counts = setupCounts(entities)
  useEffect(() => {
    if (state === "review") tray.present()
  }, [state, tray.present])
  const offline = state === "offline"
  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <View className="flex-1 bg-background">
        <AssistantHeader
          title="Setup assistant"
          business="Jawdah Farms · Development preview"
        />
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 px-[18px] py-4"
        >
          <StatusBanner
            title="Design preview"
            message="Sample records only. These controls cannot call the API or create business records."
          />
          {state === "loading" ? (
            <Skeleton className="h-32 rounded-[18px]" />
          ) : state === "noaccess" ? (
            <HeroCard
              title="Owner or admin access needed"
              sub="Only the business owner or an admin can use the setup assistant."
            />
          ) : (
            <>
              {offline ? (
                <StatusBanner
                  title="Offline"
                  message="Sample saved list · as of 10:42. Reconnect to confirm or add."
                  tone="warning"
                />
              ) : null}
              <AssistantBubble
                text={
                  state === "returning"
                    ? "How can I help today? Your setup list is saved. Nothing is compulsory; we can continue later."
                    : "Welcome, Hauwa. Let’s set up Jawdah Farms. Tell me what you sell, the price for each unit and how many you have now. Nothing is added until you press Add."
                }
              />
              <AssistantBubble
                user
                text="Crate of eggs, ₦4,500. I have 40 crates. Aisha owes me ₦13,000. My shop cash is ₦12,500."
              />
              <AssistantBubble text="I’ve put those in your setup list. Check the price and opening balance before adding them." />
              {state === "allowance" ? (
                <StatusBanner
                  title="Allowance used"
                  message="Your setup list is still editable and addable."
                  tone="warning"
                />
              ) : state === "outage" ? (
                <StatusBanner
                  title="Not sent · Try again"
                  message="Your message is kept. Refresh or try again when the assistant is available."
                  tone="warning"
                />
              ) : null}
              <ActionButton variant="outline" onPress={() => tray.present()}>
                Open setup list · {counts.open}
              </ActionButton>
            </>
          )}
        </ScrollView>
        <AssistantComposer
          value={draft}
          onChange={setDraft}
          onSend={() => setDraft("")}
          busy={false}
          disabled={
            offline || ["loading", "noaccess", "allowance"].includes(state)
          }
          reason="Development preview · typing only · no records are added."
        />
        <Modal ref={tray.ref} title="Setup list" snapPoints={["90%"]}>
          <BottomSheetScrollView contentContainerClassName="gap-3 px-[18px] pb-8">
            {entities.map((e) => (
              <SetupRecordCard
                key={e.key}
                entity={e}
                currency="NGN"
                disabled={offline}
                onEdit={() => {
                  setEditing(e)
                  editor.present()
                }}
                onState={(next) =>
                  setEntities((es) =>
                    es.map((row) =>
                      row.key === e.key ? { ...row, state: next } : row,
                    ),
                  )
                }
                onAdd={() =>
                  setEntities((es) =>
                    es.map((row) =>
                      row.key === e.key ? { ...row, state: "COMMITTED" } : row,
                    ),
                  )
                }
              />
            ))}
            <Text className="text-xs text-muted-foreground">
              Preview only. A simulated added state has no real receipt or deep
              link.
            </Text>
          </BottomSheetScrollView>
        </Modal>
        <Modal
          ref={editor.ref}
          title="Record details"
          stackBehavior="push"
          snapPoints={["90%"]}
          keyboardBehavior="extend"
        >
          {editing ? (
            <SetupRecordEditor
              key={editing.key}
              entity={editing}
              disabled={offline}
              onSave={(payload) => {
                setEntities((rows) =>
                  rows.map((row) =>
                    row.key === editing.key
                      ? { ...row, payload, state: "PROPOSED" }
                      : row,
                  ),
                )
                editor.dismiss()
              }}
            />
          ) : null}
        </Modal>
      </View>
    </View>
  )
}
