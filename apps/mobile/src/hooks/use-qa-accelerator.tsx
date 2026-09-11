import { getAppVariant } from "@/lib/app-variant"
import {
  type StoredQaAuthorization,
  clearStoredQaAuthorization,
  clearStoredQaClientId,
  getStoredQaAuthorization,
  getStoredQaClientId,
  setStoredQaAuthorization,
  setStoredQaClientId,
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
  useState,
} from "react"
import { AppState } from "react-native"
import { useAuthContext } from "./use-auth"

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

type QaAcceleratorContextValue = {
  authorization: StoredQaAuthorization | null
  authorizationError: string | null
  authorizationSheetRequest: number
  authorize(input: { credential: string; qaDomain: string }): void
  capabilityAvailable: boolean
  capabilityCategory: string | null
  clientEnabled: boolean
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
  retryCapability(): Promise<void>
  refreshProfiles(): Promise<void>
  selectProfile(profileReference: string): void
}

const QaAcceleratorContext = createContext<QaAcceleratorContextValue | null>(
  null,
)

export function QaAcceleratorProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC()
  const auth = useAuthContext()
  const [authorization, setAuthorization] =
    useState<StoredQaAuthorization | null>(() => getStoredQaAuthorization())
  const [authorizationError, setAuthorizationError] = useState<string | null>(
    null,
  )
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const [authorizationSheetRequest, setAuthorizationSheetRequest] = useState(0)
  const [profileError, setProfileError] = useState<string | null>(null)
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

  const exchangeCredential = trpc.qaAccess.exchange.mutationOptions().mutationFn
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
    await Promise.all([clearStoredQaAuthorization(), clearStoredQaClientId()])
    clearMobileDataCache()
    setAuthorization(null)
    setAuthorizationError(null)
    setProfileError(null)
    if (auth.isAuthenticated) auth.onLogout()
  }, [auth, authorization?.token, revoke])

  const value = useMemo<QaAcceleratorContextValue>(
    () => ({
      authorization:
        revalidation.isError && !revalidation.isFetching ? null : authorization,
      authorizationError:
        revalidation.isError && authorization
          ? revalidation.error.message
          : authorizationError,
      authorizationSheetRequest,
      authorize(input) {
        let clientId = getStoredQaClientId()
        if (!clientId) {
          clientId = `mobile_${Crypto.randomUUID()}`
          setStoredQaClientId(clientId)
        }
        setIsAuthorizing(true)
        setAuthorizationError(null)
        if (!exchangeCredential) {
          setAuthorizationError("QA access could not be authorized.")
          setIsAuthorizing(false)
          return
        }
        void exchangeCredential({
          clientId,
          contractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
          credential: input.credential,
          qaDomain: input.qaDomain,
        })
          .then((result) => {
            const nextAuthorization = {
              expiresAt: result.authorization.expiresAt.toISOString(),
              qaDomain: result.authorization.qaDomain,
              testerIdentity: result.authorization.testerIdentity,
              token: result.token,
            }
            setStoredQaAuthorization(nextAuthorization)
            setAuthorization(nextAuthorization)
            setAuthorizationError(null)
          })
          .catch((error: unknown) => {
            setAuthorizationError(
              error instanceof Error && error.message
                ? error.message
                : "QA access could not be authorized.",
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
      fixtureContext: fixtureContextQuery.data ?? null,
      profileError:
        profilesQuery.isError && !profilesQuery.isFetching
          ? profilesQuery.error.message
          : profileError,
      profiles: profilesQuery.data ?? [],
      async retryCapability() {
        await capability.refetch()
      },
      async refreshProfiles() {
        await profilesQuery.refetch()
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
      authorizationError,
      authorizationSheetRequest,
      capability.data,
      capability.isError,
      clientEnabled,
      capability.isLoading,
      capability.refetch,
      clearQaData,
      exchangeCredential,
      fixtureContextQuery.data,
      isAuthorizing,
      profileError,
      profilesQuery,
      revalidation,
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
