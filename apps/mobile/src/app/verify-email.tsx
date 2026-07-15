import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useColors } from "@/hooks/use-color"
import { useOnboardingStore } from "@/store/onboardingStore"
import { useTRPC } from "@/trpc/client"
import { useMutation } from "@tanstack/react-query"
import * as Clipboard from "expo-clipboard"
import { LinearGradient } from "expo-linear-gradient"
import { Link, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { StyleSheet, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const OTP_LENGTH = 6
const KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["paste", "0", "delete"],
] as const

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default function VerifyEmailRoute() {
  const auth = useAuthContext()
  const colors = useColors()
  const insets = useSafeAreaInsets()
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
  const emailDeliveryLabel = email || "your email address"
  const mode = firstParam(params.mode) === "login" ? "login" : "sign-up"
  const apiMode = mode === "login" ? "login" : "sign_up"
  const isLocalFallback = firstParam(params.fallback) === "local"
  const name = firstParam(params.name) ?? "Store Owner"
  const businessName = firstParam(params.businessName) ?? "My Business"
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
    [
      isLocalFallback,
      params.businessId,
      params.id,
      params.role,
      params.status,
    ],
  )
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

  const verifyCode = useCallback(() => {
    if (code.length !== OTP_LENGTH || status === "verifying") return

    setStatus("verifying")

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
    code.length,
    completeOnboarding,
    email,
    isLocalFallback,
    localProfileOverrides,
    mode,
    name,
    status,
    verifyOtpMutation,
  ])

  useEffect(() => {
    if (code.length === OTP_LENGTH) {
      verifyCode()
    }
  }, [code.length, verifyCode])

  const helperText = useMemo(() => {
    if (message) return message
    if (status === "verifying" || verifyOtpMutation.isPending) {
      return "Verifying code"
    }
    if (status === "resent") return "Code sent again"
    return "Resend code"
  }, [message, status, verifyOtpMutation.isPending])

  const appendDigit = useCallback((digit: string) => {
    setCode((currentCode) => {
      if (currentCode.length >= OTP_LENGTH) return currentCode
      return `${currentCode}${digit}`
    })
    setMessage(null)
    setStatus((currentStatus) =>
      currentStatus === "error" ? "idle" : currentStatus,
    )
  }, [])

  const removeLastDigit = useCallback(() => {
    setCode((currentCode) => currentCode.slice(0, -1))
    setMessage(null)
    setStatus((currentStatus) =>
      currentStatus === "error" ? "idle" : currentStatus,
    )
  }, [])

  const pasteCode = useCallback(async () => {
    const clipboardValue = await Clipboard.getStringAsync()
    const digits = clipboardValue.replace(/\D/g, "").slice(0, OTP_LENGTH)

    if (!digits) {
      setStatus("error")
      setMessage("No 6-digit code found on clipboard.")
      return
    }

    setCode(digits)
    setMessage(null)
    setStatus("idle")
  }, [])

  const resendCode = useCallback(() => {
    if (requestOtpMutation.isPending) return

    if (isLocalFallback) {
      setStatus("resent")
      setMessage("Local fallback active. Any 6-digit code will continue.")
      return
    }

    requestOtpMutation.mutate({
      businessName,
      email,
      mode: apiMode,
      name,
    })
  }, [apiMode, businessName, email, isLocalFallback, name, requestOtpMutation])

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingBottom: Math.max(insets.bottom, 12),
          paddingTop: insets.top,
        },
      ]}
    >
      <AuthArtwork />
      <KeyboardAwareScrollView
        bottomOffset={40}
        contentContainerStyle={styles.scrollContent}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View className="min-h-full justify-between px-7 py-8">
          <View className="items-center gap-8">
            <View className="w-full items-center gap-2 pt-10">
              <Text className="text-center text-[17px] font-extrabold uppercase leading-5 text-foreground">
                {mode === "login" ? "Login code" : "Email verification"}
              </Text>
              <Text className="text-center text-[12px] leading-5 text-muted-foreground">
                Enter the code sent to {emailDeliveryLabel}
              </Text>
            </View>

            <OtpCodeCells value={code} />

            <View className="items-center gap-3">
              <Pressable
                className="min-h-8 items-center justify-center px-4"
                disabled={
                  requestOtpMutation.isPending || status === "verifying"
                }
                haptic
                onPress={resendCode}
                transition
              >
                <Text
                  className={
                    status === "error"
                      ? "text-center text-[12px] font-semibold text-destructive"
                      : "text-center text-[12px] text-muted-foreground"
                  }
                >
                  {requestOtpMutation.isPending ? "Sending code" : helperText}
                </Text>
              </Pressable>

              {isLocalFallback ? (
                <View className="flex-row items-center gap-2 border-y border-border py-2">
                  <Icon className="size-sm text-warn" name="Info" />
                  <Text className="text-[11px] font-medium text-muted-foreground">
                    Local fallback: any 6 digits work.
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View className="gap-4 pb-1">
            <View className="overflow-hidden border-t border-l border-border">
              {KEYPAD_ROWS.map((row) => (
                <View className="flex-row" key={row.join("-")}>
                  {row.map((key) => (
                    <OtpKey
                      disabled={status === "verifying"}
                      key={key}
                      label={key}
                      onDigitPress={appendDigit}
                      onDeletePress={removeLastDigit}
                      onPastePress={pasteCode}
                    />
                  ))}
                </View>
              ))}
            </View>

            <Link href={mode === "login" ? "/login" : "/sign-up"} asChild>
              <Pressable
                className="min-h-9 items-center justify-center"
                haptic
                transition
              >
                <Text className="text-[12px] font-semibold text-muted-foreground">
                  Use another email
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  )
}

