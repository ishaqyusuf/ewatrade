import { MobileScreen, OtpInput, OtpKeypad } from "@/components/mobile"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { Toast } from "@/components/ui/toast"
import { useAuthContext } from "@/hooks/use-auth"
import { DEV_SKIP_OTP_CODE, isSkipOtpEnabled } from "@/lib/feature-flags"
import { useOnboardingStore } from "@/store/onboardingStore"
import { useTRPC } from "@/trpc/client"
import { useMutation } from "@tanstack/react-query"
import * as Clipboard from "expo-clipboard"
import { Link, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
    businessId?: string
    businessName?: string
    email?: string
    fallback?: "local"
    id?: string
    mode?: "login" | "sign-up"
    name?: string
    role?: string
    status?: string
  }>()
  const email = firstParam(params.email)?.trim() ?? ""
  const mode = firstParam(params.mode) === "login" ? "login" : "sign-up"
  const apiMode = mode === "login" ? "login" : "sign_up"
  const isLocalFallback = firstParam(params.fallback) === "local"
  const skipOtpEnabled = isSkipOtpEnabled()
  const shouldUseDevSkipOtp = skipOtpEnabled
  const emailDeliveryLabel =
    isLocalFallback && shouldUseDevSkipOtp
      ? "your selected business"
      : email || "your email address"
  const name = firstParam(params.name) ?? "Store Owner"
  const businessName = firstParam(params.businessName) ?? "My Business"
  const authEntryHref = mode === "login" ? "/login" : "/sign-up"
  const localProfileOverrides = useMemo(
    () =>
      isLocalFallback
        ? {
            businessId: firstParam(params.businessId),
            id: firstParam(params.id),
            role: firstParam(params.role),
            status: firstParam(params.status),
          }
        : {},
    [isLocalFallback, params.businessId, params.id, params.role, params.status],
  )
  const trpc = useTRPC()
  const [code, setCode] = useState("")
  const [status, setStatus] = useState<
    "idle" | "resent" | "verifying" | "error"
  >("idle")
  const [message, setMessage] = useState<string | null>(null)
  const didShowSkipOtpToast = useRef(false)
  const requestOtpMutation = useMutation(
    trpc.auth.requestMobileOwnerOtp.mutationOptions({
      onError(error) {
        setStatus("error")
        setMessage(error.message || "We could not resend the code.")
      },
      onSuccess() {
        setStatus("resent")
        setMessage(
          shouldUseDevSkipOtp
            ? `Use ${DEV_SKIP_OTP_CODE} in development mode.`
            : "Code sent again",
        )
        if (shouldUseDevSkipOtp) {
          Toast.show("use 123456", {
            position: "top",
            type: "info",
          })
        }
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

    if (shouldUseDevSkipOtp && code !== DEV_SKIP_OTP_CODE) {
      setStatus("error")
      setCode("")
      setMessage(`Use ${DEV_SKIP_OTP_CODE} in development mode.`)
      Toast.show("use 123456", {
        position: "top",
        type: "info",
      })
      return
    }

    if (isLocalFallback) {
      completeOnboarding(true)

      if (mode === "login") {
        auth.signInLocal({
          email,
          name,
          businessName,
          ...localProfileOverrides,
        })
        return
      }

      auth.signUpLocal({
        email,
        name,
        businessName,
        ...localProfileOverrides,
      })
      return
    }

    verifyOtpMutation.mutate({
      businessName,
      code,
      email,
      mode: apiMode,
      name,
    })
  }, [
    apiMode,
    auth,
    businessName,
    code,
    completeOnboarding,
    email,
    isLocalFallback,
    localProfileOverrides,
    mode,
    name,
    shouldUseDevSkipOtp,
    status,
    verifyOtpMutation,
  ])

  useEffect(() => {
    if (!shouldUseDevSkipOtp || didShowSkipOtpToast.current) return

    didShowSkipOtpToast.current = true
    Toast.show("use 123456", {
      position: "top",
      type: "info",
    })
  }, [shouldUseDevSkipOtp])

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

    if (isLocalFallback) {
      setStatus("resent")
      setMessage(
        shouldUseDevSkipOtp
          ? `Use ${DEV_SKIP_OTP_CODE} in development mode.`
          : "Local fallback active. Any 6-digit code will continue.",
      )
      if (shouldUseDevSkipOtp) {
        Toast.show("use 123456", {
          position: "top",
          type: "info",
        })
      }
      return
    }

    requestOtpMutation.mutate({
      businessName,
      email,
      mode: apiMode,
      name,
    })
  }, [
    apiMode,
    businessName,
    email,
    isLocalFallback,
    isVerifying,
    name,
    requestOtpMutation,
    shouldUseDevSkipOtp,
  ])

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

          {isLocalFallback || shouldUseDevSkipOtp ? (
            <View className="max-w-[280px] flex-row items-center gap-2 rounded-full bg-muted px-3 py-2">
              <Icon className="size-sm text-warn" name="Info" />
              <Text className="shrink text-[11px] font-medium leading-4 text-muted-foreground">
                {shouldUseDevSkipOtp
                  ? `Development mode: use ${DEV_SKIP_OTP_CODE}.`
                  : "Local fallback: any 6 digits work."}
              </Text>
            </View>
          ) : null}
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
