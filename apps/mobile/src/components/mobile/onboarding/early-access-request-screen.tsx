import {
  AuthActionButton,
  AuthBrandHeader,
  MobileScreen,
  StatusBanner,
} from "@/components/mobile"
import { FormField } from "@/components/mobile/form-field"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { requestNativeEarlyAccess } from "@/lib/onboarding-web-client"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"

const teamOptions = [
  ["solo", "Just me"],
  ["2_to_10", "2–10 people"],
  ["11_to_50", "11–50 people"],
  ["51_plus", "51+ people"],
] as const
const recordOptions = [
  ["paper", "Paper"],
  ["spreadsheets", "Spreadsheets"],
  ["software", "Software"],
  ["mixed", "A mix"],
  ["starting", "Starting fresh"],
] as const
const timingOptions = [
  ["as_soon_as_possible", "As soon as possible"],
  ["within_30_days", "Within 30 days"],
  ["within_3_months", "Within 3 months"],
  ["exploring", "Exploring"],
] as const
const needOptions = [
  ["catalog", "Catalog"],
  ["inventory", "Inventory"],
  ["sales", "Sales"],
  ["services", "Services"],
  ["customers", "Customers"],
  ["finance", "Finance"],
  ["storefront", "Online store"],
] as const

export function EarlyAccessRequestScreen() {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [phone, setPhone] = useState("")
  const [businessSize, setBusinessSize] = useState("")
  const [recordSystem, setRecordSystem] = useState("")
  const [launchTimeline, setLaunchTimeline] = useState("")
  const [setupNeeds, setSetupNeeds] = useState<string[]>([])
  const request = useMutation({
    mutationFn: requestNativeEarlyAccess,
    gcTime: 0,
  })
  if (request.data)
    return (
      <MobileScreen contentClassName="justify-center gap-6">
        <AuthBrandHeader
          title="Request received"
          subtitle="We’ll review your business details and email your setup link after approval."
        />
        <StatusBanner message={request.data.message} />
        <AuthActionButton onPress={() => router.replace("/login")}>
          Return to sign in
        </AuthActionButton>
      </MobileScreen>
    )
  return (
    <MobileScreen contentClassName="gap-5">
      <AuthBrandHeader
        title="Request early access"
        subtitle="Tell us about your business. Your approval email will let you continue setup in this app."
      />
      <FormField
        label="Your name"
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
      />
      <FormField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <FormField
        label="Business name"
        value={companyName}
        onChangeText={setCompanyName}
      />
      <FormField
        label="Phone (optional)"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <Choices
        title="Team size"
        options={teamOptions}
        selected={[businessSize]}
        onSelect={setBusinessSize}
      />
      <Choices
        title="How do you keep records?"
        options={recordOptions}
        selected={[recordSystem]}
        onSelect={setRecordSystem}
      />
      <Choices
        title="When would you like to start?"
        options={timingOptions}
        selected={[launchTimeline]}
        onSelect={setLaunchTimeline}
      />
      <Choices
        title="What would you like to set up?"
        options={needOptions}
        selected={setupNeeds}
        multiple
        onSelect={(key) =>
          setSetupNeeds((values) =>
            values.includes(key)
              ? values.filter((value) => value !== key)
              : [...values, key],
          )
        }
      />
      {request.error ? (
        <StatusBanner tone="destructive" message={request.error.message} />
      ) : null}
      <AuthActionButton
        isLoading={request.isPending}
        loadingLabel="Sending request…"
        disabled={
          !fullName.trim() ||
          !email.trim() ||
          !companyName.trim() ||
          !businessSize ||
          !recordSystem ||
          !launchTimeline ||
          !setupNeeds.length
        }
        onPress={() =>
          request.mutate({
            fullName,
            email,
            companyName,
            phone,
            businessSize,
            recordSystem,
            launchTimeline,
            setupNeeds,
          })
        }
      >
        Request access
      </AuthActionButton>
      <AuthActionButton
        variant="secondary"
        onPress={() => router.push("/continue-onboarding")}
      >
        I already have a setup email
      </AuthActionButton>
      <AuthActionButton
        variant="secondary"
        onPress={() => router.replace("/login")}
      >
        Return to sign in
      </AuthActionButton>
    </MobileScreen>
  )
}

function Choices({
  title,
  options,
  selected,
  multiple = false,
  onSelect,
}: {
  title: string
  options: readonly (readonly [string, string])[]
  selected: string[]
  multiple?: boolean
  onSelect: (key: string) => void
}) {
  return (
    <View className="gap-2">
      <Text className="font-semibold text-foreground">{title}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole={multiple ? "checkbox" : "radio"}
            accessibilityState={{ checked: selected.includes(key) }}
            className={`min-h-11 justify-center rounded-lg border px-3 ${selected.includes(key) ? "border-primary bg-primary/10" : "border-border"}`}
            onPress={() => onSelect(key)}
          >
            <Text className="text-foreground">{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}
