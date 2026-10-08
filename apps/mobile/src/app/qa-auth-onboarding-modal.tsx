import { ActionButton } from "@/components/mobile/action-button"
import { ClassicLoginScreen } from "@/components/mobile/appearances/classic/login-screen"
import { ClassicOnboardingScreen } from "@/components/mobile/appearances/classic/onboarding-screen"
import {
  ClassicSignUpCategories,
  ClassicSignUpScreen,
} from "@/components/mobile/appearances/classic/sign-up-screen"
import { ClassicStaffOnboardingScreen } from "@/components/mobile/appearances/classic/staff-onboarding-screen"
import { ClassicVerifyEmailScreen } from "@/components/mobile/appearances/classic/verify-email-screen"
import { AuthDivider, AuthMethodButton } from "@/components/mobile/auth-header"
import { FormField } from "@/components/mobile/form-field"
import {
  AccountAgePresentation,
  type AgeSelection,
} from "@/components/mobile/green-till/age-screen"
import { ClassicNoAccessScreen } from "@/components/mobile/green-till/no-access-screen"
import { OtpInput } from "@/components/mobile/otp-input"
import { OtpKeypad } from "@/components/mobile/otp-keypad"
import { SignUpChoice } from "@/components/mobile/sign-up/sign-up-choice"
import { StatusBanner } from "@/components/mobile/status-banner"
import { VerificationResendLine } from "@/components/mobile/verify-email/verification-resend-line"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { applyThemeOverride } from "@/hooks/use-color"
import { isDevelopmentAppVariant } from "@/lib/app-variant"
import { appThemeRuntime } from "@/lib/theme-runtime"
import {
  BUSINESS_OPERATING_MODELS,
  BUSINESS_ORDER_CHANNELS,
  BUSINESS_TEAM_SIZES,
  listBusinessProfiles,
} from "@ewatrade/utils"
import { Redirect, Stack, useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"

// Deterministic visual/interaction fixture. No auth hooks, queries or mutations.
export default function AuthOnboardingQaRoute() {
  const params = useLocalSearchParams<{
    live?: string
    view?: string
    state?: string
    theme?: string
    step?: string
    mode?: string
  }>()
  if (!__DEV__ || !isDevelopmentAppVariant()) return <Redirect href="/" />
  if (params.live === "login") return <Redirect href="/login" />
  if (params.live === "signup") return <Redirect href="/sign-up" />
  if (params.live === "continue")
    return <Redirect href="/continue-onboarding" />
  if (params.live === "noaccess") return <Redirect href="/no-access" />
  if (params.live === "staff")
    return (
      <Redirect
        href={{
          pathname: "/staff-onboarding",
          params: { inviteToken: "invalid-local-qa-token" },
        }}
      />
    )
  if (params.live === "verify")
    return (
      <Redirect
        href={{
          pathname: "/verify-email",
          params: { email: "owner@example.test", mode: "login" },
        }}
      />
    )
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          animation: "none",
          statusBarStyle: "light",
        }}
      />
      <AuthQa key={JSON.stringify(params)} />
    </>
  )
}

