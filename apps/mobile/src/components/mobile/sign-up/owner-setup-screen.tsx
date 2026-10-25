import { AuthActionButton } from "@/components/mobile/auth-header"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { GreenTillAuthScreen } from "@/components/mobile/green-till/auth-screen"
import { StartupSplash } from "@/components/mobile/startup-splash"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { getPlan } from "@/lib/retail-ops-subscription"
import { useTRPC } from "@/trpc/client"
import {
  defaultBusinessOffer,
  groupBusinessTypes,
} from "@ewatrade/utils/business-types"
import {
  type OwnerSetupBusiness,
  type OwnerSetupDraft,
  readOwnerSignupDraft,
  reconcileOwnerBusinessTypes,
  syncOwnerSignupPlan,
} from "@ewatrade/utils/owner-signup"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import { Redirect, useRouter } from "expo-router"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { AppState, Keyboard, ScrollView } from "react-native"
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { OwnerGroupStep } from "./owner-group-step"
import { OwnerSignupFrame } from "./owner-signup-frame"
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
  const [groupedFor, setGroupedFor] = useState("")
  const [active, setActive] = useState(0)
  const [query, setQuery] = useState("")
  const [multi, setMulti] = useState(false)
  const [pickRequest, setPickRequest] = useState(0)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (step === "type") {
      setMulti(false)
      setPickRequest(0)
    }
  }, [step])
  const [footerHeight, setFooterHeight] = useState(0)
  const [groupReady, setGroupReady] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorTitle, setErrorTitle] = useState("Could not save setup")
  const [conflictBusinessId, setConflictBusinessId] = useState<string>()
  const [isFinishing, setIsFinishing] = useState(false)
  const mounted = useRef(true)
  const restored = useRef(false)
  const finishing = useRef(false)
  const completed = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef<Promise<unknown>>(Promise.resolve())
  const previous = useRef({ step, active })
  const stepDirection =
    step === previous.current.step
      ? Math.sign(active - previous.current.active)
      : Math.sign(steps.indexOf(step) - steps.indexOf(previous.current.step))
  useEffect(() => {
    previous.current = { step, active }
  }, [step, active])
  useEffect(() => {
    if (!setup.data || restored.current) return
    restored.current = true
    const saved = readOwnerSignupDraft(setup.data.draft, {
      allowIncomplete: true,
    })
    if (!saved) return
    const keys =
      saved.selectedTypeKeys ?? saved.businesses.flatMap((b) => b.typeKeys)
    setBusinesses(saved.businesses)
    setTypes(keys)
    setOther(
      saved.otherType ??
        saved.businesses.find((b) => b.typeKeys.includes("other"))?.otherType ??
        "",
    )
    setPlan(syncOwnerSignupPlan(saved.planId, saved.businesses.length))
    setGroupedFor(saved.groupedFor ?? keys.join(","))
    setMulti(false)
    setStep(saved.step ?? (saved.businesses.length ? "store" : "type"))
    setActive(
      Math.min(
        saved.storeIndex ?? 0,
        Math.max(
          0,
          Math.min(
            saved.businesses.length,
            getPlan(saved.planId).limits.businesses,
          ) - 1,
        ),
      ),
    )
  }, [setup.data])
  const save = useMutation(
    trpc.tenant.saveOwnerSignupDraft.mutationOptions({ gcTime: 0 }),
  )
  const draft: OwnerSetupDraft = {
    planId: plan,
    businesses,
    step,
    storeIndex: active,
    groupedFor,
    selectedTypeKeys: types,
    otherType: other,
  }
  useEffect(() => {
    if (!restored.current || !businesses.length) return
    setPlan((current) => syncOwnerSignupPlan(current, businesses.length))
  }, [businesses.length])
  useEffect(() => {
    setActive((current) =>
      Math.min(
        current,
        Math.max(
          0,
          Math.min(businesses.length, getPlan(plan).limits.businesses) - 1,
        ),
      ),
    )
  }, [businesses.length, plan])
  const serialized = JSON.stringify(draft)
  const latestDraft = useRef(draft)
  latestDraft.current = draft
  // All writes share one queue so a slower older save cannot win over a newer one.
  const saveNow = useRef(save.mutateAsync)
  saveNow.current = save.mutateAsync
  const enqueueSave = useCallback((snapshot: OwnerSetupDraft) => {
    const request = inFlight.current
      .catch(() => undefined)
      .then(() => saveNow.current(snapshot))
    inFlight.current = request
    return request
  }, [])
  const flushSave = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (!restored.current || finishing.current || completed.current)
      return inFlight.current
    return enqueueSave(latestDraft.current)
  }, [enqueueSave])
  useEffect(() => {
    mounted.current = true
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void flushSave().catch(() => undefined)
    })
    return () => {
      mounted.current = false
      subscription.remove()
      void flushSave().catch(() => undefined)
    }
  }, [flushSave])
  useEffect(() => {
    if (!restored.current || finishing.current || completed.current) return
    const snapshot = readOwnerSignupDraft(JSON.parse(serialized), {
      allowIncomplete: true,
    })
    if (!snapshot) return
    timer.current = setTimeout(() => {
      timer.current = null
      if (finishing.current || completed.current) return
      void enqueueSave(snapshot).then(
        () => {
          if (mounted.current) setError(null)
        },
        (e: Error) => {
          if (mounted.current) {
            setErrorTitle("Could not save setup")
            setError(e.message)
          }
        },
      )
    }, 800)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [serialized, enqueueSave])
  const finish = useMutation(trpc.tenant.completeOwnerSignup.mutationOptions())
  async function complete() {
    if (finishing.current || completed.current) return
    if (
      !readOwnerSignupDraft(draft) ||
      businesses
        .slice(0, getPlan(plan).limits.businesses)
        .some((business) => !business.countryCode || !business.currencyCode)
    ) {
      setErrorTitle("Check your business details")
      setError(
        "Complete each business name, store link and type, and choose a country and currency for the businesses you are setting up now.",
      )
      return
    }
    finishing.current = true
    setIsFinishing(true)
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    setError(null)
    try {
      await enqueueSave(draft)
      await finish.mutateAsync(draft)
      completed.current = true
      await Promise.all([
        client.invalidateQueries(
          trpc.auth.getMobileAccessProfile.queryFilter(),
        ),
        client.invalidateQueries(trpc.tenant.businesses.queryFilter()),
        client.invalidateQueries(trpc.tenant.ownerSignupSummary.queryFilter()),
      ])
      auth.updateAccessProfile({
        ...auth.accessProfile,
        hasBusinessAccess: true,
        hasCustomerHistory: auth.accessProfile?.hasCustomerHistory ?? false,
        setupPending: false,
      })
      router.replace("/")
    } catch (e) {
      setErrorTitle("Could not finish setup")
      const businessId =
        e instanceof TRPCClientError ? e.data?.ownerSignupBusinessId : undefined
      if (typeof businessId === "string") {
        setConflictBusinessId(businessId)
        setActive(
          Math.max(
            0,
            businesses.findIndex((b) => b.id === businessId),
          ),
        )
        setStep("group")
      }
      setError(
        e instanceof Error ? e.message : "Could not finish setup. Try again.",
      )
    } finally {
      finishing.current = false
      setIsFinishing(false)
    }
  }
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
    if (!multi) Keyboard.dismiss()
    setPickRequest((current) => current + 1)
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
    const used = new Set<string>()
    const same = (a: string[], b: string[]) =>
      a.length === b.length && a.every((key) => b.includes(key))
    const next = groups.map((typeKeys, index) => {
      const matched =
        index === 0
          ? businesses[0]
          : businesses
              .slice(1)
              .find((b) => !used.has(b.id ?? "") && same(b.typeKeys, typeKeys))
      let id = matched?.id ?? `business-${index}`
      let sequence = index
      while (used.has(id) || (!matched && businesses.some((b) => b.id === id)))
        id = `business-${++sequence}`
      used.add(id)
      return {
        ...matched,
        id,
        name: index === 0 ? first.name : (matched?.name ?? ""),
        slug: index === 0 ? first.slug : (matched?.slug ?? ""),
        typeKeys,
        otherType: typeKeys.includes("other") ? other.trim() : undefined,
        operatingModel: matched?.offerTouched
          ? matched.operatingModel
          : defaultBusinessOffer(typeKeys),
        countryCode: matched?.countryCode ?? "",
        currencyCode: matched?.currencyCode ?? "",
      } satisfies OwnerSetupBusiness
    })
    setBusinesses(next)
    setGroupedFor(types.join(","))
    setGroupReady(next.length === 1)
  }
  const validTypes =
    types.length > 0 && (!types.includes("other") || other.trim().length >= 2)
  const limit = getPlan(plan).limits.businesses ?? 1
  const now = businesses.slice(0, limit)
  const business = now[active]
  function proceedTypes() {
    if (!validTypes) return
    if (groupedFor !== types.join(",") || !businesses.length) {
      const next = reconcileOwnerBusinessTypes(
        businesses,
        types,
        {
          id: "business-0",
          name: first.name,
          slug: first.slug,
          typeKeys: [],
          operatingModel: "products",
          countryCode: "",
          currencyCode: "",
        },
        other,
      )
      setBusinesses(next)
      setGroupedFor(types.join(","))
      setGroupReady(next.length === 1)
    }
    setActive(0)
    setStep(types.length > 1 ? "group" : "store")
  }
  function nextStore() {
    if (active < now.length - 1) setActive(active + 1)
    else void complete()
  }
  const footer =
    step === "type" ? (
      <OwnerTypeFooter
        query={query}
        onQuery={setQuery}
        onFocus={setFocused}
        onHeight={setFooterHeight}
        multi={multi}
        pickRequest={pickRequest}
        other={other}
        onOther={updateOther}
        selected={types}
        valid={validTypes}
        onMore={() => setMulti(true)}
        onClear={() => {
          setTypes([])
          setMulti(false)
        }}
        onContinue={proceedTypes}
      />
    ) : (
      <BottomSearchFooter
        accessibilityLabel="Setup actions"
        placeholder=""
        value=""
        onChangeText={() => undefined}
        totalCount={0}
        searchVisible={false}
        variant="action-bar"
        onHeightChange={setFooterHeight}
      >
        {step === "group" ? (
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
        ) : (
          <AuthActionButton
            isLoading={isFinishing}
            disabled={
              isFinishing || !business?.countryCode || !business.currencyCode
            }
            onPress={nextStore}
          >
            {active < now.length - 1
              ? `Next: ${now[active + 1]?.name}`
              : "Finish setup"}
          </AuthActionButton>
        )}
      </BottomSearchFooter>
    )
  return (
    <OwnerSignupFrame
      key={`${step}-${active}`}
      title={
        step === "type"
          ? "What kind of business is it?"
          : step === "group"
            ? "How do you run these?"
            : `Set up ${business?.name ?? "your store"}`
      }
      subtitle={
        step === "type"
          ? multi
            ? "Tick every type you run. We use them to suggest goods, categories and tips."
            : "Pick the closest one. We use it to suggest goods, categories and tips."
          : step === "group"
            ? "Types in the same card are one business. Drag a type to another card, or onto “New business” to run it separately."
            : "Almost done. You can change all of this later."
      }
      progress={
        step === "type" ? 2 : step === "group" ? 3 : types.length > 1 ? 4 : 3
      }
      progressTotal={types.length > 1 ? 4 : 3}
      collapsed={step === "type" && focused}
      footerHeight={footerHeight}
      footer={footer}
      scrollEnabled={!dragging && !isFinishing}
      onBack={
        step === "type"
          ? undefined
          : () => {
              if (isFinishing) return
              setError(null)
              if (step === "store" && active > 0) setActive(active - 1)
              else if (step === "store")
                setStep(types.length > 1 ? "group" : "type")
              else setStep("type")
            }
      }
      testID={`owner-setup-${step}`}
    >
      <OwnerStepBody
        key={`${step}-${active}`}
        direction={stepDirection}
        disabled={isFinishing}
      >
        {error ? (
          <StatusBanner
            title={errorTitle}
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
          <OwnerGroupStep
            businesses={businesses}
            plan={plan}
            onChange={setBusinesses}
            onPlan={setPlan}
            onPreset={group}
            onReady={setGroupReady}
            onDragging={setDragging}
            email={auth.profile?.email}
            conflictBusinessId={conflictBusinessId}
            onConflictEditorOpened={() => setConflictBusinessId(undefined)}
          />
        ) : null}
        {step === "store" && business ? (
          <>
            {now.length > 1 ? (
              <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
                {now.map((b, i) => (
                  <Pressable
                    key={b.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: i === active }}
                    className={`min-h-11 justify-center rounded-full border px-3.5 ${i === active ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                    onPress={() => setActive(i)}
                  >
                    <Text className="text-xs font-bold text-foreground">
                      {b.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <OwnerStoreStep
              key={business.id}
              business={business}
              plan={plan}
              onChangeGrouping={() =>
                setStep(types.length > 1 ? "group" : "type")
              }
              onChange={(patch) =>
                setBusinesses((current) =>
                  current.map((b, i) =>
                    i === active ? { ...b, ...patch } : b,
                  ),
                )
              }
            />
          </>
        ) : null}
        {step !== "type" ? (
          <View style={{ height: footerHeight + 24 }} />
        ) : null}
      </OwnerStepBody>
    </OwnerSignupFrame>
  )
}

function OwnerStepBody({
  children,
  direction,
  disabled,
}: { children: ReactNode; direction: number; disabled: boolean }) {
  const reducedMotion = useReducedMotion()
  const from = useRef(direction).current
  const progress = useSharedValue(reducedMotion ? 1 : 0)
  useEffect(() => {
    progress.value = withTiming(1, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    })
  }, [progress])
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: (1 - progress.value) * from * 24 }],
  }))
  return (
    <Animated.View
      style={[{ gap: 12 }, style]}
      pointerEvents={disabled ? "none" : "auto"}
    >
      {children}
    </Animated.View>
  )
}
