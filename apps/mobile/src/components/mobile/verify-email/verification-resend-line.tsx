import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"

export function VerificationResendLine({
  disabled,
  isError,
  isSending,
  isVerifying,
  message,
  onPress,
  previewQa = false,
  wasResent,
  cooldownSeconds = 0,
}: {
  disabled: boolean
  isError: boolean
  isSending: boolean
  isVerifying: boolean
  message: string | null
  onPress: () => void
  previewQa?: boolean
  wasResent: boolean
  /** Seconds until another code can be sent. */
  cooldownSeconds?: number
}) {
  const copy = previewQa
    ? {
        loading: "Refreshing code",
        ready: "Code refreshed",
        help: "Code expired?",
        action: "Refresh code",
        cooldown: "Refresh code in ",
      }
    : {
        loading: "Sending code",
        ready: "Code sent again",
        help: "Didn't receive it?",
        action: "Resend code",
        cooldown: "Send a new code in ",
      }
  const lead = isSending
    ? copy.loading
    : isVerifying
      ? "Verifying code"
      : isError && message
        ? message
        : wasResent
          ? copy.ready
          : copy.help
  if (cooldownSeconds > 0 && !isSending && !isVerifying && !isError)
    return (
      <Text
        accessibilityLiveRegion="polite"
        className="text-center text-xs [-rn-line-height:22] text-muted-foreground"
      >
        {copy.cooldown}
        <Text className="text-xs font-bold tabular-nums text-foreground">
          {`${Math.floor(cooldownSeconds / 60)}:${String(cooldownSeconds % 60).padStart(2, "0")}`}
        </Text>
      </Text>
    )
  return (
    <Pressable
      accessibilityLabel={copy.action}
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
          isError
            ? "text-center text-xs font-semibold [-rn-line-height:22] text-destructive"
            : "text-center text-xs [-rn-line-height:22] text-muted-foreground"
        }
      >
        {lead}
      </Text>
      {!isSending && !isVerifying ? (
        <Text className="text-center text-xs font-bold [-rn-line-height:22] text-foreground">
          {copy.action}
        </Text>
      ) : null}
    </Pressable>
  )
}
