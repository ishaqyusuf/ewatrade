import { OtpInput } from "@/components/mobile/otp-input"
import { OtpKeypad } from "@/components/mobile/otp-keypad"
import { ClassicVerifyEmailScreen } from "@/components/mobile/appearances/classic/verify-email-screen"
import { MarketDayVerifyEmailScreen } from "@/components/mobile/appearances/market-day/verify-email-screen"
import { VerificationResendLine } from "./verification-resend-line"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useAuthContext } from "@/hooks/use-auth"
import { useOnboardingStore } from "@/store/onboardingStore"
import { useTRPC } from "@/trpc/client"
import {
  BUSINESS_OPERATING_MODEL_KEYS,
  BUSINESS_ORDER_CHANNEL_KEYS,
  BUSINESS_PROFILE_SCHEMA_VERSION,
  BUSINESS_TEAM_SIZE_KEYS,
  normalizeOperatingCurrencyCode,
} from "@ewatrade/utils"
import { useMutation } from "@tanstack/react-query"
import * as Clipboard from "expo-clipboard"
import { useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useState } from "react"

const OTP_LENGTH = 6

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function normalizeOtpCode(value: string) {
  return value.replace(/\D/g, "").slice(0, OTP_LENGTH)
}

export function VerifyEmailScreen() {
  const auth = useAuthContext()
  const design = useMobileDesign("verify-email")
  const Presentation =
    design === "market-day"
      ? MarketDayVerifyEmailScreen
      : ClassicVerifyEmailScreen
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  )
  const params = useLocalSearchParams<{
    addressLine1?: string
    businessProfileKey?: string
    businessProfileVersion?: string
    businessName?: string
    city?: string
    currencyCode?: string
    email?: string
    mode?: "login" | "sign-up"
    name?: string
    operatingModel?: string
    orderChannels?: string
    otherBusinessDescription?: string
    phone?: string
    returnTo?: string
    teamSize?: string
  }>()
  const email = firstParam(params.email)?.trim() ?? ""
  const returnTo = firstParam(params.returnTo)
  const mode = firstParam(params.mode) === "login" ? "login" : "sign-up"
  const apiMode = mode === "login" ? "login" : "sign_up"
  const emailDeliveryLabel = email || "your email address"
  const name = firstParam(params.name) ?? "Store Owner"
  const addressLine1 = firstParam(params.addressLine1)
  const businessProfileKey = firstParam(params.businessProfileKey)
  const businessProfileVersion =
    firstParam(params.businessProfileVersion) ===
    String(BUSINESS_PROFILE_SCHEMA_VERSION)
      ? BUSINESS_PROFILE_SCHEMA_VERSION
      : undefined
  const city = firstParam(params.city)
  const operatingModelValue = firstParam(params.operatingModel)
  const operatingModel = BUSINESS_OPERATING_MODEL_KEYS.find(
    (value) => value === operatingModelValue,
  )
  const requestedOrderChannels = new Set(
    (firstParam(params.orderChannels) ?? "").split(",").filter(Boolean),
  )
  const orderChannels = BUSINESS_ORDER_CHANNEL_KEYS.filter((value) =>
    requestedOrderChannels.has(value),
  )
  const otherBusinessDescription = firstParam(params.otherBusinessDescription)
  const phone = firstParam(params.phone)
  const teamSizeValue = firstParam(params.teamSize)
  const teamSize = BUSINESS_TEAM_SIZE_KEYS.find(
    (value) => value === teamSizeValue,
  )
  const businessName = firstParam(params.businessName) ?? "My Business"
  const currencyCode = normalizeOperatingCurrencyCode(
    firstParam(params.currencyCode),
  )
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
        auth.applyAuthenticatedSession(
          {
            accessProfile: session.accessProfile,
            expiresAt: session.expiresAt.toISOString(),
            profile: {
              businessId: session.profile.businessId ?? undefined,
              businessName: session.profile.businessName ?? undefined,
              businessSlug: session.tenant?.slug ?? undefined,
              currencyCode: session.profile.currencyCode,
              email: session.profile.email,
              id: session.profile.id,
              name: session.profile.name,
              role: session.profile.role ?? undefined,
              status: session.profile.status ?? undefined,
            },
            token: session.token,
          },
          returnTo?.startsWith("/(customer)/") ? returnTo : "/",
        )
      },
    }),
  )
  const isVerifying = status === "verifying" || verifyOtpMutation.isPending

  const verifyCode = useCallback(() => {
    if (code.length !== OTP_LENGTH || status === "verifying") return

    setStatus("verifying")

    verifyOtpMutation.mutate({
      addressLine1,
      businessProfileKey,
      businessProfileVersion,
      businessName,
      city,
      currencyCode,
      code,
      email,
      mode: apiMode,
      name,
      operatingModel,
      orderChannels,
      otherBusinessDescription,
      phone,
      teamSize,
    })
  }, [
    apiMode,
    addressLine1,
    businessProfileKey,
    businessProfileVersion,
    businessName,
    city,
    code,
    currencyCode,
    email,
    name,
    operatingModel,
    orderChannels,
    otherBusinessDescription,
    phone,
    status,
    teamSize,
    verifyOtpMutation,
  ])

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
      addressLine1,
      businessProfileKey,
      businessProfileVersion,
      businessName,
      city,
      currencyCode,
      email,
      mode: apiMode,
      name,
      operatingModel,
      orderChannels,
      otherBusinessDescription,
      phone,
      teamSize,
    })
  }, [
    apiMode,
    addressLine1,
    businessProfileKey,
    businessProfileVersion,
    businessName,
    city,
    currencyCode,
    email,
    isVerifying,
    name,
    operatingModel,
    orderChannels,
    otherBusinessDescription,
    phone,
    requestOtpMutation,
    teamSize,
  ])

  return (
    <Presentation
      authEntryHref={authEntryHref}
      email={emailDeliveryLabel}
      mode={mode}
      otp={
        <OtpInput
          className={
            design === "classic" ? "justify-center gap-1.5" : undefined
          }
          disableSystemKeyboard
          length={OTP_LENGTH}
          onChange={updateCode}
          value={code}
          variant={design === "market-day" ? "market-tally" : "reference"}
        />
      }
      resend={
        <VerificationResendLine
          design={design}
          disabled={requestOtpMutation.isPending || isVerifying}
          isError={status === "error"}
          isSending={requestOtpMutation.isPending}
          isVerifying={isVerifying}
          message={message}
          onPress={resendCode}
          wasResent={status === "resent"}
        />
      }
      keypad={
        <OtpKeypad
          disabled={isVerifying}
          onDeletePress={removeLastDigit}
          onDigitPress={appendDigit}
          onPastePress={pasteCode}
          variant={design === "market-day" ? "market-tally" : "default"}
        />
      }
    />
  )
}
