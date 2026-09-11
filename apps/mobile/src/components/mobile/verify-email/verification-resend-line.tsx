import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import type { MobileDesign } from "@/lib/mobile-design/screens"

export function VerificationResendLine({
  design,
  disabled,
  isError,
  isSending,
  isVerifying,
  message,
  onPress,
  wasResent,
}: {
  design: MobileDesign
  disabled: boolean
  isError: boolean
  isSending: boolean
  isVerifying: boolean
  message: string | null
  onPress: () => void
  wasResent: boolean
}) {
  const lead = isSending
    ? "Sending code"
    : isVerifying
      ? "Verifying code"
      : isError && message
        ? message
        : wasResent
          ? "Code sent again"
          : "Didn't receive it?"
  const market = design === "market-day"
  return (
    <Pressable
      accessibilityLabel="Resend code"
      accessibilityRole="button"
      className="min-h-11 flex-row flex-wrap items-center justify-center gap-1 px-3"
      disabled={disabled}
      haptic
      onPress={onPress}
      transition
    >
      <Text
        accessibilityLiveRegion="polite"
        className={
          market
            ? isError
              ? "text-center text-xs leading-5 text-market-paprika"
              : "text-center text-xs leading-5 text-market-muted-ink"
            : isError
              ? "text-center text-xs font-semibold leading-5 text-destructive"
              : "text-center text-xs leading-5 text-muted-foreground"
        }
      >
        {lead}
      </Text>
      {!isSending && !isVerifying ? (
        <Text
          className={
            market
              ? "text-center text-xs font-extrabold leading-5 text-market-accent-ink"
              : "text-center text-xs font-bold leading-5 text-foreground"
          }
        >
          {market ? "Resend code" : "tap to resend"}
        </Text>
      ) : null}
    </Pressable>
  )
}
