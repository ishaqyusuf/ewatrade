import { ServiceOfferingChoices } from "./service-offering-choices"
import { useServiceAppearance } from "./use-service-appearance"
import { ServiceAction as ActionButton } from "./service-action"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { formatMinorMoney } from "@ewatrade/utils"
import { discardRetainedEvidence } from "./service-evidence-files"
import type { ServiceJobsModel } from "./use-service-jobs"

export function ServiceIntakeForm({
  model,
  onPageChange,
  onChoicesLayout,
}: {
  model: ServiceJobsModel
  onPageChange: () => void
  onChoicesLayout: (y: number) => void
}) {
  const { market, ServiceHeader: Header } = useServiceAppearance()
  const currencyCode =
    model.intakeProjection.value?.currencyCode ??
    model.offerings[0]?.currencyCode ??
    "NGN"
  const {
    isOfflineMode,
    setCreating,
    quantities,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    dueAt,
    setDueAt,
    instructions,
    setInstructions,
    express,
    setExpress,
    amountPaid,
    setAmountPaid,
    paymentMethod,
    setPaymentMethod,
    paymentReference,
    setPaymentReference,
    notificationChannel,
    setNotificationChannel,
    showDetails,
    setShowDetails,
    pendingIntakeEvidence,
    setPendingIntakeEvidence,
    canUndoQuickFill,
    settingsQuery,
    intakeCreatesTrackedWork,
    subtotalMinor,
    serviceChargeMinor,
    totalMinor,
    intakeMutation,
    submitIntake,
    captureIntakeEvidence,
    fillIntake,
    undoIntakeFill,
  } = model
  return (
    <View className="gap-5">
      <Header
        mode="intake"
        title={market ? "Take in the next job." : "New service"}
        description="Select the items. Customer and delivery details are optional."
      />
      <QaQuickFillButton
        canUndo={canUndoQuickFill}
        formId="mobile.service.job"
        isDirty={
          Boolean(customerName || customerPhone || dueAt || instructions) ||
          Object.keys(quantities).length > 0
        }
        onFill={fillIntake}
        onUndo={undoIntakeFill}
      />
      <View onLayout={(event) => onChoicesLayout(event.nativeEvent.layout.y)}>
        <ServiceOfferingChoices model={model} onPageChange={onPageChange} />
      </View>
      {Object.keys(quantities).length > 0 && model.intakeProjection.error ? (
        <StatusBanner
          icon="AlertCircle"
          title="Check service quantities"
          message={model.intakeProjection.error}
          tone="warning"
        />
      ) : null}
      <View className="gap-3">
        <FormField
          variant={market ? "market" : "filled"}
          label="Customer name"
          maxLength={160}
          onChangeText={setCustomerName}
          value={customerName}
        />
        <FormField
          variant={market ? "market" : "filled"}
          keyboardType="phone-pad"
          label="Phone"
          maxLength={40}
          onChangeText={setCustomerPhone}
          value={customerPhone}
        />
      </View>
      {!isOfflineMode && settingsQuery.data?.expressEnabled ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: express }}
          className={
            market
              ? "min-h-14 flex-row items-center justify-between gap-3 border-y border-market-line py-4"
              : "min-h-14 flex-row items-center justify-between gap-3 border-y border-border py-4"
          }
          haptic
          onPress={() => setExpress((value) => !value)}
        >
          <View className="min-w-0 flex-1 gap-1">
            <Text
              className={
                market
                  ? "font-bold text-market-ink"
                  : "font-bold text-foreground"
              }
            >
              {settingsQuery.data.expressLabel}
            </Text>
            <Text
              className={
                market
                  ? "text-xs text-market-muted-ink"
                  : "text-xs text-muted-foreground"
              }
            >
              {settingsQuery.data.expressSurchargeType === "fixed"
                ? `${formatMinorMoney(
                    settingsQuery.data.expressSurchargeValue,
                    currencyCode,
                  )} surcharge`
                : `${settingsQuery.data.expressSurchargeValue / 100}% surcharge`}
            </Text>
          </View>
          <Icon
            className={
              market
                ? express
                  ? "size-sm text-market-accent-ink"
                  : "size-sm text-market-muted-ink"
                : express
                  ? "size-sm text-primary"
                  : "size-sm text-muted-foreground"
            }
            name={express ? "CircleCheck" : "CheckSquare"}
          />
        </Pressable>
      ) : null}
      <View
        className={
          market
            ? "gap-2 border-b border-market-line pb-4"
            : "gap-2 border-b border-border pb-4"
        }
      >
        <View className="flex-row justify-between">
          <Text
            className={
              market
                ? "text-sm text-market-muted-ink"
                : "text-sm text-muted-foreground"
            }
          >
            Subtotal
          </Text>
          <Text
            className={
              market ? "text-sm text-market-ink" : "text-sm text-foreground"
            }
          >
            {model.intakeProjection.value
              ? formatMinorMoney(subtotalMinor, currencyCode)
              : "—"}
          </Text>
        </View>
        {serviceChargeMinor > 0 ? (
          <View className="flex-row justify-between">
            <Text
              className={
                market
                  ? "text-sm text-market-muted-ink"
                  : "text-sm text-muted-foreground"
              }
            >
              Express
            </Text>
            <Text
              className={
                market ? "text-sm text-market-ink" : "text-sm text-foreground"
              }
            >
              {formatMinorMoney(serviceChargeMinor, currencyCode)}
            </Text>
          </View>
        ) : null}
        <View className="flex-row justify-between">
          <Text
            className={
              market ? "font-bold text-market-ink" : "font-bold text-foreground"
            }
          >
            Total
          </Text>
          <Text
            className={
              market ? "font-bold text-market-ink" : "font-bold text-foreground"
            }
          >
            {model.intakeProjection.value
              ? formatMinorMoney(totalMinor, currencyCode)
              : "—"}
          </Text>
        </View>
      </View>
      {!isOfflineMode ? (
        <View className="gap-4">
          <View className="gap-1">
            <Text
              className={
                market
                  ? "font-bold text-market-ink"
                  : "font-bold text-foreground"
              }
            >
              Payment
            </Text>
            <Text
              className={
                market
                  ? "text-xs leading-5 text-market-muted-ink"
                  : "text-xs leading-5 text-muted-foreground"
              }
            >
              Leave empty to collect the full balance on delivery.
            </Text>
          </View>
          <MoneyField
            variant={market ? "market" : "filled"}
            currencyCode={currencyCode}
            label="Amount paid now"
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
                accessibilityState={{ selected: paymentMethod === value }}
                className={
                  market
                    ? paymentMethod === value
                      ? "min-h-11 items-center justify-center rounded-full bg-market-palm px-4"
                      : "min-h-11 items-center justify-center rounded-full border border-market-line bg-market-field px-4"
                    : paymentMethod === value
                      ? "min-h-11 items-center justify-center rounded-full bg-primary px-4"
                      : "min-h-11 items-center justify-center rounded-full bg-muted px-4"
                }
                haptic
                key={value}
                onPress={() => setPaymentMethod(value)}
              >
                <Text
                  className={
                    market
                      ? paymentMethod === value
                        ? "text-sm font-bold text-market-on-palm"
                        : "text-sm font-bold text-market-ink"
                      : paymentMethod === value
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
            label="Payment reference"
            maxLength={160}
            onChangeText={setPaymentReference}
            value={paymentReference}
          />
          <View className="gap-2">
            <Text
              className={
                market
                  ? "font-bold text-market-ink"
                  : "font-bold text-foreground"
              }
            >
              Customer updates
            </Text>
            <View className="flex-row gap-2">
              {(
                [
                  ["", "None"],
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
                    market
                      ? notificationChannel === value
                        ? "min-h-11 flex-1 items-center justify-center rounded-full bg-market-palm px-3"
                        : "min-h-11 flex-1 items-center justify-center rounded-full border border-market-line bg-market-field px-3"
                      : notificationChannel === value
                        ? "min-h-11 flex-1 items-center justify-center rounded-full bg-primary px-3"
                        : "min-h-11 flex-1 items-center justify-center rounded-full bg-muted px-3"
                  }
                  haptic
                  key={value || "none"}
                  onPress={() => setNotificationChannel(value)}
                >
                  <Text
                    className={
                      market
                        ? notificationChannel === value
                          ? "text-xs font-bold text-market-on-palm"
                          : "text-xs font-bold text-market-ink"
                        : notificationChannel === value
                          ? "text-xs font-bold text-primary-foreground"
                          : "text-xs font-bold text-foreground"
                    }
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      ) : null}
      <Pressable
        className="min-h-11 justify-center"
        onPress={() => setShowDetails((value) => !value)}
      >
        <Text
          className={
            market
              ? "font-bold text-market-accent-ink"
              : "font-bold text-primary"
          }
        >
          {showDetails
            ? "Hide details"
            : "Add date, instructions, photo or video"}
        </Text>
      </Pressable>
      {showDetails ? (
        <View
          className={
            market
              ? "gap-5 border-y border-market-line py-5"
              : "gap-5 border-y border-border py-5"
          }
        >
          <FormField
            variant={market ? "market" : "filled"}
            autoCapitalize="none"
            helper="Example: 2026-07-21 16:00"
            label="Promised delivery"
            maxLength={80}
            onChangeText={setDueAt}
            value={dueAt}
          />
          <FormField
            variant={market ? "market" : "filled"}
            label="Instructions"
            maxLength={4000}
            multiline
            onChangeText={setInstructions}
            value={instructions}
          />
          <View className="gap-3">
            <View className="gap-1">
              <Text
                className={
                  market
                    ? "font-bold text-market-ink"
                    : "font-bold text-foreground"
                }
              >
                Photo or video package
              </Text>
              <Text
                className={
                  market
                    ? "text-xs leading-5 text-market-muted-ink"
                    : "text-xs leading-5 text-muted-foreground"
                }
              >
                Optional and private. Available when at least one selected
                Service creates tracked work.
              </Text>
            </View>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <ActionButton
                  disabled={!intakeCreatesTrackedWork}
                  onPress={() => void captureIntakeEvidence("photo")}
                  variant="outline"
                >
                  Take photo
                </ActionButton>
              </View>
              <View className="flex-1">
                <ActionButton
                  disabled={!intakeCreatesTrackedWork}
                  onPress={() => void captureIntakeEvidence("video")}
                  variant="outline"
                >
                  Record video
                </ActionButton>
              </View>
            </View>
            {pendingIntakeEvidence.slice(-4).map((evidence) => (
              <View
                className={
                  market
                    ? "flex-row items-center justify-between gap-3 border-t border-market-line pt-3"
                    : "flex-row items-center justify-between gap-3 border-t border-border pt-3"
                }
                key={evidence.clientEvidenceId}
              >
                <Text
                  className={
                    market
                      ? "min-w-0 flex-1 text-sm text-market-ink"
                      : "min-w-0 flex-1 text-sm text-foreground"
                  }
                >
                  {evidence.label}
                </Text>
                <ActionButton
                  onPress={() =>
                    model.removePendingEvidence(evidence.clientEvidenceId)
                  }
                  variant="ghost"
                >
                  Remove
                </ActionButton>
              </View>
            ))}
            {pendingIntakeEvidence.length > 4 ? (
              <ActionButton
                variant="outline"
                onPress={() => model.openHistory("pending")}
              >
                Manage all {pendingIntakeEvidence.length} attachments
              </ActionButton>
            ) : null}
          </View>
        </View>
      ) : null}
      <ActionButton
        disabled={isOfflineMode || !model.intakeProjection.value}
        isLoading={intakeMutation.isPending}
        loadingLabel="Creating"
        onPress={submitIntake}
      >
        {isOfflineMode
          ? "Reconnect to create Service work"
          : "Create service order"}
      </ActionButton>
      <ActionButton
        onPress={() => {
          pendingIntakeEvidence.forEach(discardRetainedEvidence)
          setPendingIntakeEvidence([])
          setAmountPaid("")
          setPaymentReference("")
          setCreating(false)
        }}
        variant="ghost"
      >
        Cancel
      </ActionButton>
    </View>
  )
}
