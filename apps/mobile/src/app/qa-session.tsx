import {
  ActionButton,
  MobileScreen,
  SecondarySheetHeader,
  StatusBanner,
} from "@/components/mobile"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { shouldShowInternalDesignSystemEntry } from "@/lib/app-variant"
import { useBusinessStore } from "@/store/businessStore"
import { useOnboardingStore } from "@/store/onboardingStore"
import { useRetailOpsStore } from "@/store/retailOpsStore"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { View } from "react-native"

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function cleanPath(value: string | undefined) {
  const path = value?.trim()

  if (!path?.startsWith("/")) return "/dashboard"

  return path
}

type QaLocalProduct = {
  currentStock: number
  name: string
  price: number
  remoteId?: string
  remoteVariantId?: string
  startingStock: number
  unitName: string
  variants: Array<{
    currentStock: number
    name: string
    price: number
    remoteId?: string
    startingStock: number
  }>
}

type QaPayloadParams = {
  businessId?: string
  businessName?: string
  email?: string
  expiresAt?: string
  localOpenSession?: {
    remoteId?: string
  }
  localProducts?: QaLocalProduct[]
  name?: string
  next?: string
  role?: string
  status?: string
  token?: string
  userId?: string
}

function isQaLocalProduct(value: unknown): value is QaLocalProduct {
  if (!value || typeof value !== "object") return false

  const product = value as Partial<QaLocalProduct>

  return (
    typeof product.name === "string" &&
    typeof product.unitName === "string" &&
    typeof product.price === "number" &&
    Array.isArray(product.variants)
  )
}

function seedLocalQaRetailOps(input: {
  businessId?: string
  businessName?: string
  localOpenSession?: { remoteId?: string }
  localProducts?: QaLocalProduct[]
  ownerName: string
}) {
  const businessId = input.businessId?.trim()
  const businessName = input.businessName?.trim() || "QA Business"

  if (!businessId || !input.localProducts?.length) return

  const businessStore = useBusinessStore.getState()
  const existingBusiness = businessStore.businesses.find(
    (business) => business.id === businessId,
  )

  if (existingBusiness) {
    businessStore.setActiveBusiness(businessId)
  } else {
    businessStore.createBusiness({
      category: "Feed",
      country: "Nigeria",
      currency: "NGN",
      id: businessId,
      name: businessName,
      salesMethod: "In-store sales",
      teamSize: "2-5 people",
      type: "Product Sales",
    })
  }

  const retailOpsStore = useRetailOpsStore.getState()

  for (const product of input.localProducts.filter(isQaLocalProduct)) {
    const alreadySeeded = retailOpsStore.products.some(
      (currentProduct) =>
        currentProduct.businessId === businessId &&
        currentProduct.remoteId === product.remoteId,
    )

    if (alreadySeeded) continue

    retailOpsStore.addFirstProduct({
      businessId,
      name: product.name,
      priceMinor: product.price,
      remoteId: product.remoteId,
      remoteVariantId: product.remoteVariantId,
      startingStock: product.startingStock,
      syncStatus: "synced",
      unitName: product.unitName,
      variants: product.variants.map((variant) => ({
        currentStock: variant.currentStock,
        name: variant.name,
        priceMinor: variant.price,
        remoteId: variant.remoteId,
        startingStock: variant.startingStock,
      })),
    })
  }

  const currentProducts = useRetailOpsStore
    .getState()
    .products.filter((product) => product.businessId === businessId)
  const hasOpenSession = useRetailOpsStore
    .getState()
    .repSessions.some(
      (session) =>
        session.businessId === businessId &&
        session.status === "open" &&
        session.attendantName === input.ownerName,
    )

  if (hasOpenSession || currentProducts.length === 0) return

  retailOpsStore.clockInRepSession({
    attendantName: input.ownerName,
    businessId,
    openingInventoryLines: currentProducts.flatMap((product) =>
      product.variants.length > 0
        ? product.variants.map((variant) => ({
            confirmedQuantity:
              variant.currentStock ?? variant.startingStock ?? 0,
            expectedQuantity:
              variant.currentStock ?? variant.startingStock ?? 0,
            productId: product.id,
            productName: product.name,
            unitName: variant.name,
            variantId: variant.id,
          }))
        : [
            {
              confirmedQuantity: product.currentStock,
              expectedQuantity: product.currentStock,
              productId: product.id,
              productName: product.name,
              unitName: product.unitName,
            },
          ],
    ),
    remoteId: input.localOpenSession?.remoteId,
    syncStatus: "synced",
  })
}

