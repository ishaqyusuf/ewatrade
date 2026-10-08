import { getAppVariant } from "@/lib/app-variant"
import {
  classifyQaRevalidation,
  describeQaAuthorizationError,
} from "@/lib/qa-authorization-state"
import {
  type StoredQaAuthorization,
  clearStoredQaAuthorization,
  clearStoredQaClientId,
  clearStoredQaDomain,
  getStoredQaAuthorization,
  getStoredQaClientId,
  getStoredQaDomain,
  setStoredQaAuthorization,
  setStoredQaClientId,
  setStoredQaDomain,
} from "@/lib/qa-authorization-store"
import type { MobileSession } from "@/lib/session-store"
import { clearMobileDataCache, useTRPC } from "@/trpc/client"
import {
  QA_ACCELERATOR_CONTRACT_VERSION,
  isQaAcceleratorClientMode,
} from "@ewatrade/utils/qa-accelerator"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { AppState } from "react-native"
import { useAuthContext } from "./use-auth"
import { useAuthenticatedQaTools } from "./use-authenticated-qa-tools"

type QaProfile = {
  business: {
    currencyCode: string
    id: string
    name: string
    slug: string
    timezone: string
  }
  identity: { email: string; id: string; name: string }
  membership: { role: string }
  profileReference: string
  store: { currencyCode: string; id: string; name: string; slug: string }
}

export type QaAcceleratorContextValue = {
  authorization: StoredQaAuthorization | null
  authorizationError: string | null
  authorizationSheetRequest: number
  authorize(input: { qaDomain: string }): void
  capabilityAvailable: boolean
  capabilityCategory: string | null
  clientEnabled: boolean
  toolingAvailable: boolean
  clearQaData(): Promise<void>
  isAuthorizing: boolean
  isLoading: boolean
  isSelecting: boolean
  openAuthorizationSheet(): void
  profilesLoading: boolean
  selectingProfileReference: string | null
  fixtureContext: {
    currencyCode: string
    qaDomain: string
    seed: string
    storeId: string | null
    tenantId: string
    testerIdentity: string
    timezone: string
  } | null
  profileError: string | null
  profiles: QaProfile[]
  /** The last domain that authorized, used to prefill the domain field. */
  rememberedDomain: string | null
  retryCapability(): Promise<void>
  refreshProfiles(): Promise<void>
  refreshFixtureContext(): Promise<QaAcceleratorContextValue["fixtureContext"]>
  selectProfile(profileReference: string): void
}

const QaAcceleratorContext = createContext<QaAcceleratorContextValue | null>(
  null,
)

