import { useServiceAppearance } from "./use-service-appearance"
import { ServiceAction as ActionButton } from "./service-action"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { formatMinorMoney } from "@ewatrade/utils"
import { textLabel } from "./service-jobs-model"
import { ServiceWorkLines } from "./service-work-lines"
import type { ServiceJobsModel } from "./use-service-jobs"

export function ServiceJobWorkspace({
  model,
  onLinesLayout,
  onPageChange,
}: {
  model: ServiceJobsModel
  onLinesLayout: (y: number) => void
  onPageChange: () => void
}) {
  const { market, ServiceHeader: Header } = useServiceAppearance()
  const {
    profile,
    canManage,
    amountPaid,
    setAmountPaid,
    paymentMethod,
    setPaymentMethod,
    paymentReference,
    setPaymentReference,
    notificationChannel,
    setNotificationChannel,
    customerMessage,
    setCustomerMessage,
    canUndoQaMessage,
    selectedJob,
    setSelectedJobId,
    jobNote,
    setJobNote,
    evidenceMutation,
    assignMutation,
    paymentMutation,
    handoffMutation,
    messageMutation,
    noteMutation,
    transition,
    addNote,
    assignToMe,
    recordPayment,
    handoff,
    notifyCustomer,
    captureEvidence,
    fillMessage,
    undoMessageFill,
  } = model
  if (!selectedJob) return null
  return (
    <View className="gap-4">
      <Pressable
        className="min-h-11 flex-row items-center gap-2"
        onPress={() => {
          setAmountPaid("")
          setPaymentReference("")
          setSelectedJobId(null)
        }}
      >
        <Icon
          className={
            market ? "size-sm text-market-accent-ink" : "size-sm text-primary"
          }
          name="ArrowLeft"
        />
        <Text
          className={
            market
              ? "font-bold text-market-accent-ink"
              : "font-bold text-primary"
          }
        >
          Work queue
        </Text>
      </Pressable>
      <Header
        mode="job"
        title={selectedJob.orderNumber}
        description={textLabel(selectedJob.summary)}
      />
      <View
        className={
          market
            ? "gap-4 border-y border-market-line py-4"
            : "gap-4 border-y border-border py-4"
        }
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text
              className={
                market
                  ? "font-bold text-market-ink"
                  : "font-bold text-foreground"
              }
            >
              Payment and collection
            </Text>
            <Text
              className={
                market
                  ? "text-xs text-market-muted-ink"
                  : "text-xs text-muted-foreground"
              }
            >
              {formatMinorMoney(
                selectedJob.amountPaidMinor,
                selectedJob.currencyCode,
              )}{" "}
              paid ·{" "}
              {formatMinorMoney(
                selectedJob.balanceDueMinor,
                selectedJob.currencyCode,
              )}{" "}
              due
            </Text>
          </View>
          <StatusBadge
            label={textLabel(selectedJob.paymentStatus)}
            tone={selectedJob.balanceDueMinor > 0 ? "warning" : "success"}
          />
        </View>
        {selectedJob.balanceDueMinor > 0 && market ? (
          <ActionButton
            disabled={!model.command.canAct()}
            variant="outline"
            onPress={() => model.openPaymentEditor(selectedJob, "payment")}
          >
            Record payment
          </ActionButton>
        ) : selectedJob.balanceDueMinor > 0 ? (
          <>
            <MoneyField
              variant={market ? "market" : "filled"}
              currencyCode={selectedJob.currencyCode}
              label="Amount received"
              onChangeValue={setAmountPaid}
              value={amountPaid}
            />
            <View className="flex-row flex-wrap gap-2">
              {(
                [
                  ["cash", "Cash"],
                  ["bank_transfer", "Transfer"],
                  ["pos", "POS"],
                  ["card", "Card"],
                  ["other", "Other"],
                ] as const
              ).map(([value, label]) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: paymentMethod === value,
                  }}
                  className={
                    paymentMethod === value
                      ? "min-h-11 items-center justify-center rounded-full bg-primary px-4"
                      : "min-h-11 items-center justify-center rounded-full bg-muted px-4"
                  }
                  haptic
                  key={value}
                  onPress={() => setPaymentMethod(value)}
                >
                  <Text
                    className={
                      paymentMethod === value
                        ? "text-xs font-bold text-primary-foreground"
                        : "text-xs font-bold text-foreground"
                    }
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <FormField
              variant={market ? "market" : "filled"}
              label="Payment reference"
              maxLength={160}
              onChangeText={setPaymentReference}
              value={paymentReference}
            />
            <ActionButton
              disabled={!amountPaid.trim()}
              isLoading={paymentMutation.isPending}
              onPress={() => recordPayment(selectedJob)}
              variant="outline"
            >
              Record payment
            </ActionButton>
          </>
        ) : null}
        {selectedJob.summary === "ready_for_handoff" &&
        !selectedJob.handedOffAt ? (
          <ActionButton
            isLoading={handoffMutation.isPending}
            onPress={() =>
              market
                ? model.openPaymentEditor(selectedJob, "handoff")
                : handoff(selectedJob)
            }
          >
            {selectedJob.balanceDueMinor > 0
              ? "Collect balance and hand over"
              : "Mark collected"}
          </ActionButton>
        ) : selectedJob.handedOffAt ? (
          <StatusBanner
            icon="CircleCheck"
            message="This order has been collected and closed."
            tone="success"
          />
        ) : null}
      </View>
      {profile?.id && selectedJob.currentAssigneeUserId !== profile.id ? (
        <ActionButton
          isLoading={assignMutation.isPending}
          onPress={() => assignToMe(selectedJob)}
          variant="outline"
        >
          Assign to me
        </ActionButton>
      ) : null}
      <ServiceWorkLines
        key={selectedJob.id}
        job={selectedJob}
        disabled={!model.command.canAct()}
        onTransition={transition}
        onLayout={onLinesLayout}
        onPageChange={onPageChange}
      />
      <View
        className={
          market
            ? "gap-4 border-t border-market-line pt-4"
            : "gap-4 border-t border-border pt-4"
        }
      >
        {canManage && market ? (
          <ActionButton
            variant="outline"
            disabled={!model.command.canAct(true)}
            onPress={() => model.openTextEditor(selectedJob, "message")}
          >
            Customer update
          </ActionButton>
        ) : canManage ? (
          <View className="gap-3">
            <Text
              className={
                market
                  ? "font-bold text-market-ink"
                  : "font-bold text-foreground"
              }
            >
              Customer update
            </Text>
            <View className="flex-row gap-2">
              {(
                [
                  ["whatsapp", "WhatsApp"],
                  ["sms", "SMS"],
                ] as const
              ).map(([value, label]) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: notificationChannel === value,
                  }}
                  className={
                    notificationChannel === value
                      ? "min-h-11 flex-1 items-center justify-center rounded-full bg-primary px-3"
                      : "min-h-11 flex-1 items-center justify-center rounded-full bg-muted px-3"
                  }
                  haptic
                  key={value}
                  onPress={() => setNotificationChannel(value)}
                >
                  <Text
                    className={
                      notificationChannel === value
                        ? "text-sm font-bold text-primary-foreground"
                        : "text-sm font-bold text-foreground"
                    }
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <FormField
              variant={market ? "market" : "filled"}
              label="Message"
              multiline
              maxLength={4000}
              onChangeText={setCustomerMessage}
              value={customerMessage}
            />
            <QaQuickFillButton
              canUndo={canUndoQaMessage}
              formId="mobile.customer.message"
              isDirty={Boolean(customerMessage)}
              onFill={fillMessage}
              onUndo={undoMessageFill}
            />
            <ActionButton
              disabled={!customerMessage.trim() || !notificationChannel}
              isLoading={messageMutation.isPending}
              onPress={() => notifyCustomer(selectedJob)}
              variant="outline"
            >
              Send customer update
            </ActionButton>
          </View>
        ) : null}
        <View className="gap-1">
          <Text
            className={
              market ? "font-bold text-market-ink" : "font-bold text-foreground"
            }
          >
            Private work record
          </Text>
          <Text
            className={
              market
                ? "text-xs leading-5 text-market-muted-ink"
                : "text-xs leading-5 text-muted-foreground"
            }
          >
            Notes and evidence are internal unless a manager explicitly
            publishes reviewed evidence.
          </Text>
        </View>
        {market ? (
          <ActionButton
            variant="outline"
            disabled={!model.command.canAct()}
            onPress={() => model.openTextEditor(selectedJob, "note")}
          >
            Add internal note
          </ActionButton>
        ) : (
          <>
            <FormField
              variant={market ? "market" : "filled"}
              label="Internal note"
              multiline
              maxLength={4000}
              onChangeText={setJobNote}
              value={jobNote}
            />
            <ActionButton
              disabled={!jobNote.trim()}
              isLoading={noteMutation.isPending}
              onPress={() => addNote(selectedJob)}
              variant="outline"
            >
              Add note
            </ActionButton>
          </>
        )}
        {selectedJob.notes.slice(-3).map((entry) => (
          <View
            className={
              market
                ? "rounded-xl bg-market-field p-3"
                : "rounded-xl bg-muted p-3"
            }
            key={entry.id}
          >
            <Text
              className={
                market ? "text-sm text-market-ink" : "text-sm text-foreground"
              }
            >
              {entry.body}
            </Text>
          </View>
        ))}
        {selectedJob.notes.length > 3 ? (
          <ActionButton
            variant="ghost"
            onPress={() => model.openHistory("notes")}
          >
            View all {selectedJob.notes.length} loaded notes
          </ActionButton>
        ) : null}
        {market ? (
          <ActionButton
            variant="outline"
            disabled={!model.command.canAct()}
            isLoading={model.captureBusy}
            onPress={() => model.openEvidenceChooser(selectedJob)}
          >
            Add private evidence
          </ActionButton>
        ) : (
          <View className="flex-row gap-2">
            <View className="flex-1">
              <ActionButton
                isLoading={evidenceMutation.isPending}
                onPress={() => void captureEvidence(selectedJob, "photo")}
                variant="outline"
              >
                Take photo
              </ActionButton>
            </View>
            <View className="flex-1">
              <ActionButton
                isLoading={evidenceMutation.isPending}
                onPress={() => void captureEvidence(selectedJob, "video")}
                variant="outline"
              >
                Record video
              </ActionButton>
            </View>
          </View>
        )}
        {selectedJob.evidence.slice(-4).map((entry) => (
          <View
            className={
              market
                ? "flex-row items-center justify-between gap-3 rounded-xl bg-market-field p-3"
                : "flex-row items-center justify-between gap-3 rounded-xl bg-muted p-3"
            }
            key={entry.id}
          >
            <Text
              className={
                market
                  ? "min-w-0 flex-1 text-sm text-market-ink"
                  : "min-w-0 flex-1 text-sm text-foreground"
              }
            >
              {entry.label || textLabel(entry.purpose)}
            </Text>
            <StatusBadge
              label={textLabel(entry.uploadStatus)}
              tone={entry.uploadStatus === "FAILED" ? "warning" : "muted"}
            />
          </View>
        ))}
        {selectedJob.evidence.length > 4 ? (
          <ActionButton
            variant="ghost"
            onPress={() => model.openHistory("evidence")}
          >
            View all {selectedJob.evidence.length} loaded attachments
          </ActionButton>
        ) : null}
      </View>
    </View>
  )
}
