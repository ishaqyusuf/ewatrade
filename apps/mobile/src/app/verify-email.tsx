import { MobileScreen, OtpInput, OtpKeypad } from "@/components/mobile"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useOnboardingStore } from "@/store/onboardingStore"
import { useTRPC } from "@/trpc/client"
import { useMutation } from "@tanstack/react-query"
import * as Clipboard from "expo-clipboard"
import { Link, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { View } from "react-native"

const OTP_LENGTH = 6
const RESEND_ACTION_LABEL = "Resend code"
const VERIFY_ACTION_LABEL = "Verify and continue"

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function normalizeOtpCode(value: string) {
  return value.replace(/\D/g, "").slice(0, OTP_LENGTH)
}

export default function VerifyEmailRoute() {
  const auth = useAuthContext()
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  )
  const params = useLocalSearchParams<{
    businessName?: string
    email?: string
    mode?: "login" | "sign-up"
    name?: string
  }>()
  const email = firstParam(params.email)?.trim() ?? ""
  const mode = firstParam(params.mode) === "login" ? "login" : "sign-up"
  const apiMode = mode === "login" ? "login" : "sign_up"
  const emailDeliveryLabel = email || "your email address"
  const name = firstParam(params.name) ?? "Store Owner"
  const businessName = firstParam(params.businessName) ?? "My Business"
  const authEntryHref = mode === "login" ? "/login" : "/sign-up"
  const trpc = useTRPC()
  const [code, setCode] = useState("")
  const [status, setStatus] = useState<
    "idle" | "resent" | "verifying" | "error"
  >("idle")
  const [message, setMessage] = useState<string | null>(null)
  const requestOtpMutation = useMutation(
    trpc.auth.requestMobileOwnerOtp.mutationOptions({
      onError(error) {
        setStatus("error")
        setMessage(error.message || "We could not resend the code.")
      },
      onSuccess() {
        setStatus("resent")
        setMessage("Code sent again")
      },
    }),
  )
  const verifyOtpMutation = useMutation(
    trpc.auth.verifyMobileOwnerOtp.mutationOptions({
      onError(error) {
        setStatus("error")
        setCode("")
        setMessage(error.message || "We could not verify that code.")
      },
      onSuccess(session) {
        completeOnboarding(true)
        auth.applyAuthenticatedSession({
          expiresAt: session.expiresAt.toISOString(),
          profile: {
            businessId: session.profile.businessId ?? undefined,
            businessName: session.profile.businessName ?? undefined,
            email: session.profile.email,
            id: session.profile.id,
            name: session.profile.name,
            role: session.profile.role ?? undefined,
            status: session.profile.status ?? undefined,
          },
          token: session.token,
        })
      },
    }),
  )
  const isVerifying = status === "verifying" || verifyOtpMutation.isPending

  const verifyCode = useCallback(() => {
    if (code.length !== OTP_LENGTH || status === "verifying") return

    setStatus("verifying")

    verifyOtpMutation.mutate({
      businessName,
      code,
      email,
      mode: apiMode,
      name,
    })
  }, [apiMode, businessName, code, email, name, status, verifyOtpMutation])

  useEffect(() => {
    if (code.length === OTP_LENGTH) {
      verifyCode()
    }
  }, [code.length, verifyCode])

  const clearEntryFeedback = useCallback(() => {
    setMessage(null)
    setStatus((currentStatus) =>
      currentStatus === "error" ? "idle" : currentStatus,
    )
  }, [])

  const updateCode = useCallback(
    (nextCode: string) => {
      setCode(normalizeOtpCode(nextCode))
      clearEntryFeedback()
    },
    [clearEntryFeedback],
  )

  const appendDigit = useCallback(
    (digit: string) => {
      setCode((currentCode) => normalizeOtpCode(`${currentCode}${digit}`))
      clearEntryFeedback()
    },
    [clearEntryFeedback],
  )

  const removeLastDigit = useCallback(() => {
    setCode((currentCode) => currentCode.slice(0, -1))
    clearEntryFeedback()
  }, [clearEntryFeedback])

  const pasteCode = useCallback(async () => {
    const clipboardValue = await Clipboard.getStringAsync()
    const digits = normalizeOtpCode(clipboardValue)

    if (digits.length !== OTP_LENGTH) {
      setStatus("error")
      setMessage("No 6-digit code found on clipboard.")
      return
    }

    setCode(digits)
    setMessage(null)
    setStatus("idle")
  }, [])

  const resendCode = useCallback(() => {
    if (requestOtpMutation.isPending || isVerifying) return

    requestOtpMutation.mutate({
      businessName,
      email,
      mode: apiMode,
      name,
    })
  }, [apiMode, businessName, email, isVerifying, name, requestOtpMutation])

  return (
    <MobileScreen contentClassName="px-5 py-5" keyboardBottomOffset={40}>
      <View className="min-h-full justify-between gap-8">
        <View className="flex-row items-center justify-between">
          <Link href={authEntryHref} asChild>
            <Pressable
              accessibilityLabel="Use another email"
              className="h-12 w-12 items-center justify-center rounded-full bg-muted active:bg-accent"
              haptic
              transition
            >
              <Icon className="size-base text-foreground" name="ChevronLeft" />
            </Pressable>
          </Link>

          <Text
            className="max-w-[190px] text-center text-[11px] font-bold uppercase tracking-[1.3px] text-primary"
            numberOfLines={1}
          >
            {mode === "login" ? "Login code" : "Email verification"}
          </Text>

          <View className="h-12 w-12" />
        </View>

        <View className="items-center gap-7 py-4">
          <View className="items-center gap-3">
            <Text className="max-w-[280px] text-center text-[25px] font-extrabold leading-[31px] text-foreground">
              Enter the code we sent you
            </Text>
            <Text className="max-w-[285px] text-center text-[13px] leading-5 text-muted-foreground">
              We sent a 6-digit code to {emailDeliveryLabel}.
            </Text>
          </View>

          <View
            accessibilityLabel={VERIFY_ACTION_LABEL}
            className="items-center gap-4"
          >
            <OtpInput
              className="justify-center gap-1.5"
              disableSystemKeyboard
              length={OTP_LENGTH}
              onChange={updateCode}
              value={code}
              variant="reference"
            />

            <VerificationResendLine
              disabled={requestOtpMutation.isPending || isVerifying}
              isError={status === "error"}
              isSending={requestOtpMutation.isPending}
              isVerifying={isVerifying}
              message={message}
              onPress={resendCode}
              wasResent={status === "resent"}
            />
          </View>
        </View>

        <View className="gap-4 pb-8">
          <OtpKeypad
            disabled={isVerifying}
            onDeletePress={removeLastDigit}
            onDigitPress={appendDigit}
            onPastePress={pasteCode}
          />
        </View>
      </View>
    </MobileScreen>
  )
}