export function QaAcceleratorProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC()
  const auth = useAuthContext()
  const authenticatedTools = useAuthenticatedQaTools()
  const [authorization, setAuthorization] =
    useState<StoredQaAuthorization | null>(() => getStoredQaAuthorization())
  const [authorizationError, setAuthorizationError] = useState<string | null>(
    null,
  )
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const [authorizationSheetRequest, setAuthorizationSheetRequest] = useState(0)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [rememberedDomain, setRememberedDomain] = useState<string | null>(
    () => getStoredQaDomain() ?? getStoredQaAuthorization()?.qaDomain ?? null,
  )
  const renewedToken = useRef<string | null>(null)
  const clientEnabled = isQaAcceleratorClientMode(getAppVariant())

  const capability = useQuery(
    trpc.qaAccess.capability.queryOptions(
      { contractVersion: QA_ACCELERATOR_CONTRACT_VERSION },
      { enabled: clientEnabled, retry: false, staleTime: 5 * 60_000 },
    ),
  )
  const revalidation = useQuery(
    trpc.qaAccess.revalidate.queryOptions(
      {
        contractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
        token: authorization?.token ?? "",
      },
      {
        enabled: capability.data?.available === true && Boolean(authorization),
        refetchInterval: 60_000,
        retry: false,
      },
    ),
  )
  const profilesQuery = useQuery(
    trpc.qaAccess.profiles.queryOptions(
      {
        contractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
        token: authorization?.token ?? "",
      },
      {
        enabled: capability.data?.available === true && Boolean(authorization),
        retry: false,
      },
    ),
  )
  const fixtureContextQuery = useQuery(
    trpc.qaAccess.fixtureContext.queryOptions(undefined, {
      enabled:
        capability.data?.available === true &&
        Boolean(authorization) &&
        auth.isAuthenticated,
      retry: false,
    }),
  )

  const { mutateAsync: exchangeCredential } = useMutation(
    trpc.qaAccess.exchange.mutationOptions(),
  )
  const select = useMutation(
    trpc.qaAccess.selectProfile.mutationOptions({
      onError(error) {
        setProfileError(error.message || "This QA business is unavailable.")
        void profilesQuery.refetch()
      },
      onSuccess(result) {
        setProfileError(null)
        auth.applyAuthenticatedSession({
          expiresAt: result.expiresAt.toISOString(),
          profile: result.profile,
          token: result.token,
        } satisfies MobileSession)
      },
    }),
  )
  const revoke = useMutation(trpc.qaAccess.revoke.mutationOptions())
  const revalidationOutcome = classifyQaRevalidation({
    errorCode: revalidation.error?.data?.code,
    isError: revalidation.isError,
  })

  const exchangeDomain = useCallback(
    async (qaDomain: string) => {
      let clientId = getStoredQaClientId()
      if (!clientId) {
        clientId = `mobile_${Crypto.randomUUID()}`
        setStoredQaClientId(clientId)
      }
      const result = await exchangeCredential({
        clientId,
        contractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
        qaDomain,
      })
      const nextAuthorization = {
        expiresAt: result.authorization.expiresAt.toISOString(),
        qaDomain: result.authorization.qaDomain,
        testerIdentity: result.authorization.testerIdentity,
        token: result.token,
      }
      setStoredQaAuthorization(nextAuthorization)
      setStoredQaDomain(nextAuthorization.qaDomain)
      setAuthorization(nextAuthorization)
      setRememberedDomain(nextAuthorization.qaDomain)
      setAuthorizationError(null)
    },
    [exchangeCredential],
  )

  // QA tokens expire daily. Renew once, silently, with the saved domain
  // instead of asking the tester to set QA up again.
  useEffect(() => {
    if (revalidationOutcome !== "renew" || !authorization) return
    if (renewedToken.current === authorization.token) return
    renewedToken.current = authorization.token
    setIsAuthorizing(true)
    exchangeDomain(authorization.qaDomain)
      .catch(async () => {
        // The domain is no longer accepted: drop the token and keep the
        // domain so the field is prefilled.
        await clearStoredQaAuthorization()
        setAuthorization(null)
      })
      .finally(() => setIsAuthorizing(false))
  }, [authorization, exchangeDomain, revalidationOutcome])

  useEffect(() => {
    if (!clientEnabled || !authorization) return
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void revalidation.refetch()
    })
    return () => subscription.remove()
  }, [authorization, clientEnabled, revalidation.refetch])

  const clearQaData = useCallback(async () => {
    const token = authorization?.token
    if (token) {
      await revoke
        .mutateAsync({
          contractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
          token,
        })
        .catch(() => undefined)
    }
    await Promise.all([
      clearStoredQaAuthorization(),
      clearStoredQaClientId(),
      clearStoredQaDomain(),
    ])
    clearMobileDataCache()
    setAuthorization(null)
    setRememberedDomain(null)
    setAuthorizationError(null)
    setProfileError(null)
    if (auth.isAuthenticated) auth.onLogout()
  }, [auth, authorization?.token, revoke])

  const value = useMemo<QaAcceleratorContextValue>(
    () => ({
      authorization,
      authorizationError,
      authorizationSheetRequest,
      authorize(input) {
        setIsAuthorizing(true)
        setAuthorizationError(null)
        exchangeDomain(input.qaDomain)
          .catch((error: { data?: { code?: string }; message?: string }) => {
            setAuthorizationError(
              describeQaAuthorizationError({
                errorCode: error?.data?.code,
                message: error?.message,
              }),
            )
          })
          .finally(() => setIsAuthorizing(false))
      },
      capabilityAvailable: capability.data?.available === true,
      capabilityCategory: capability.isError
        ? "network_unavailable"
        : capability.data && !capability.data.available
          ? capability.data.category
          : null,
      clientEnabled,
      toolingAvailable: Boolean(
        authenticatedTools.fixtureContext ||
          (clientEnabled &&
            authorization &&
            revalidationOutcome === "valid" &&
            (!auth.isAuthenticated ||
              (!fixtureContextQuery.isError && fixtureContextQuery.data))),
      ),
      clearQaData,
      isAuthorizing,
      isLoading:
        capability.isLoading ||
        (Boolean(authorization) && revalidation.isLoading),
      isSelecting: select.isPending,
      openAuthorizationSheet() {
        setAuthorizationSheetRequest((request) => request + 1)
      },
      profilesLoading: profilesQuery.isLoading || profilesQuery.isFetching,
      selectingProfileReference: select.variables?.profileReference ?? null,
      fixtureContext:
        authenticatedTools.fixtureContext ??
        (fixtureContextQuery.isError || revalidationOutcome !== "valid"
          ? null
          : (fixtureContextQuery.data ?? null)),
      profileError:
        profilesQuery.isError && !profilesQuery.isFetching
          ? profilesQuery.error.message
          : profileError,
      profiles: profilesQuery.data ?? [],
      rememberedDomain,
      async retryCapability() {
        await capability.refetch()
      },
      async refreshProfiles() {
        await profilesQuery.refetch()
      },
      async refreshFixtureContext() {
        const ordinary = await authenticatedTools.refreshFixtureContext()
        if (ordinary) return ordinary
        if (
          !authorization ||
          !capability.data?.available ||
          revalidationOutcome !== "valid"
        )
          return null
        const result = await fixtureContextQuery.refetch()
        return result.isError ? null : (result.data ?? null)
      },
      selectProfile(profileReference) {
        select.mutate({
          contractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
          profileReference,
          token: authorization?.token ?? "",
        })
      },
    }),
    [
      authorization,
      authenticatedTools,
      authorizationError,
      authorizationSheetRequest,
      capability.data,
      capability.isError,
      clientEnabled,
      capability.isLoading,
      capability.refetch,
      clearQaData,
      exchangeDomain,
      fixtureContextQuery.data,
      fixtureContextQuery.isError,
      fixtureContextQuery.refetch,
      auth.isAuthenticated,
      isAuthorizing,
      profileError,
      profilesQuery,
      rememberedDomain,
      revalidation,
      revalidationOutcome,
      select,
    ],
  )

  return (
    <QaAcceleratorContext.Provider value={value}>
      {children}
    </QaAcceleratorContext.Provider>
  )
}

export function useQaAccelerator() {
  const context = useContext(QaAcceleratorContext)
  if (!context) {
    throw new Error(
      "useQaAccelerator must be used within QaAcceleratorProvider",
    )
  }
  return context
}