function AuthQa() {
  const params = useLocalSearchParams<{
    live?: string
    view?: string
    state?: string
    theme?: string
    step?: string
    mode?: string
  }>()
  const [view, setView] = useState(params.view ?? "intro")
  const [step, setStep] = useState(
    Math.max(0, Math.min(3, Number(params.step) || 0)),
  )
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [code, setCode] = useState("")
  const [passwordMode, setPasswordMode] = useState(params.mode === "password")
  const [error, setError] = useState(params.state === "error")
  const [selected, setSelected] = useState("")
  const [age, setAge] = useState<AgeSelection>(
    params.state === "blocked" ? "UNDER_13" : null,
  )
  const [choices, setChoices] = useState<string[]>([
    "products",
    "walk_in",
    "solo",
  ])
  const busy = params.state === "busy"
  const offline = params.state === "offline"
  useEffect(() => {
    const previous = appThemeRuntime.getSnapshot()
    if (params.theme === "light" || params.theme === "dark")
      applyThemeOverride(params.theme)
    return () => applyThemeOverride(previous)
  }, [params.theme])
  const feedback = offline ? (
    <StatusBanner
      title="You’re offline"
      message="Connect to continue. Nothing you typed is lost."
      icon="WifiOff"
      tone="warning"
    />
  ) : error ? (
    <StatusBanner
      title="Unable to continue"
      message="Check your details and try again."
      tone="destructive"
    />
  ) : null
  const fieldVariant = "green-gate"
  if (view === "age")
    return (
      <AccountAgePresentation
        selected={age}
        onSelect={setAge}
        onContinue={() => {
          setView("setup")
          setStep(0)
        }}
      />
    )
  if (view === "noaccess")
    return (
      <ClassicNoAccessScreen
        email="owner@example.test"
        checking={busy}
        onStart={() => {
          setView("age")
          setStep(0)
        }}
        onShareEmail={() => {}}
        onPrivacy={() => {}}
        onCheck={() => setError(true)}
        onSignOut={() => setView("login")}
      />
    )
  if (view === "intro")
    return (
      <ClassicOnboardingScreen
        stepIndex={Math.min(step, 2)}
        onContinue={() => (step < 2 ? setStep(step + 1) : setView("login"))}
        onFinish={() => setView("login")}
      />
    )
  if (view === "login")
    return (
      <ClassicLoginScreen
        footer={
          <Pressable
            accessibilityRole="button"
            className="min-h-11 items-center justify-center"
            onPress={() => {
              setView("setup")
              setStep(0)
            }}
          >
            <Text className="text-sm font-bold text-primary">
              Create your business account
            </Text>
          </Pressable>
        }
      >
        <View className="gap-4">
          {feedback}
          <FormField
            label="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="Enter your email address"
            variant={fieldVariant}
          />
          {passwordMode ? (
            <FormField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter your password"
              variant={fieldVariant}
            />
          ) : null}
          <ActionButton
            disabled={!email.trim() || (passwordMode && !password) || offline}
            isLoading={busy}
            loadingLabel={passwordMode ? "Signing in" : "Sending code"}
            onPress={() => (passwordMode ? setError(true) : setView("verify"))}
          >
            {passwordMode ? "Sign in with password" : "Send login code"}
          </ActionButton>
          <Pressable
            accessibilityRole="button"
            className="min-h-11 items-center justify-center"
            onPress={() => {
              setPasswordMode(!passwordMode)
              setError(false)
            }}
          >
            <Text className="font-bold text-primary">
              {passwordMode
                ? "Use a login code instead"
                : "Use a password instead"}
            </Text>
          </Pressable>
          <AuthDivider label="or" />
          <AuthMethodButton
            brandIcon="google"
            label="Google"
            onPress={() => setError(true)}
            disabled={busy || offline}
          />
        </View>
      </ClassicLoginScreen>
    )
  if (view === "verify")
    return (
      <ClassicVerifyEmailScreen
        authEntryHref="/login"
        email={email || "owner@example.test"}
        mode="login"
        otp={
          <OtpInput
            disableSystemKeyboard
            value={code}
            onChange={setCode}
            variant="reference"
          />
        }
        resend={
          <>
            <VerificationResendLine
              design="classic"
              disabled={busy || offline}
              isError={error}
              isSending={false}
              isVerifying={busy}
              message={
                error ? "That code didn’t match. Check the latest email." : null
              }
              onPress={() => {
                setCode("")
                setError(false)
              }}
              wasResent={false}
            />
            {offline ? feedback : null}
          </>
        }
        keypad={
          <OtpKeypad
            disabled={busy || offline}
            onDigitPress={(digit) => {
              if (code.length < 6) setCode(code + digit)
              if (code.length === 5) {
                setCode("")
                setError(true)
              }
            }}
            onDeletePress={() => setCode(code.slice(0, -1))}
            onPastePress={() => {
              setCode("4821")
              setError(false)
            }}
          />
        }
      />
    )
  if (view === "staff")
    return (
      <ClassicStaffOnboardingScreen
        businessName="Fixture workspace"
        email="staff@example.test"
        roleLabel="Sales rep"
        name={name}
        displayName={displayName}
        onChangeName={setName}
        onChangeDisplayName={setDisplayName}
        canSubmit={!!name.trim() && !offline}
        isSubmitting={busy}
        submitError={
          offline
            ? "Connect to activate your staff access."
            : error
              ? "Staff setup could not be completed. Try again."
              : null
        }
        onSubmit={() => setError(true)}
      />
    )
  const steps = ["businessType", "profile", "business", "account"] as const
  const titles = [
    "What kind of business do you run?",
    "How does your business work?",
    "Tell us about your business.",
    "Create your owner account.",
  ]
  const toggle = (key: string, group?: readonly { key: string }[]) =>
    setChoices((current) =>
      group
        ? [
            ...current.filter(
              (value) => !group.some((item) => item.key === value),
            ),
            key,
          ]
        : current.includes(key)
          ? current.filter((value) => value !== key)
          : [...current, key],
    )
  return (
    <ClassicSignUpScreen
      step={steps[step] ?? "businessType"}
      header={{
        step: step + 1,
        title: titles[step] ?? titles[0],
        subtitle: "Complete your business setup.",
      }}
      onBack={() => (step > 0 ? setStep(step - 1) : setView("login"))}
      footer={null}
    >
      {feedback}
      {step === 0 ? (
        <ClassicSignUpCategories
          profiles={listBusinessProfiles()}
          selectedKey={selected}
          onSelect={(profile) => {
            setSelected(profile.key)
            setStep(1)
          }}
        />
      ) : step === 1 ? (
        <View className="gap-5">
          {[
            ["What will you manage?", BUSINESS_OPERATING_MODELS],
            ["How do customers order?", BUSINESS_ORDER_CHANNELS],
            ["Team size", BUSINESS_TEAM_SIZES],
          ].map(([label, options], index) => (
            <View key={String(label)} className="gap-2">
              <Text className="text-sm font-bold text-foreground">
                {String(label)}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {(options as typeof BUSINESS_OPERATING_MODELS).map((option) => (
                  <SignUpChoice
                    key={option.key}
                    appearance="classic"
                    label={option.label}
                    selected={choices.includes(option.key)}
                    multiple={index === 1}
                    onPress={() =>
                      toggle(
                        option.key,
                        index === 1
                          ? undefined
                          : (options as typeof BUSINESS_OPERATING_MODELS),
                      )
                    }
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : step === 2 ? (
        <View className="gap-4">
          <FormField
            label="Business name"
            value={name}
            onChangeText={setName}
            variant={fieldVariant}
          />
          <FormField
            label="Business address"
            value={displayName}
            onChangeText={setDisplayName}
            variant={fieldVariant}
          />
          <FormField
            label="City"
            value={email}
            onChangeText={setEmail}
            variant={fieldVariant}
          />
          <FormField
            label="Phone"
            value={password}
            onChangeText={setPassword}
            keyboardType="phone-pad"
            variant={fieldVariant}
          />
        </View>
      ) : (
        <View className="gap-4">
          <FormField
            label="Your name"
            value={name}
            onChangeText={setName}
            variant={fieldVariant}
          />
          <FormField
            label="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            variant={fieldVariant}
          />
          <StatusBanner message="Fixture only. No account or legal acceptance is submitted." />
        </View>
      )}
      {step > 0 ? (
        <ActionButton
          disabled={offline}
          isLoading={busy}
          loadingLabel="Sending code"
          onPress={() => (step < 3 ? setStep(step + 1) : setError(true))}
        >
          {step < 3 ? "Continue" : "Send verification code"}
        </ActionButton>
      ) : null}
    </ClassicSignUpScreen>
  )
}
