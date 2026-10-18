import {
  AuthActionButton,
  AuthMethodButton,
} from "@/components/mobile/auth-header"
import { GreenTillAuthScreen } from "@/components/mobile/green-till/auth-screen"
import { SetupPreviewStage } from "@/components/mobile/green-till/auth-stage"
import { StartupSplash } from "@/components/mobile/startup-splash"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { getPlan } from "@/lib/retail-ops-subscription"
import { stepDirection } from "@/lib/step-motion"
import { useTRPC } from "@/trpc/client"
import {
  defaultBusinessOffer,
  groupBusinessTypes,
} from "@ewatrade/utils/business-types"
import {
  type OwnerSetupBusiness,
  type OwnerSetupDraft,
  readOwnerSignupDraft,
} from "@ewatrade/utils/owner-signup"
import { isValidStoreLink } from "@ewatrade/utils/store-link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Redirect, useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { ScrollView } from "react-native"
import { OwnerGroupStep } from "./owner-group-step"
import { OwnerStoreStep } from "./owner-store-step"
import { OwnerTypeFooter, OwnerTypePicker } from "./owner-type-picker"

const steps = ["type", "group", "store"] as const
type Step = (typeof steps)[number]
export function OwnerSetupScreen() {
  const auth = useAuthContext()
  const trpc = useTRPC()
  const client = useQueryClient()
  const router = useRouter()
  const setup = useQuery(
    trpc.tenant.ownerSignupSetup.queryOptions(undefined, {
      enabled: auth.isAuthenticated,
      retry: false,
    }),
  )
  const [step, setStep] = useState<Step>("type")
  const [types, setTypes] = useState<string[]>([])
  const [other, setOther] = useState("")
  const [businesses, setBusinesses] = useState<OwnerSetupBusiness[]>([])
  const [plan, setPlan] = useState<OwnerSetupDraft["planId"]>("starter")
  const [active, setActive] = useState(0)
  const [query, setQuery] = useState("")
  const [multi, setMulti] = useState(false)
  const [focused, setFocused] = useState(false)
  const [footerHeight, setFooterHeight] = useState(0)
  const [groupReady, setGroupReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const restored = useRef(false)
  const previous = useRef<Step>(step)
  const direction = stepDirection(steps, previous.current, step)
  useEffect(() => {
    previous.current = step
  }, [step])
  useEffect(() => {
    if (!setup.data || restored.current) return
    restored.current = true
    const saved = readOwnerSignupDraft(setup.data.draft)
    if (saved) {
      setBusinesses(saved.businesses)
      setTypes(saved.businesses.flatMap((b) => b.typeKeys))
      setOther(
        saved.businesses.find((b) => b.typeKeys.includes("other"))?.otherType ??
          "",
      )
      setPlan(saved.planId)
      setMulti(saved.businesses.flatMap((b) => b.typeKeys).length > 1)
    }
  }, [setup.data])
  const save = useMutation(
    trpc.tenant.saveOwnerSignupDraft.mutationOptions({
      gcTime: 0,
      onError: (e) => setError(e.message),
    }),
  )
  const draft = JSON.stringify({ planId: plan, businesses })
  useEffect(() => {
    if (!readOwnerSignupDraft(JSON.parse(draft))) return
    if (
      !restored.current ||
      !businesses.length ||
      businesses.some(
        (b) => !b.name || !isValidStoreLink(b.slug) || !b.typeKeys.length,
      )
    )
      return
    const timer = setTimeout(() => save.mutate(JSON.parse(draft)), 800)
    return () => clearTimeout(timer)
  }, [draft, save.mutate, businesses])
  const finish = useMutation(
    trpc.tenant.completeOwnerSignup.mutationOptions({
      onError: (e) => setError(e.message),
      onSuccess: async () => {
        await client.invalidateQueries(
          trpc.auth.getMobileAccessProfile.queryFilter(),
        )
        await client.invalidateQueries(trpc.tenant.businesses.queryFilter())
        await client.invalidateQueries(
          trpc.tenant.ownerSignupSummary.queryFilter(),
        )
        auth.updateAccessProfile({
          ...auth.accessProfile,
          hasBusinessAccess: true,
          hasCustomerHistory: auth.accessProfile?.hasCustomerHistory ?? false,
          setupPending: false,
        })
        router.replace("/")
      },
    }),
  )
  if (!auth.isAuthenticated) return <Redirect href="/login" />
  if (setup.isPending) return <StartupSplash />
  if (setup.isError)
    return (
      <GreenTillAuthScreen
        title="Finish setting up your business"
        subtitle="Connect to load your saved setup."
      >
        <StatusBanner
          title="Setup unavailable"
          message={setup.error.message}
          tone="destructive"
          icon="TriangleAlert"
        />
        <AuthActionButton onPress={() => void setup.refetch()}>
          Try again
        </AuthActionButton>
      </GreenTillAuthScreen>
    )
  if (!setup.data) return <Redirect href="/" />
  const first = setup.data
  function selectTypes(keys: string[]) {
    setTypes(keys)
    if (keys.length)
      setBusinesses([
        {
          name: first.name,
          slug: first.slug,
          typeKeys: keys,
          otherType: other,
          operatingModel: defaultBusinessOffer(keys),
          countryCode: "NG",
          currencyCode: "NGN",
        },
      ])
  }
  function updateOther(text: string) {
    setOther(text)
    setBusinesses((current) =>
      current.map((b) =>
        b.typeKeys.includes("other") ? { ...b, otherType: text } : b,
      ),
    )
  }

  function group(mode: "suggested" | "together" | "separate") {
    const groups =
      mode === "together"
        ? [types]
        : mode === "separate"
          ? types.map((key) => [key])
          : groupBusinessTypes(types)
    setBusinesses(
      groups.map((typeKeys, index) => ({
        name: index === 0 ? first.name : (businesses[index]?.name ?? ""),
        slug: index === 0 ? first.slug : (businesses[index]?.slug ?? ""),
        typeKeys,
        otherType: typeKeys.includes("other") ? other.trim() : undefined,
        operatingModel: defaultBusinessOffer(typeKeys),
        countryCode: businesses[index]?.countryCode ?? "NG",
        currencyCode: businesses[index]?.currencyCode ?? "NGN",
        description: businesses[index]?.description ?? "",
      })),
    )
    setGroupReady(groups.length === 1)
  }
  const validTypes =
    types.length > 0 && (!types.includes("other") || other.trim().length >= 2)
  const limit = getPlan(plan).limits.businesses ?? 1
  const now = businesses.slice(0, limit)
  const business = now[active]
  function proceedTypes() {
    if (!validTypes) return
    group("suggested")
    setActive(0)
    setStep(types.length > 1 ? "group" : "store")
  }
  function nextStore() {
    if (active < now.length - 1) setActive(active + 1)
    else finish.mutate({ planId: plan, businesses })
  }
  const footer =
    step === "type" ? (
      <OwnerTypeFooter
        query={query}
        onQuery={setQuery}
        onFocus={setFocused}
        onHeight={setFooterHeight}
        multi={multi}
        selected={types}
        valid={validTypes}
        onMore={() => setMulti(true)}
        onContinue={proceedTypes}
      />
    ) : null
  return (
    <GreenTillAuthScreen
      title={
        step === "type"
          ? "What kind of business is it?"
          : step === "group"
            ? "How do you run these?"
            : "Set up your store"
      }
      subtitle={
        step === "type"
          ? multi
            ? "Tick every type you run. We use them to suggest products, categories and tips."
            : "Pick the closest one. We use it to suggest products, categories and tips."
          : step === "group"
            ? "Types in the same card are one business. Drag a type or tap it to move it."
            : "A few details for customers and your daily work."
      }
      progress={
        step === "type" ? 2 : step === "group" ? 3 : types.length > 1 ? 4 : 3
      }
      progressTotal={types.length > 1 ? 4 : 3}
      motionKey={`${step}-${active}`}
      motionDirection={direction}
      compact
      stageCollapsed={step === "type" && focused}
      footerHeight={step === "type" ? footerHeight : 0}
      footer={footer}
      onBack={() => {
        setError(null)
        if (step === "store" && active > 0) setActive(active - 1)
        else if (step === "store") setStep(types.length > 1 ? "group" : "type")
        else if (step === "group") setStep("type")
        else auth.onLogout()
      }}
      stage={
        <SetupPreviewStage
          businessName={first.name}
          chips={["Your business", "Your store link"]}
        />
      }
      testID={`owner-setup-${step}`}
    >
      {error ? (
        <StatusBanner
          title="Could not save setup"
          message={error}
          tone="destructive"
          icon="TriangleAlert"
        />
      ) : null}
      {step === "type" ? (
        <OwnerTypePicker
          selected={types}
          other={other}
          onSelected={selectTypes}
          onOther={updateOther}
          query={query}
          multi={multi}
          footerHeight={footerHeight}
        />
      ) : null}
      {step === "group" ? (
        <>
          <OwnerGroupStep
            businesses={businesses}
            plan={plan}
            onChange={setBusinesses}
            onPlan={setPlan}
            onPreset={group}
            onReady={setGroupReady}
            email={auth.profile?.email}
          />
          <AuthActionButton
            disabled={!groupReady}
            onPress={() => {
              setActive(0)
              setStep("store")
            }}
          >
            Continue with {businesses.length}{" "}
            {businesses.length === 1 ? "business" : "businesses"}
          </AuthActionButton>
        </>
      ) : null}
      {step === "store" && business ? (
        <>
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
            {now.length > 1
              ? now.map((b, i) => (
                  <Pressable
                    key={b.slug}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: i === active }}
                    className={`min-h-11 justify-center rounded-full border px-3.5 ${i === active ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                    onPress={() => setActive(i)}
                  >
                    <Text className="text-xs font-bold text-foreground">
                      {b.name}
                    </Text>
                  </Pressable>
                ))
              : null}
          </ScrollView>
          <OwnerStoreStep
            key={business.slug}
            business={business}
            plan={plan}
            onChange={(patch) =>
              setBusinesses((current) =>
                current.map((b, i) => (i === active ? { ...b, ...patch } : b)),
              )
            }
          />
          <AuthActionButton
            isLoading={finish.isPending}
            disabled={
              finish.isPending ||
              !business.countryCode ||
              !business.currencyCode
            }
            onPress={nextStore}
          >
            {active < now.length - 1
              ? `Next: ${now[active + 1]?.name}`
              : "Finish setup"}
          </AuthActionButton>
          <AuthMethodButton
            label="Save and return later"
            disabled={finish.isPending || save.isPending}
            onPress={() => {
              save.mutate(
                { planId: plan, businesses },
                { onSuccess: () => router.replace("/login") },
              )
            }}
          />
        </>
      ) : null}
    </GreenTillAuthScreen>
  )
}