function AuthArtwork() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={["rgba(38, 239, 255, 0.95)", "rgba(46, 102, 255, 0.65)"]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.artFold, styles.artFoldLeft]}
      />
      <LinearGradient
        colors={["rgba(252, 236, 114, 0.9)", "rgba(80, 97, 255, 0.74)"]}
        end={{ x: 0, y: 1 }}
        start={{ x: 1, y: 0 }}
        style={[styles.artFold, styles.artFoldRight]}
      />
      <LinearGradient
        colors={["rgba(42, 112, 255, 0.7)", "rgba(37, 244, 218, 0.42)"]}
        end={{ x: 1, y: 0 }}
        start={{ x: 0, y: 1 }}
        style={[styles.artFold, styles.artFoldBottom]}
      />
    </View>
  )
}

function OtpCodeCells({ value }: { value: string }) {
  return (
    <View className="flex-row gap-2.5">
      {Array.from({ length: OTP_LENGTH }, (_, index) => {
        const digit = value[index]
        const isActive = index === value.length && value.length < OTP_LENGTH

        return (
          <View
            className={
              isActive || digit
                ? "h-10 w-10 items-center justify-center rounded-lg border border-primary/70 bg-primary/10"
                : "h-10 w-10 items-center justify-center rounded-lg border border-border bg-card/70"
            }
            key={`otp-cell-${index + 1}`}
          >
            <Text className="text-[18px] font-bold text-foreground">
              {digit ? digit : ""}
            </Text>
            {digit ? null : (
              <View className="h-2 w-2 rounded-full bg-muted-foreground" />
            )}
          </View>
        )
      })}
    </View>
  )
}

function OtpKey({
  disabled,
  label,
  onDeletePress,
  onDigitPress,
  onPastePress,
}: {
  disabled: boolean
  label: (typeof KEYPAD_ROWS)[number][number]
  onDeletePress: () => void
  onDigitPress: (digit: string) => void
  onPastePress: () => void
}) {
  const isDigit = /^\d$/.test(label)

  if (label === "paste") {
    return (
      <Pressable
        accessibilityLabel="Paste verification code"
        className="h-[70px] flex-1 items-center justify-center border-r border-b border-border active:bg-accent"
        disabled={disabled}
        haptic
        onPress={onPastePress}
        transition
      >
        <Icon
          className="size-base text-muted-foreground"
          name="ClipboardList"
        />
      </Pressable>
    )
  }

  if (label === "delete") {
    return (
      <Pressable
        className="h-[70px] flex-1 items-center justify-center border-r border-b border-border active:bg-accent"
        disabled={disabled}
        haptic
        onPress={onDeletePress}
        transition
      >
        <Icon className="size-base text-foreground" name="Delete" />
      </Pressable>
    )
  }

  return (
    <Pressable
      className="h-[70px] flex-1 items-center justify-center border-r border-b border-border active:bg-accent"
      disabled={disabled || !isDigit}
      haptic
      onPress={() => onDigitPress(label)}
      transition
    >
      <Text className="text-[16px] font-medium text-foreground">{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  artFold: {
    borderRadius: 34,
    height: 128,
    opacity: 0.9,
    position: "absolute",
    width: 88,
  },
  artFoldBottom: {
    bottom: 66,
    height: 144,
    left: -42,
    transform: [{ rotate: "-28deg" }],
    width: 108,
  },
  artFoldLeft: {
    left: -36,
    top: 28,
    transform: [{ rotate: "38deg" }],
  },
  artFoldRight: {
    right: -36,
    top: 118,
    transform: [{ rotate: "-35deg" }],
  },
  screen: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
})