export default function QaSessionRoute() {
  const auth = useAuthContext()
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  )
  const router = useRouter()
  const importedSessionKeyRef = useRef<string | null>(null)
  const params = useLocalSearchParams<{
    payload?: string
    businessId?: string
    businessName?: string
    email?: string
    expiresAt?: string
    name?: string
    next?: string
    role?: string
    status?: string
    token?: string
    userId?: string
  }>()
  const [error, setError] = useState<string | null>(null)
  const isAllowed = shouldShowInternalDesignSystemEntry()
  const sessionInput = useMemo(() => {
    const payload = getParam(params.payload)
    const payloadParams = (() => {
      if (!payload) return null

      try {
        return JSON.parse(decodeURIComponent(payload)) as QaPayloadParams
      } catch {
        return null
      }
    })()
    const source = payloadParams ?? params

    return {
      businessId: getParam(source.businessId)?.trim(),
      businessName: getParam(source.businessName)?.trim(),
      email: getParam(source.email)?.trim(),
      expiresAt: getParam(source.expiresAt)?.trim(),
      name: getParam(source.name)?.trim(),
      next: cleanPath(getParam(source.next)),
      localOpenSession:
        payloadParams?.localOpenSession &&
        typeof payloadParams.localOpenSession === "object"
          ? payloadParams.localOpenSession
          : undefined,
      localProducts: Array.isArray(payloadParams?.localProducts)
        ? payloadParams.localProducts.filter(isQaLocalProduct)
        : undefined,
      role: getParam(source.role)?.trim(),
      status: getParam(source.status)?.trim(),
      token: getParam(source.token)?.trim(),
      userId: getParam(source.userId)?.trim(),
    }
  }, [params])
  const sessionImportKey = useMemo(
    () =>
      [
        sessionInput.token,
        sessionInput.userId,
        sessionInput.email,
        sessionInput.name,
        sessionInput.role,
        sessionInput.businessId,
        sessionInput.next,
      ].join("|"),
    [sessionInput],
  )

  useEffect(() => {
    if (!isAllowed) {
      setError("QA session import is only available in dev or preview builds.")
      return
    }

    if (
      !sessionInput.token ||
      !sessionInput.userId ||
      !sessionInput.email ||
      !sessionInput.name
    ) {
      setError("Missing token, user id, email, or name for QA session import.")
      return
    }

    if (importedSessionKeyRef.current === sessionImportKey) {
      return
    }
    importedSessionKeyRef.current = sessionImportKey

    completeOnboarding(true)
    seedLocalQaRetailOps({
      businessId: sessionInput.businessId,
      businessName: sessionInput.businessName,
      localOpenSession: sessionInput.localOpenSession,
      localProducts: sessionInput.localProducts,
      ownerName: sessionInput.name,
    })
    auth.applyAuthenticatedSession(
      {
        expiresAt: sessionInput.expiresAt,
        profile: {
          businessId: sessionInput.businessId,
          businessName: sessionInput.businessName,
          email: sessionInput.email,
          id: sessionInput.userId,
          name: sessionInput.name,
          role: sessionInput.role,
          status: sessionInput.status,
        },
        token: sessionInput.token,
      },
      sessionInput.next,
    )
  }, [auth, completeOnboarding, isAllowed, sessionImportKey, sessionInput])

  return (
    <MobileScreen contentClassName="justify-center gap-6">
      <SecondarySheetHeader
        description="Imports an API-issued mobile session for guarded emulator QA."
        icon="ShieldCheck"
        title="QA session"
      />

      {error ? (
        <StatusBanner
          icon="TriangleAlert"
          message={error}
          title="Session import unavailable"
          tone="destructive"
        />
      ) : (
        <View className="gap-2 border-y border-border py-5">
          <Text className="font-extrabold text-foreground">
            Importing real session
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            The app will continue to the requested QA screen after the session
            is saved.
          </Text>
        </View>
      )}

      <ActionButton onPress={() => router.replace("/login")} variant="outline">
        Return to login
      </ActionButton>
    </MobileScreen>
  )
}
