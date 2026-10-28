import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import * as Clipboard from "expo-clipboard"
import { Fragment, useState } from "react"
import {
  type PaymentVerification,
  shortDateTime,
  verifiedPayment,
} from "./payment-link-model"

export type Fact = {
  label: string
  value: string
  /** Money and counts: tabular figures. */
  numeric?: boolean
  strong?: boolean
}

/** A quiet card of label/value lines (read-only, so the card owns padding). */
export function FactCard({ facts }: { facts: Fact[] }) {
  const largeText = useLargeTextLayout()
  return (
    <View className="rounded-[20px] bg-card px-3.5 py-1 shadow-sm">
      {facts.map((fact, index) => (
        <Fragment key={fact.label}>
          {index > 0 ? <View className="h-px bg-border" /> : null}
          <View
            className={cn(
              "min-h-12 gap-x-3 py-2.5",
              largeText ? "gap-y-0.5" : "flex-row items-center",
            )}
          >
            <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
              {fact.label}
            </Text>
            <Text
              className={cn(
                "text-sm text-foreground",
                !largeText && "max-w-[62%] text-right",
                fact.strong ? "font-extrabold" : "font-semibold",
                fact.numeric && "tabular-nums",
              )}
              selectable
            >
              {fact.value}
            </Text>
          </View>
        </Fragment>
      ))}
    </View>
  )
}

/**
 * The saved payment reference the customer puts in their transfer narration,
 * with its own Copy. It is never the bank's reference for the transfer.
 */
export function PaymentReferenceCard({
  paymentReference,
}: {
  paymentReference: string
}) {
  const [status, setStatus] = useState<string | null>(null)
  return (
    <View className="gap-2 rounded-[20px] bg-card p-3.5 shadow-sm">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-xs text-muted-foreground">Payment reference</Text>
        <Text
          className="text-base font-extrabold tabular-nums text-foreground"
          selectable
        >
          {paymentReference}
        </Text>
      </View>
      <ActionButton
        accessibilityLabel={`Copy payment reference ${paymentReference}`}
        icon="Copy"
        variant="outline"
        onPress={() =>
          void Clipboard.setStringAsync(paymentReference).then(
            () => setStatus("Reference copied."),
            () => setStatus("Copy didn't work. Select the reference instead."),
          )
        }
      >
        Copy reference
      </ActionButton>
      {status ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-xs text-muted-foreground"
        >
          {status}
        </Text>
      ) : null}
    </View>
  )
}

/** "Payment verified", only for a saved bank-check confirmation. */
export function VerifiedStamp({
  verification,
  message,
}: {
  verification: PaymentVerification | null | undefined
  message: string
}) {
  const verified = verifiedPayment(verification)
  if (!verified) return null
  return (
    <StatusBanner
      icon="CircleCheck"
      title="Payment verified"
      message={`Confirmed after a bank check · ${shortDateTime(verified.confirmedAt)}. ${message}`}
      tone="success"
    />
  )
}

/** One-line hint with an info icon, as in Money accounts. */
export function InfoNote({ children }: { children: string }) {
  const colors = useColors()
  return (
    <View className="flex-row gap-2 px-0.5">
      <Icon
        className="mt-0.5 size-[14px]"
        color={colors.mutedForeground}
        name="Info"
      />
      <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
        {children}
      </Text>
    </View>
  )
}
