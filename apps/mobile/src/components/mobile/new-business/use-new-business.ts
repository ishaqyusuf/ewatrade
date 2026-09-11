import { useAuthContext } from "@/hooks/use-auth"
import { createBusinessFixture } from "@/internal-tooling/fixture-recipes"
import { isLocalSessionToken } from "@/lib/session-store"
import { switchMobileBusinessSession } from "@/lib/workspace-feature-availability"
import { useBusinessStore, type RetailOpsBusiness } from "@/store/businessStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import {
  BUSINESS_OPERATING_MODELS,
  BUSINESS_ORDER_CHANNELS,
  BUSINESS_TEAM_SIZES,
  OPERATING_CURRENCIES,
  findBusinessProfile,
  listBusinessProfiles,
  type BusinessProfile,
  type BusinessOrderChannel,
} from "@ewatrade/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import { useRouter } from "expo-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { Keyboard } from "react-native"
import {
  businessCreateInput,
  businessDetailsIssue,
  businessProfileIssue,
  newBusinessDraft,
  type NewBusinessDraft,
} from "./new-business-model"

type SubmitState = "editing" | "saving" | "created" | "uncertain"
type CreatedBusiness = RetailOpsBusiness & {
  storeId?: string
  storeName?: string
}

export function useNewBusiness() {
  const auth = useAuthContext()
  const trpc = useTRPC()
  const cache = useQueryClient()
  const router = useRouter()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const local = isLocalSessionToken(auth.token)
  const origin = useRef({
    userId: auth.profile?.id,
    businessId: auth.profile?.businessId,
    local,
  })
  const latest = useRef({ auth, isOffline, local })
  latest.current = { auth, isOffline, local }
  const mounted = useRef(true)
  const [draft, setDraft] = useState(newBusinessDraft)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const [step, setStep] = useState(1)
  const stepRef = useRef(1)
  const changeStep = (value: number) => {
    stepRef.current = value
    setStep(value)
  }
  const [profileQuery, setProfileQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<SubmitState>("editing")
  const statusRef = useRef<SubmitState>("editing")
  const [savedBusiness, setSavedBusiness] = useState<CreatedBusiness | null>(
    null,
  )
  const savedRef = useRef<CreatedBusiness | null>(null)
  const snapshot = useRef<{ draft: NewBusinessDraft; step: number } | null>(
    null,
  )
  const [canUndoFill, setCanUndoFill] = useState(false)
  const mutation = useMutation(
    trpc.tenant.createBusiness.mutationOptions({ retry: false }),
  )
  const profiles = useMemo(
    () => listBusinessProfiles({ query: profileQuery }),
    [profileQuery],
  )
  const selectedProfile = findBusinessProfile(draft.businessProfileKey)
  const hasScope = () => {
    const current = latest.current
    return (
      Boolean(current.auth.session) &&
      current.auth.profile?.id === origin.current.userId &&
      current.local === origin.current.local &&
      (current.auth.profile?.businessId === origin.current.businessId ||
        (savedRef.current !== null &&
          current.auth.profile?.businessId === savedRef.current.id))
    )
  }
  const scopeChanged = !hasScope()
  const locked = scopeChanged || status !== "editing"
  const canEdit = () =>
    mounted.current && hasScope() && statusRef.current === "editing"
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const changeStatus = (value: SubmitState) => {
    statusRef.current = value
    if (mounted.current) setStatus(value)
  }
  const updateDraft = (update: Partial<NewBusinessDraft>) => {
    if (!canEdit()) return
    const next = { ...draftRef.current, ...update }
    draftRef.current = next
    setDraft(next)
    setError(null)
  }
  const selectProfile = (profile: BusinessProfile) => {
    if (!canEdit()) return
    updateDraft({
      businessProfileKey: profile.key,
      operatingModel:
        profile.recommendedItemKinds.length === 1
          ? profile.recommendedItemKinds[0] === "service"
            ? "services"
            : "products"
          : "products_and_services",
    })
    Keyboard.dismiss()
    setProfileQuery("")
    changeStep(2)
  }
  const toggleChannel = (channel: BusinessOrderChannel) => {
    const channels = draftRef.current.orderChannels
    updateDraft({
      orderChannels: channels.includes(channel)
        ? channels.filter((value) => value !== channel)
        : [...channels, channel],
    })
  }
  const continueFlow = () => {
    if (!canEdit()) return
    const issue =
      businessProfileIssue(draftRef.current) ||
      (stepRef.current >= 3 ? businessDetailsIssue(draftRef.current) : null)
    if (issue) {
      setError(issue)
      return
    }
    Keyboard.dismiss()
    setError(null)
    changeStep(Math.min(4, stepRef.current + 1))
  }
  const goBack = () => {
    if (!canEdit()) return
    Keyboard.dismiss()
    setError(null)
    changeStep(Math.max(1, stepRef.current - 1))
  }
  const openCreatedBusiness = () => {
    const current = latest.current
    if (
      !mounted.current ||
      !hasScope() ||
      !savedRef.current ||
      !current.auth.session
    )
      return
    try {
      const next = switchMobileBusinessSession(
        current.auth.session,
        savedRef.current,
      )
      current.auth.applyAuthenticatedSession(
        {
          ...next,
          profile: {
            ...next.profile,
            storeId: savedRef.current.storeId,
            storeName: savedRef.current.storeName,
          },
          accessProfile: {
            hasBusinessAccess: true,
            hasCustomerHistory: next.accessProfile?.hasCustomerHistory ?? false,
          },
        },
        "/dashboard",
      )
    } catch {
      setError(
        "The business was created, but could not be opened. Try opening it again or review your businesses.",
      )
    }
  }
  const submit = async () => {
    if (!canEdit()) return
    if (latest.current.isOffline && !latest.current.local) {
      setError(
        "Reconnect before creating a business. Your draft has not been sent.",
      )
      return
    }
    const inputDraft = {
      ...draftRef.current,
      orderChannels: [...draftRef.current.orderChannels],
    }
    const issue =
      businessProfileIssue(inputDraft) || businessDetailsIssue(inputDraft)
    if (issue) {
      setError(issue)
      return
    }
    Keyboard.dismiss()
    setError(null)
    changeStatus("saving")
    let business: CreatedBusiness
    try {
      if (latest.current.local) {
        const localBusiness = useBusinessStore.getState().createBusiness({
          name: inputDraft.businessName.trim(),
          currency: inputDraft.currencyCode,
          category: findBusinessProfile(inputDraft.businessProfileKey)?.title,
          salesMethod: inputDraft.orderChannels
            .map(
              (channel) =>
                BUSINESS_ORDER_CHANNELS.find((value) => value.key === channel)
                  ?.label,
            )
            .filter(Boolean)
            .join(", "),
          teamSize: BUSINESS_TEAM_SIZES.find(
            (value) => value.key === inputDraft.teamSize,
          )?.label,
          type: BUSINESS_OPERATING_MODELS.find(
            (value) => value.key === inputDraft.operatingModel,
          )?.label,
        })
        business = { ...localBusiness, role: "OWNER" }
      } else {
        const result = await mutation.mutateAsync(
          businessCreateInput(inputDraft),
        )
        business = {
          createdAt: "",
          currency: result.currencyCode,
          id: result.id,
          name: result.name,
          role: result.role,
          slug: result.slug,
          storeId: result.storeId ?? undefined,
          storeName: result.storeName ?? undefined,
        }
      }
    } catch (cause) {
      const rejected =
        cause instanceof TRPCClientError &&
        ["BAD_REQUEST", "FORBIDDEN", "UNAUTHORIZED"].includes(
          cause.data?.code ?? "",
        )
      changeStatus(rejected ? "editing" : "uncertain")
      if (mounted.current && hasScope())
        setError(
          rejected && cause instanceof Error
            ? cause.message
            : "The creation result could not be confirmed. Review your businesses before starting another setup; submitting again could create a duplicate.",
        )
      return
    }
    // A cache or session-switch failure must never turn accepted creation into a retry.
    savedRef.current = business
    changeStatus("created")
    if (!mounted.current || !hasScope()) return
    setSavedBusiness(business)
    if (!latest.current.local)
      void cache
        .invalidateQueries({ queryKey: trpc.tenant.businesses.queryKey() })
        .catch(() => undefined)
    openCreatedBusiness()
  }
  const fill = (...args: Parameters<typeof createBusinessFixture>) => {
    if (!canEdit()) return
    snapshot.current = {
      draft: {
        ...draftRef.current,
        orderChannels: [...draftRef.current.orderChannels],
      },
      step,
    }
    const fixture = createBusinessFixture(...args)
    const currency =
      OPERATING_CURRENCIES.find((value) => value.code === fixture.currencyCode)
        ?.code ?? "NGN"
    updateDraft({
      businessName: fixture.businessName,
      addressLine1: fixture.addressLine1,
      city: fixture.city,
      phone: fixture.phone,
      currencyCode: currency,
      businessProfileKey: "general-retail-groceries",
      operatingModel: "products",
      orderChannels: ["walk_in"],
      otherBusinessDescription: "",
      teamSize: "2_5",
    })
    Keyboard.dismiss()
    changeStep(3)
    setCanUndoFill(true)
  }
  const undoFill = () => {
    if (!canEdit() || !snapshot.current) return
    updateDraft({
      ...snapshot.current.draft,
      orderChannels: [...snapshot.current.draft.orderChannels],
    })
    Keyboard.dismiss()
    changeStep(snapshot.current.step)
    snapshot.current = null
    setCanUndoFill(false)
  }
  return {
    draft,
    step,
    profileQuery,
    setProfileQuery,
    profiles,
    selectedProfile,
    updateDraft,
    selectProfile,
    toggleChannel,
    continueFlow,
    goBack,
    submit,
    status,
    locked,
    scopeChanged,
    isOffline,
    local,
    error,
    savedBusiness,
    openCreatedBusiness,
    fill,
    undoFill,
    canUndoFill,
    reviewBusinesses: () => {
      if (hasScope()) router.replace("/business-switch-modal")
    },
    dirty: JSON.stringify(draft) !== JSON.stringify(newBusinessDraft()),
  }
}
export type NewBusinessModel = ReturnType<typeof useNewBusiness>
