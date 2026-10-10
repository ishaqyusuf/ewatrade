import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { formatMinorMoney, majorToMinor } from "@ewatrade/utils/currency"
import { useState } from "react"
import { ScrollView } from "react-native"
import { KeyboardAvoidingView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ActionButton } from "../action-button"
import { FormField } from "../form-field"
import { ListCard, RecordRow, SectionHeader } from "../green-till/kit"
import { QaQuickFillButton } from "../qa-quick-fill-button"
import { StatusBanner } from "../status-banner"
import {
  AssistantAnswerCard,
  ProposalCard,
  RefusalCard,
  ResultCard,
} from "./assistant-cards"
import {
  AssistantBubble,
  AssistantComposer,
  AssistantHeader,
} from "./assistant-ui"
const views = ["home", "answer", "payment", "order", "product", "refusal"]
/** Isolated fixture: no tRPC, model calls, queue writes or business mutations. */
export function AskAssistantQa({
  state,
  initialView,
}: { state: string; initialView?: string }) {
  const [view, setView] = useState(
    views.includes(initialView ?? "") ? (initialView ?? "home") : "home",
  )
  const [draft, setDraft] = useState("")
  const [decision, setDecision] = useState<
    "pending" | "confirmed" | "cancelled"
  >("pending")
  const [quantity, setQuantity] = useState("12")
  const [price, setPrice] = useState("4500")
  const [method, setMethod] = useState("Cash")
  const [undo, setUndo] = useState<{ quantity: string; price: string } | null>(
    null,
  )
  const editor = useModal()
  const insets = useSafeAreaInsets()
  const large = useLargeTextLayout()
  const offline = state === "offline"
  const rep = state === "rep"
  const manager = state === "manager"
  const unavailable = ["loading", "noaccess"].includes(state)
  const select = (next: string) => {
    setView(next)
    setDecision("pending")
    setDraft("")
  }
  const summary =
    view === "payment"
      ? `Mama Tunde · ORD-1041\n${formatMinorMoney(majorToMinor(price) ?? 0, "NGN")} ${method} · Balance after: ${formatMinorMoney(Math.max(0, 450000 - (majorToMinor(price) ?? 0)), "NGN")}`
      : view === "product"
        ? `Layer mash 25kg · bag\n₦${price} per bag · ${quantity} opening stock`
        : `Aisha Bello · ${quantity} crates of eggs\n${formatMinorMoney(majorToMinor(price) ?? 0, "NGN")} each · Payment to be checked`
  const title =
    view === "payment"
      ? "Record a payment"
      : view === "product"
        ? "Add this product"
        : "Create this order"
  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <AssistantHeader
          title="Ask ẸwáTrade"
          business={`Jawdah Farms · ${rep ? "Sales rep" : manager ? "Manager" : "Owner"}`}
          action="New chat"
          onAction={() => select("home")}
        />
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 px-[18px] py-4"
          keyboardShouldPersistTaps="handled"
        >
          <StatusBanner
            title="Development preview"
            message="Sample answers and simulated decisions only. These controls cannot create records or use your allowance."
          />
          {offline ? (
            <StatusBanner
              title="Offline"
              message="Sample saved answers · as of 10:42. Asking is paused. Live offline order confirmation needs the approved runtime."
              tone="warning"
            />
          ) : state === "allowance" ? (
            <StatusBanner
              title="Allowance used"
              message="Asking is paused. Renewal date is unavailable in this preview. Saved proposals need no new model request."
              tone="warning"
            />
          ) : state === "outage" ? (
            <StatusBanner
              title="Not sent · Try again"
              message="The typed message stays here. No provider was called."
              tone="warning"
            />
          ) : null}
          {state === "loading" ? (
            <Skeleton className="h-36 rounded-[18px]" />
          ) : state === "noaccess" ? (
            <RefusalCard
              title="Assistant access unavailable"
              reason="Your membership must be active before you can ask about this Store."
            />
          ) : view === "home" ? (
            <>
              <Text className="text-2xl font-bold text-foreground">
                How can I help today?
              </Text>
              <Text className="text-sm text-muted-foreground">
                Ask about sales, stock and customers, or tell me what to record.
                Nothing changes until you confirm.
              </Text>
              <View className={large ? "gap-3" : "flex-row flex-wrap gap-3"}>
                {[
                  ["New order", "order"],
                  [
                    rep
                      ? "My sales"
                      : manager
                        ? "Unpaid orders"
                        : "Who owes me money?",
                    "answer",
                  ],
                  ["Add a product", "product"],
                  ["What can I do?", "refusal"],
                ].map(([label, next]) => (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    className={
                      large
                        ? "min-h-[76px] justify-center rounded-[18px] bg-card p-4"
                        : "min-h-[100px] min-w-[45%] flex-1 justify-center rounded-[18px] bg-card p-4"
                    }
                    onPress={() => select(next ?? "home")}
                  >
                    <Text className="text-sm font-bold text-foreground">
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <SectionHeader title="Recent conversations" />
              <ListCard>
                <RecordRow
                  title="Mama Tunde’s balance"
                  meta="Yesterday · sample conversation"
                  avatar={{ initials: "MT", tint: "amber" }}
                  onPress={() => select("answer")}
                />
                <RecordRow
                  title="Order for Aisha Bello"
                  meta="Monday · sample conversation"
                  avatar={{ initials: "AB", tint: "lilac" }}
                  onPress={() => select("order")}
                />
              </ListCard>
            </>
          ) : view === "answer" ? (
            <>
              <AssistantBubble
                user
                text={
                  rep
                    ? "Show my sales to Mama Tunde"
                    : "How much does Mama Tunde owe?"
                }
              />
              <AssistantBubble
                text={
                  rep
                    ? "Here is the sample for your own sales."
                    : manager
                      ? "This sample shows unpaid orders. Full customer accounts require owner or admin access."
                      : "Here is the sample account balance and its source."
                }
              >
                <AssistantAnswerCard
                  title="Mama Tunde"
                  value={rep ? "₦9,000" : manager ? "₦4,500" : "₦9,000"}
                  scope={
                    rep
                      ? "Your own sales · 1 paid order"
                      : manager
                        ? "Unpaid orders · 2 orders"
                        : "Customer account · opening balance + ORD-1041"
                  }
                  asOf="Sample · 10:42"
                >
                  {!rep ? (
                    <ActionButton
                      disabled={offline}
                      variant="outline"
                      onPress={() => select("payment")}
                    >
                      Record payment on ORD-1041
                    </ActionButton>
                  ) : null}
                </AssistantAnswerCard>
              </AssistantBubble>
            </>
          ) : view === "refusal" ||
            (rep && ["payment", "product"].includes(view)) ||
            (manager && view === "product") ? (
            <RefusalCard
              title={
                rep
                  ? "This action needs owner or admin access"
                  : "This action is not available here"
              }
              reason={
                rep
                  ? "You can see your own sales and the catalog, and start a sale. Customer accounts and new products require owner or admin access."
                  : "Stock that has not been counted stays unknown. Nothing is estimated or written."
              }
              alternative="Start a sale preview"
              onAlternative={() => select("order")}
            />
          ) : (
            <>
              <AssistantBubble
                user
                text={
                  view === "payment"
                    ? "Record ₦4,500 cash on ORD-1041."
                    : view === "product"
                      ? "Add Layer mash 25kg, ₦4,500, 12 bags."
                      : "Aisha wants 12 crates of eggs. Prepare an order."
                }
              />
              <AssistantBubble text="Check this proposal before confirming." />
              <ProposalCard
                title={title}
                summary={summary}
                state={decision}
                disabled={offline}
                reason={
                  offline
                    ? "Reconnect to confirm this sample. Live offline orders need runtime support."
                    : "Preview only. Confirm changes this card’s sample state."
                }
                onConfirm={() => setDecision("confirmed")}
                onEdit={() => editor.present()}
                onCancel={() => setDecision("cancelled")}
              />
              {decision === "confirmed" ? (
                <ResultCard
                  title="Preview confirmed"
                  detail="Sample state only. No real record, receipt or deep link exists."
                />
              ) : decision === "cancelled" ? (
                <Text className="text-sm text-muted-foreground">
                  Nothing was recorded.
                </Text>
              ) : null}
            </>
          )}
          {view !== "home" ? (
            <ActionButton variant="ghost" onPress={() => select("home")}>
              Back to suggestions
            </ActionButton>
          ) : null}
        </ScrollView>
        <AssistantComposer
          placeholder="Ask about sales, stock or customers…"
          value={draft}
          onChange={setDraft}
          onSend={() => select("answer")}
          busy={false}
          disabled={offline || unavailable || state === "allowance"}
          reason="Typing preview · no voice upload or read-aloud · no live model request."
        />
        <Modal
          ref={editor.ref}
          title="Edit sample proposal"
          snapPoints={["70%"]}
        >
          <BottomSheetInputProvider>
            <BottomSheetKeyboardAwareScrollView
              contentContainerStyle={{
                gap: 16,
                paddingHorizontal: 18,
                paddingBottom: 32,
              }}
            >
              <QaQuickFillButton
                formId="ask-assistant-proposal"
                canUndo={!!undo}
                onFill={() => {
                  setUndo({ quantity, price })
                  setQuantity("20")
                  setPrice("6500")
                }}
                onUndo={() => {
                  if (undo) {
                    setQuantity(undo.quantity)
                    setPrice(undo.price)
                    setUndo(null)
                  }
                }}
              />
              {view !== "payment" ? (
                <FormField
                  label="Quantity"
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                />
              ) : null}
              <FormField
                label={view === "payment" ? "Payment amount" : "Unit price"}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
              />
              {view === "payment" ? (
                <View className="flex-row flex-wrap gap-2">
                  {["Cash", "Transfer", "Card"].map((value) => (
                    <ActionButton
                      key={value}
                      variant={method === value ? undefined : "outline"}
                      onPress={() => setMethod(value)}
                    >
                      {value}
                    </ActionButton>
                  ))}
                </View>
              ) : null}
              <ActionButton
                disabled={
                  offline ||
                  (view === "payment" &&
                    ((majorToMinor(price) ?? 0) <= 0 ||
                      (majorToMinor(price) ?? 0) > 450000)) ||
                  !/^\d+(\.\d{1,2})?$/.test(price) ||
                  !/^\d+(\.\d{1,6})?$/.test(quantity)
                }
                onPress={() => {
                  setDecision("pending")
                  editor.dismiss()
                }}
              >
                Save preview
              </ActionButton>
              <Text className="text-xs text-muted-foreground">
                An edited live proposal must receive a new revision and approval
                token before Confirm.
              </Text>
            </BottomSheetKeyboardAwareScrollView>
          </BottomSheetInputProvider>
        </Modal>
      </KeyboardAvoidingView>
    </View>
  )
}