function VerificationResendLine({
  disabled,
  isError,
  isSending,
  isVerifying,
  message,
  onPress,
  wasResent,
}: {
  disabled: boolean
  isError: boolean
  isSending: boolean
  isVerifying: boolean
  message: string | null
  onPress: () => void
  wasResent: boolean
}) {
  const leadCopy = useMemo(() => {
    if (isSending) return "Sending code"
    if (isVerifying) return "Verifying code"
    if (isError && message) return message
    if (wasResent) return "Code sent again"
    return "Didn't receive it?"
  }, [isError, isSending, isVerifying, message, wasResent])

  const actionCopy = isSending || isVerifying ? null : "tap to resend"

  return (
    <Pressable
      accessibilityLabel={RESEND_ACTION_LABEL}
      className="min-h-8 flex-row flex-wrap items-center justify-center gap-1 px-3"
      disabled={disabled}
      haptic
      onPress={onPress}
      transition
    >
      <Text
        className={
          isError
            ? "text-center text-[12px] font-semibold leading-5 text-destructive"
            : "text-center text-[12px] leading-5 text-muted-foreground"
        }
      >
        {leadCopy}
      </Text>
      {actionCopy ? (
        <Text className="text-center text-[12px] font-bold leading-5 text-foreground">
          {actionCopy}
        </Text>
      ) : null}
    </Pressable>
  )
}
