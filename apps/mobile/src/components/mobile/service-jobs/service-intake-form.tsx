import { ServiceHeader as Header } from "@/components/mobile/appearances/classic/service-jobs"
import { AttachmentLockSheet } from "@/components/mobile/attachment-lock-sheet"
import { CheckoutMoneyAccountField } from "@/components/mobile/create-sale/checkout-money-account"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAttachmentEntitlement } from "@/hooks/use-attachment-entitlement"
import { trackMobileActivity } from "@/runtime/analytics-runtime"
import { formatMinorMoney, majorToMinor } from "@ewatrade/utils"
import { ServiceAction as ActionButton } from "./service-action"
import { discardRetainedEvidence } from "./service-evidence-files"
import { ServiceOfferingChoices } from "./service-offering-choices"
import type { ServiceJobsModel } from "./use-service-jobs"

const PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  bank_transfer: "Transfer",
  pos: "POS",
  card: "Card",
  other: "Other",
} as const

export function ServiceIntakeForm({
  model,
  onPageChange,
  onChoicesLayout,
}: {
  model: ServiceJobsModel
  onPageChange: () => void
  onChoicesLayout: (y: number) => void
}) {
  const access = useAttachmentEntitlement({
    surface: "service",
    track: trackMobileActivity,
  })
  const media = access.entitlement.status
  const mediaLocked = media === "locked"
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
    intakeAccount,
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
        title="New service"
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
          variant="filled"
          label="Customer name"
          maxLength={160}
          onChangeText={setCustomerName}
          value={customerName}
        />
        <FormField
          variant="filled"
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
          className="min-h-14 flex-row items-center justify-between gap-3 border-y border-border py-4"
          haptic
          onPress={() => setExpress((value) => !value)}
        >
          <View className="min-w-0 flex-1 gap-1">
            <Text className="font-bold text-foreground">
              {settingsQuery.data.expressLabel}
            </Text>
            <Text className="text-xs text-muted-foreground">
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
              express ? "size-sm text-primary" : "size-sm text-muted-foreground"
            }
            name={express ? "CircleCheck" : "CheckSquare"}
          />
        </Pressable>
      ) : null}
      <View className="gap-2 border-b border-border pb-4">
        <View className="flex-row justify-between">
          <Text className="text-sm text-muted-foreground">Subtotal</Text>
          <Text className="text-sm text-foreground">
            {model.intakeProjection.value
              ? formatMinorMoney(subtotalMinor, currencyCode)
              : "—"}
          </Text>
        </View>
        {serviceChargeMinor > 0 ? (
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted-foreground">Express</Text>
            <Text className="text-sm text-foreground">
              {formatMinorMoney(serviceChargeMinor, currencyCode)}
            </Text>
          </View>
        ) : null}
        <View className="flex-row justify-between">
          <Text className="font-bold text-foreground">Total</Text>
          <Text className="font-bold text-foreground">
            {model.intakeProjection.value
              ? formatMinorMoney(totalMinor, currencyCode)
              : "—"}
          </Text>
        </View>
      </View>
      {!isOfflineMode ? (
        <View className="gap-4">
          <View className="gap-1">
            <Text className="font-bold text-foreground">Payment</Text>
            <Text className="text-xs [-rn-line-height:22] text-muted-foreground">
              Leave empty to collect the full balance on delivery.
            </Text>
          </View>
          <MoneyField
            variant="filled"
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
                      ? "text-sm font-bold text-primary-foreground"
                      : "text-sm font-bold text-foreground"
                  }
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <CheckoutMoneyAccountField
            accounts={intakeAccount.list}
            disabled={false}
            method={paymentMethod}
            methodLabel={PAYMENT_METHOD_LABELS[paymentMethod]}
            onChoose={intakeAccount.choose}
            onRetry={intakeAccount.retry}
            receivedLabel={formatMinorMoney(
              amountPaid.trim()
                ? Math.max(0, majorToMinor(amountPaid) ?? 0)
                : 0,
              currencyCode,
            )}
            state={intakeAccount.state}
          />
          <FormField
            variant="filled"
            label="Payment reference"
            maxLength={160}
            onChangeText={setPaymentReference}
            value={paymentReference}
          />
          <View className="gap-2">
            <Text className="font-bold text-foreground">Customer updates</Text>
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
                    notificationChannel === value
                      ? "min-h-11 flex-1 items-center justify-center rounded-full bg-primary px-3"
                      : "min-h-11 flex-1 items-center justify-center rounded-full bg-muted px-3"
                  }
                  haptic
                  key={value || "none"}
                  onPress={() => setNotificationChannel(value)}
                >
                  <Text
                    className={
                      notificationChannel === value
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
        <Text className="font-bold text-primary">
          {showDetails
            ? "Hide details"
            : "Add date, instructions, photo or video"}
        </Text>
      </Pressable>
      {showDetails ? (
        <View className="gap-5 border-y border-border py-5">
          <FormField
            variant="filled"
            autoCapitalize="none"
            helper="Example: 2026-07-21 16:00"
            label="Promised delivery"
            maxLength={80}
            onChangeText={setDueAt}
            value={dueAt}
          />
          <FormField
            variant="filled"
            label="Instructions"
            maxLength={4000}
            multiline
            onChangeText={setInstructions}
            value={instructions}
          />
          <View className="gap-3">
            <View className="gap-1">
              <Text className="font-bold text-foreground">
                Photo or video package
              </Text>
              <Text className="text-xs [-rn-line-height:22] text-muted-foreground">
                Optional and private. Available when at least one selected
                Service creates tracked work.
              </Text>
              {intakeCreatesTrackedWork &&
              (media === "checking" || media === "unknown") ? (
                <Text className="text-xs [-rn-line-height:22] text-muted-foreground">
                  {media === "checking"
                    ? "Checking your plan… Photo and video open once it's confirmed."
                    : "Couldn't confirm your plan, so photo and video are off for now."}
                </Text>
              ) : null}
            </View>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <ActionButton
                  accessibilityLabel={
                    mediaLocked
                      ? "Take photo, locked on the Free plan"
                      : undefined
                  }
                  disabled={
                    !intakeCreatesTrackedWork ||
                    (!mediaLocked && media !== "allowed")
                  }
                  icon={mediaLocked ? "Lock" : undefined}
                  onPress={() =>
                    void access.attempt(
                      () => captureIntakeEvidence("photo"),
                      "camera",
                    )
                  }
                  variant="outline"
                >
                  Take photo
                </ActionButton>
              </View>
              <View className="flex-1">
                <ActionButton
                  accessibilityLabel={
                    mediaLocked
                      ? "Record video, locked on the Free plan"
                      : undefined
                  }
                  disabled={
                    !intakeCreatesTrackedWork ||
                    (!mediaLocked && media !== "allowed")
                  }
                  icon={mediaLocked ? "Lock" : undefined}
                  onPress={() =>
                    void access.attempt(
                      () => captureIntakeEvidence("video"),
                      "video",
                    )
                  }
                  variant="outline"
                >
                  Record video
                </ActionButton>
              </View>
            </View>
            {pendingIntakeEvidence.slice(-4).map((evidence) => (
              <View
                className="flex-row items-center justify-between gap-3 border-t border-border pt-3"
                key={evidence.clientEvidenceId}
              >
                <Text className="min-w-0 flex-1 text-sm text-foreground">
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
      <AttachmentLockSheet
        canSeePlans={access.sheet?.canSeePlans ?? false}
        onClose={access.closeSheet}
        onPromptAction={access.promptAction}
        onSeePlans={access.seePlans}
        open={access.sheet !== null}
        surface="service"
      />
    </View>
  )
}
