import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { financeUtcDate } from "@/lib/finance-expense-input"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { StockCategoryDraft } from "@ewatrade/utils/inventory-categories"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { StockCategoriesInput } from "../stock-intake/stock-categories-input"
import type { FinanceWorkspace } from "./finance-workspace-gate"
import {
  beginSupplierCommandPreparation,
  createSupplierCommandAuthority,
  invalidateSupplierCommandAuthority,
  isSupplierCommandPreparationCurrent,
  reconcileSupplierCommandScope,
} from "./supplier-command-authority"
import { useSupplierReadAuthority } from "./supplier-finance-screen"
import {
  type PurchaseRestartRetryAuthorization,
  authorizePurchaseRestartRetry,
  availablePurchaseRecognitionStages,
  beginPurchasePreparation,
  buildPurchaseRegistrationLine,
  canConfirmRetainedPurchaseCommand,
  canReversePurchaseRecognitionEvent,
  matchPurchaseBalance,
  matchesPurchaseRestartRetryAuthorization,
  purchaseReceiptRecoveryMetadata,
  retainedPurchaseReceiptConfirmations,
  snapshotPurchaseRestartRetryIdentity,
} from "./supplier-purchase-recognition-state"
import { runSupplierFreshRead } from "./supplier-purchase-settlement-state"
import { useMobileFinanceCommand } from "./use-mobile-finance-command"

type Supplier = { id: string; code: string; name: string }
type Balance = RouterOutputs["inventory"]["balanceReport"]["rows"][number]
type Recognition = RouterOutputs["finance"]["purchaseRecognition"]
type DraftLine = {
  balanceSourceId: string
  description: string
  enteredQuantity: string
  amount: string
  categories: StockCategoryDraft[]
  categoryInput: string
}
type RegistrationPayload = Omit<
  RouterInputs["finance"]["registerPurchase"],
  "clientCommandId"
>
type StagePayload = Omit<
  RouterInputs["finance"]["recognizePurchase"],
  "clientCommandId"
>
type ReversalPayload = Omit<
  RouterInputs["finance"]["reversePurchaseRecognition"],
  "clientCommandId"
>

class PurchaseSourceScopeMismatch extends Error {}

function isCurrentActor(actorUserId: string, tenantId: string) {
  const profile = getSession()?.profile
  return (
    profile?.id === actorUserId &&
    profile.businessId === tenantId &&
    ["OWNER", "ADMIN"].includes(profile.role?.trim().toUpperCase() ?? "") &&
    !useOperationalModeStore.getState().isOfflineMode
  )
}

function useCommandAuthority(scope: string, canContinue: () => boolean) {
  const authority = useRef(createSupplierCommandAuthority(scope))
  authority.current = reconcileSupplierCommandScope(authority.current, scope)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    const unsubscribe = useOperationalModeStore.subscribe((next, previous) => {
      if (!previous.isOfflineMode && next.isOfflineMode)
        authority.current = invalidateSupplierCommandAuthority(
          authority.current,
        )
    })
    return () => {
      mounted.current = false
      authority.current = invalidateSupplierCommandAuthority(authority.current)
      unsubscribe()
    }
  }, [])
  return {
    current: canContinue,
    begin() {
      return beginSupplierCommandPreparation(
        authority.current,
        mounted.current && canContinue(),
      )
    },
    valid(token: { generation: number; scope: string }) {
      return (
        mounted.current &&
        canContinue() &&
        isSupplierCommandPreparationCurrent(
          authority.current,
          token,
          scope,
          true,
        )
      )
    },
  }
}

export function SupplierPurchaseRegistrationForm({
  book,
  actorUserId,
  tenantId,
  supplier,
  onBack,
  onRegistered,
}: FinanceWorkspace & {
  supplier: Supplier
  onBack: () => void
  onRegistered: (recognitionId: string) => void
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const command = useMobileFinanceCommand({
    actorUserId,
    tenantId,
    bookId: book.id,
  })
  const [retryAuthorization, setRetryAuthorization] =
    useState<PurchaseRestartRetryAuthorization | null>(null)
  const [liveRetryIdentity, setLiveRetryIdentity] =
    useState<PurchaseRestartRetryAuthorization | null>(null)
  const retryAuthorizationRef =
    useRef<PurchaseRestartRetryAuthorization | null>(null)
  const retainedCommandRef = useRef(command.retained)
  retainedCommandRef.current = command.retained
  const [recovering, setRecovering] = useState(false)
  const availability = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, {
      enabled: !offline,
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnMount: "always",
      refetchOnReconnect: "always",
      refetchOnWindowFocus: false,
    }),
  )
  const storeId = availability.data?.storeId
  const availabilityReadAuthority = useSupplierReadAuthority({
    scope: `purchase-registration-store:${actorUserId}:${tenantId}:${book.id}`,
    enabled: true,
    offline,
    paused: availability.fetchStatus === "paused",
    error: availability.isError,
    fetching: availability.isFetching,
    refetch: availability.refetch,
  })
  const input = { includeCompatibleTotals: false, storeId: storeId ?? "" }
  const balanceQuery = useQuery(
    trpc.inventory.balanceReport.queryOptions(input, {
      enabled: Boolean(storeId) && !offline,
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnMount: "always",
      refetchOnReconnect: "always",
      refetchOnWindowFocus: false,
    }),
  )
  const [description, setDescription] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<DraftLine[]>([])
  const [review, setReview] = useState<RegistrationPayload | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [confirmedSourceUnverified, publishConfirmedSourceUnverified] =
    useState<string | null>(null)
  const confirmedSourceRef = useRef<string | null>(null)
  function setConfirmedSourceUnverified(sourceId: string | null) {
    confirmedSourceRef.current = sourceId
    publishConfirmedSourceUnverified(sourceId)
  }
  const [error, setError] = useState<string | null>(null)
  const submittedPayload = useRef<RegistrationPayload | null>(null)
  const attemptSent = useRef(false)
  const preparingRef = useRef(false)
  const [submissionAttempted, setSubmissionAttempted] = useState(false)
  const scope = `${actorUserId}:${tenantId}:${book.id}:${supplier.id}:${storeId ?? "no-store"}`
  function restartRetryIsCurrent() {
    return matchesPurchaseRestartRetryAuthorization({
      authorization: retryAuthorizationRef.current,
      retained: retainedCommandRef.current,
      scope: { actorUserId, tenantId, bookId: book.id },
      contextKey: scope,
      operation: "registerPurchase",
    })
  }
  function setRestartRetryAuthorization(
    authorization: PurchaseRestartRetryAuthorization | null,
  ) {
    retryAuthorizationRef.current = authorization
    setRetryAuthorization(authorization)
  }
  useEffect(() => {
    if (
      retryAuthorization &&
      !matchesPurchaseRestartRetryAuthorization({
        authorization: retryAuthorization,
        retained: command.retained,
        scope: { actorUserId, tenantId, bookId: book.id },
        contextKey: scope,
        operation: "registerPurchase",
      })
    ) {
      retryAuthorizationRef.current = null
      setRetryAuthorization(null)
    }
  }, [
    retryAuthorization,
    command.retained,
    actorUserId,
    tenantId,
    book.id,
    scope,
  ])
  useEffect(() => {
    if (
      !(attemptSent.current || submissionAttempted) ||
      !submittedPayload.current ||
      liveRetryIdentity
    )
      return
    if (command.retained)
      setLiveRetryIdentity(
        snapshotPurchaseRestartRetryIdentity(command.retained, scope),
      )
  }, [command.retained, liveRetryIdentity, scope, submissionAttempted])
  const restartRetryAuthorized = restartRetryIsCurrent()
  const canReenterRetainedCommand =
    restartRetryAuthorized &&
    !submittedPayload.current &&
    !attemptSent.current &&
    !submissionAttempted &&
    !command.pending
  const canContinue = () =>
    isCurrentActor(actorUserId, tenantId) &&
    Boolean(storeId) &&
    availabilityReadAuthority.verified &&
    !availability.isFetching &&
    availability.fetchStatus !== "paused" &&
    !availability.isError &&
    availability.data?.storeId === storeId
  const authority = useCommandAuthority(scope, canContinue)
  const balanceReadAuthority = useSupplierReadAuthority({
    scope: `purchase-registration-balances:${scope}`,
    enabled: Boolean(storeId),
    offline,
    paused: balanceQuery.fetchStatus === "paused",
    error: balanceQuery.isError,
    fetching: balanceQuery.isFetching,
    refetch: balanceQuery.refetch,
  })
  const balances =
    availabilityReadAuthority.verified &&
    !availability.isFetching &&
    !availability.isError &&
    availability.fetchStatus !== "paused" &&
    balanceReadAuthority.verified &&
    balanceQuery.isSuccess &&
    !balanceQuery.isFetching
      ? (balanceQuery.data?.rows ?? []).filter((row) => row.storeId === storeId)
      : []
  const register = useMutation(
    trpc.finance.registerPurchase.mutationOptions({ retry: false }),
  )
  const lineFor = (balance: Balance) =>
    lines.find((line) => line.balanceSourceId === balance.balanceSourceId)
  const money = (minor: string) => formatFinanceMoney(minor, book.currencyCode)
  const locked =
    offline ||
    !command.ready ||
    command.pending ||
    Boolean(review) ||
    (Boolean(command.retained) && !canReenterRetainedCommand) ||
    submissionAttempted ||
    attemptSent.current ||
    preparing ||
    recovering ||
    Boolean(confirmedSourceUnverified)

  function toggleBalance(balance: Balance) {
    if (locked) return
    setError(null)
    setLines((existing) => {
      if (
        existing.some(
          (line) => line.balanceSourceId === balance.balanceSourceId,
        )
      )
        return existing.filter(
          (line) => line.balanceSourceId !== balance.balanceSourceId,
        )
      if (existing.length >= 10) {
        setError("A purchase can contain up to 10 distinct goods balances.")
        return existing
      }
      return [
        ...existing,
        {
          balanceSourceId: balance.balanceSourceId,
          description: `${balance.productName} · ${balance.variantName}`,
          enteredQuantity: "",
          amount: "",
          categories: [],
          categoryInput: "",
        },
      ]
    })
  }

  function patchLine(balanceSourceId: string, patch: Partial<DraftLine>) {
    if (locked) return
    setLines((current) =>
      current.map((line) =>
        line.balanceSourceId === balanceSourceId ? { ...line, ...patch } : line,
      ),
    )
  }

  function prepare() {
    if (locked || preparingRef.current) return
    try {
      if (!canContinue())
        throw new Error(
          "Return online to the original account and select a current Store before registering this purchase.",
        )
      if (
        !supplier.id ||
        !description.trim() ||
        description.trim().length > 400
      )
        throw new Error("Enter a purchase description.")
      if (!lines.length || lines.length > 10)
        throw new Error("Select 1–10 actual stock balances from this Store.")
      const registrationStoreId = storeId
      if (!registrationStoreId)
        throw new Error("Select the current business Store.")
      const agreedAt = financeUtcDate(date, book.startsAt)
      const payload: RegistrationPayload = {
        bookId: book.id,
        supplierId: supplier.id,
        storeId: registrationStoreId,
        description: description.trim(),
        agreedAt,
        lines: lines.map((line) => {
          const balance = balances.find(
            (row) => row.balanceSourceId === line.balanceSourceId,
          )
          if (!balance)
            throw new Error(
              "Refresh and select an actual balance from the current Store.",
            )
          if (!line.description.trim() || line.description.trim().length > 200)
            throw new Error("Check each goods description.")
          const built = buildPurchaseRegistrationLine({
            balance,
            description: line.description,
            enteredQuantity: line.enteredQuantity,
            amount: line.amount,
            categories: line.categories,
            categoryInput: line.categoryInput,
          })
          const categories = built.categories
          if (!categories.length)
            throw new Error(
              "Choose at least one real goods category for each line.",
            )
          if (BigInt(built.amountMinor) <= 0n)
            throw new Error("Enter a positive agreed cost for each goods line.")
          return {
            ...built,
          }
        }),
      }
      setReview(payload)
      setError(null)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check the purchase goods and agreed amounts.",
      )
    }
  }

  async function confirm() {
    if (!review || confirmedSourceRef.current) return
    const releasePreparation = beginPurchasePreparation(preparingRef)
    if (!releasePreparation) return
    setPreparing(true)
    setError(null)
    try {
      const token = authority.begin()
      if (!token) return
      const restartRetry =
        restartRetryIsCurrent() &&
        !submittedPayload.current &&
        !attemptSent.current
      if (command.retained && !restartRetry && !submittedPayload.current)
        throw new Error(
          "Check the exact saved command status before entering or confirming purchase details.",
        )
      if (restartRetry) {
        const pending = retainedCommandRef.current
        if (
          !pending ||
          !matchesPurchaseRestartRetryAuthorization({
            authorization: retryAuthorizationRef.current,
            retained: pending,
            scope: { actorUserId, tenantId, bookId: book.id },
            contextKey: scope,
            operation: "registerPurchase",
          })
        )
          throw new Error(
            "The retained purchase identity changed. Check its exact status before retrying.",
          )
        const latestStatus = await readRetainedCommandStatus(
          pending.command.clientCommandId,
          token,
        )
        if (
          !authority.valid(token) ||
          latestStatus.status !== "NOT_FOUND" ||
          pending.rejectedCode !== undefined ||
          !restartRetryIsCurrent()
        ) {
          setRestartRetryAuthorization(null)
          throw new Error(
            "The saved purchase status or identity changed. Nothing was sent; check the saved result again.",
          )
        }
      }
      let payload = submittedPayload.current
      if (!payload) {
        const availabilityKey = trpc.tenant.featureAvailability.queryKey()
        const latestAvailability = await runSupplierFreshRead({
          isCurrent: () => authority.valid(token),
          cancelPrior: () =>
            client.cancelQueries(
              { queryKey: availabilityKey, exact: true },
              { silent: true },
            ),
          getState: () => client.getQueryState(availabilityKey),
          fetch: () =>
            client.fetchQuery(
              trpc.tenant.featureAvailability.queryOptions(undefined, {
                staleTime: 0,
                retry: false,
              }),
            ),
        })
        if (latestAvailability.storeId !== review.storeId)
          throw new Error(
            "The active Store changed. Return to the current Store and review the goods again.",
          )
        const queryKey = trpc.inventory.balanceReport.queryKey(input)
        const fresh = await runSupplierFreshRead({
          isCurrent: () => authority.valid(token),
          cancelPrior: () =>
            client.cancelQueries({ queryKey, exact: true }, { silent: true }),
          getState: () => client.getQueryState(queryKey),
          fetch: () =>
            client.fetchQuery(
              trpc.inventory.balanceReport.queryOptions(input, {
                staleTime: 0,
                retry: false,
              }),
            ),
        })
        if (!authority.valid(token))
          throw new Error(
            "Account, Store, or network changed. Review this purchase again.",
          )
        const latest = review.lines.map((line) => {
          const balance = matchPurchaseBalance({
            rows: fresh.rows,
            balanceSourceId: line.balanceSourceId,
            storeId: review.storeId,
            inventoryUnitId: line.enteredInventoryUnitId,
            configurationVersionId: line.expectedConfigurationVersionId,
          })
          if (!balance)
            throw new Error(
              "A stock balance, inventory unit, configuration version, or Store changed. Refresh and review the purchase again.",
            )
          return line
        })
        payload = { ...review, lines: latest }
        submittedPayload.current = payload
      }
      if (restartRetry && !restartRetryIsCurrent())
        throw new Error(
          "The saved purchase identity changed during preparation. Nothing was sent.",
        )
      let resultId: string | undefined
      const accepted = await command.run(
        "registerPurchase",
        payload,
        async (clientCommandId) => {
          if (!authority.valid(token))
            throw new Error(
              "Account, Store, or network changed before registration.",
            )
          attemptSent.current = true
          setSubmissionAttempted(true)
          const result = await register.mutateAsync({
            ...payload,
            clientCommandId,
          })
          if (typeof result.id !== "string" || !result.id)
            throw new Error(
              "The saved registration result identity is unavailable. Check the original command result before continuing.",
            )
          resultId = result.id
          return result
        },
        "Purchase agreement registered.",
      )
      if (!accepted) {
        if (restartRetry && !attemptSent.current) {
          submittedPayload.current = null
          setReview(null)
          setRestartRetryAuthorization(null)
        }
        return
      }
      // The successful runner has cleared its durable identity. Fence the old
      // review before any fallible source or authority verification can settle.
      if (resultId) setConfirmedSourceUnverified(resultId)
      attemptSent.current = false
      setSubmissionAttempted(false)
      setLiveRetryIdentity(null)
      if (!authority.valid(token))
        throw new Error(
          "Account or network changed after registration. Check the saved result before continuing.",
        )
      if (resultId) {
        if (!authority.valid(token))
          throw new Error(
            "Account or network changed before source verification.",
          )
        try {
          await readSource(resultId, token)
        } catch (failure) {
          if (
            !authority.valid(token) ||
            failure instanceof PurchaseSourceScopeMismatch
          )
            throw failure
          setConfirmedSourceUnverified(resultId)
          setReview(null)
          setError(
            "Registration is confirmed, but the source could not be verified. Do not submit again. Retry source verification before continuing.",
          )
          return
        }
        if (!authority.valid(token))
          throw new Error(
            "Account or network changed. Purchase source navigation was stopped.",
          )
        setRestartRetryAuthorization(null)
        setConfirmedSourceUnverified(null)
        onRegistered(resultId)
      } else {
        setReview(null)
        setError(
          "Purchase registered. Reopen the purchase source history to continue recognition.",
        )
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Purchase registration could not be confirmed.",
      )
      if (!attemptSent.current) {
        submittedPayload.current = null
      }
    } finally {
      releasePreparation()
      setPreparing(false)
    }
  }

  function handleBack() {
    if (preparingRef.current || submissionAttempted || attemptSent.current)
      return
    if (review) {
      if (command.retained && !restartRetryIsCurrent()) return
      setReview(null)
      return
    }
    setRestartRetryAuthorization(null)
    onBack()
  }

  async function readSource(
    recognitionId: string,
    token: { generation: number; scope: string },
  ) {
    const sourceInput = { bookId: book.id, recognitionId }
    const queryKey = trpc.finance.purchaseRecognition.queryKey(sourceInput)
    const source = await runSupplierFreshRead({
      isCurrent: () => authority.valid(token),
      cancelPrior: () =>
        client.cancelQueries({ queryKey, exact: true }, { silent: true }),
      getState: () => client.getQueryState(queryKey),
      fetch: () =>
        client.fetchQuery(
          trpc.finance.purchaseRecognition.queryOptions(sourceInput, {
            staleTime: 0,
            retry: false,
          }),
        ),
    })
    if (!authority.valid(token))
      throw new Error(
        "Account, Store, or network changed during purchase source verification.",
      )
    if (
      source.id !== recognitionId ||
      source.bookId !== book.id ||
      source.supplierId !== supplier.id ||
      source.storeId !== storeId
    )
      throw new PurchaseSourceScopeMismatch(
        "The purchase source does not match the current actor, supplier and finance book.",
      )
    return source
  }

  async function verifyConfirmedSourceAndContinue() {
    const sourceId = confirmedSourceUnverified
    const releasePreparation = beginPurchasePreparation(preparingRef)
    if (!sourceId || !releasePreparation) return
    setPreparing(true)
    try {
      const token = authority.begin()
      if (!token) return
      await readSource(sourceId, token)
      if (!authority.valid(token))
        throw new Error(
          "Account, Store, or network changed during verification.",
        )
      setConfirmedSourceUnverified(null)
      onRegistered(sourceId)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The confirmed purchase source remains unverified.",
      )
    } finally {
      releasePreparation()
      setPreparing(false)
    }
  }

  async function readRetainedCommandStatus(
    clientCommandId: string,
    token: { generation: number; scope: string },
  ) {
    const statusInput = { bookId: book.id, clientCommandId }
    const statusKey = trpc.finance.commandStatus.queryKey(statusInput)
    return runSupplierFreshRead({
      isCurrent: () => authority.valid(token),
      cancelPrior: () =>
        client.cancelQueries(
          { queryKey: statusKey, exact: true },
          { silent: true },
        ),
      getState: () => client.getQueryState(statusKey),
      fetch: () =>
        client.fetchQuery(
          trpc.finance.commandStatus.queryOptions(statusInput, {
            staleTime: 0,
            retry: false,
          }),
        ),
    })
  }

  async function recoverRegistration() {
    const releasePreparation = beginPurchasePreparation(preparingRef)
    if (!releasePreparation) return
    setRecovering(true)
    try {
      const pending = retainedCommandRef.current
      if (!pending) return
      const token = authority.begin()
      if (!token) return
      if (pending.command.operation !== "registerPurchase") {
        setRestartRetryAuthorization(null)
        setError(
          `The saved ${pending.command.operation} command belongs to another finance workflow. Return to the workflow that started it; this purchase form will not clear or retry it.`,
        )
        return
      }
      const result = await readRetainedCommandStatus(
        pending.command.clientCommandId,
        token,
      )
      if (!authority.valid(token))
        throw new Error(
          "Account or network changed during saved-result recovery.",
        )
      if (result.status === "NOT_FOUND" && !pending.rejectedCode) {
        if (submittedPayload.current && attemptSent.current) {
          setRestartRetryAuthorization(null)
          setError(
            "No recorded result was found. The original in-memory registration payload remains locked; retry only from its existing review.",
          )
          return
        }
        const authorization = authorizePurchaseRestartRetry({
          status: result.status,
          retained: pending,
          scope: { actorUserId, tenantId, bookId: book.id },
          contextKey: scope,
          operation: "registerPurchase",
        })
        if (
          !authorization ||
          !matchesPurchaseRestartRetryAuthorization({
            authorization,
            retained: retainedCommandRef.current,
            scope: { actorUserId, tenantId, bookId: book.id },
            contextKey: scope,
            operation: "registerPurchase",
          })
        )
          throw new Error(
            "The saved purchase identity or active Store changed during recovery. Check its status again before re-entering details.",
          )
        setRestartRetryAuthorization(authorization)
        setReview(null)
        setError(
          "No recorded result was found. Re-enter the exact original purchase details, review them, and confirm to retry with the retained command identity. Changed details are blocked; nothing is sent until you confirm.",
        )
        return
      }
      if (result.status === "NOT_FOUND" && pending.rejectedCode) {
        const acknowledged = await command.acknowledge()
        if (!authority.valid(token))
          throw new Error(
            "Account or network changed during saved-result recovery.",
          )
        if (acknowledged === "REJECTED") {
          submittedPayload.current = null
          attemptSent.current = false
          setLiveRetryIdentity(null)
          setSubmissionAttempted(false)
          setReview(null)
          setRestartRetryAuthorization(null)
        }
        return
      }
      const returnedId =
        result.result &&
        typeof result.result === "object" &&
        "id" in result.result &&
        typeof result.result.id === "string"
          ? result.result.id
          : undefined
      if (!returnedId)
        throw new Error(
          "The saved registration result did not contain its source identity.",
        )
      if (!authority.valid(token))
        throw new Error(
          "Account or network changed during saved-result recovery.",
        )
      const source = await readSource(returnedId, token)
      if (source.storeId !== storeId)
        throw new Error(
          "The saved purchase belongs to a different Store. Return to that Store before acknowledging its result.",
        )
      if (!authority.valid(token))
        throw new Error(
          "Account or network changed. Purchase source recovery was stopped.",
        )
      const acknowledged = await command.acknowledge()
      if (!authority.valid(token))
        throw new Error(
          "Account or network changed after saved-result confirmation.",
        )
      if (acknowledged === "RECORDED") {
        if (!authority.valid(token))
          throw new Error(
            "Account or network changed. Purchase source navigation was stopped.",
          )
        submittedPayload.current = null
        attemptSent.current = false
        setLiveRetryIdentity(null)
        setSubmissionAttempted(false)
        setRestartRetryAuthorization(null)
        onRegistered(returnedId)
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The saved registration result remains unconfirmed.",
      )
    } finally {
      releasePreparation()
      setRecovering(false)
    }
  }

  const canConfirmRetainedRetry = Boolean(
    command.retained &&
      canConfirmRetainedPurchaseCommand({
        authorization: retryAuthorizationRef.current,
        retained: command.retained,
        scope: { actorUserId, tenantId, bookId: book.id },
        contextKey: scope,
        operation: "registerPurchase",
        hasLiveExactPayload: Boolean(
          submittedPayload.current && attemptSent.current,
        ),
        liveIdentity: liveRetryIdentity,
        pending: command.pending,
      }),
  )

  return (
    <KeyboardAwareScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-4 pb-12"
      bottomOffset={100}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      disableScrollOnKeyboardHide
    >
      <ActionButton
        variant="ghost"
        disabled={
          preparing || recovering || submissionAttempted || attemptSent.current
        }
        onPress={handleBack}
      >
        ‹ {review ? "Edit purchase" : "Purchases"}
      </ActionButton>
      <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {supplier.name} · new purchase agreement
      </Text>
      <Text className="text-2xl font-bold">Register agreed goods</Text>
      <Text className="text-sm text-muted-foreground">
        This preserves the original goods and exact costs. Registration does not
        post a payable or move stock.
      </Text>
      {storeId &&
      availabilityReadAuthority.verified &&
      !availability.isFetching ? (
        <Text className="text-xs text-muted-foreground">
          Current Store · {balances[0]?.storeName ?? storeId}
        </Text>
      ) : null}
      {offline ? (
        <StatusBanner
          title="Offline"
          message="Purchase registration and Inventory facts require a current online read."
          tone="warning"
        />
      ) : null}
      {error ? <StatusBanner tone="destructive" message={error} /> : null}
      {confirmedSourceUnverified ? (
        <StatusBanner
          title="Registration confirmed · source unverified"
          message="The command is saved and cannot be submitted again. Verify this exact source in the current book, supplier, and Store before opening its history."
          actionLabel={preparing ? "Verifying…" : "Verify source and continue"}
          actionDisabled={preparing || recovering}
          onActionPress={() => void verifyConfirmedSourceAndContinue()}
          tone="warning"
        />
      ) : null}
      {preparing || recovering ? (
        <StatusBanner
          title={
            recovering
              ? "Checking saved registration"
              : "Preparing registration"
          }
          message={
            recovering
              ? "Refreshing the exact saved command status before enabling any retry."
              : "Refreshing the selected Store and Inventory balances before sending the reviewed agreement."
          }
          tone="primary"
        />
      ) : null}
      {!command.ready && !command.pending ? (
        <ActionButton
          variant="outline"
          disabled={preparing || recovering}
          onPress={() => void command.inspect(true)}
        >
          Check saved submission status
        </ActionButton>
      ) : null}
      {command.retained ? (
        <StatusBanner
          title="Earlier registration needs confirmation"
          message={
            restartRetryAuthorized
              ? "The original purchase details are not stored on this device. Re-enter them exactly, review them, and confirm; changed details will be refused without clearing the saved identity."
              : submittedPayload.current && attemptSent.current
                ? "The exact in-memory registration payload remains locked after its send attempt. Retry only from its existing review or check its saved result."
                : `Saved operation: ${command.retained.command.operation}. Check its exact result in the workflow that created it before starting another purchase.`
          }
          actionLabel={recovering ? "Checking…" : "Check saved result"}
          onActionPress={() => void recoverRegistration()}
          actionDisabled={preparing || recovering}
          tone="warning"
        />
      ) : null}
      {availability.isError || balanceQuery.isError ? (
        <StatusBanner
          title="Store balances unavailable"
          message={
            availability.error?.message ??
            balanceQuery.error?.message ??
            "Refresh the Store and its Inventory balances."
          }
          actionLabel="Refresh"
          actionDisabled={preparing || recovering}
          onActionPress={() => {
            void availability.refetch()
            void balanceQuery.refetch()
          }}
          tone="destructive"
        />
      ) : null}
      {!storeId && !offline && !availability.isPending ? (
        <StatusBanner
          title="Store required"
          message="Select a business Store before registering the agreed goods."
          tone="warning"
        />
      ) : null}
      {review ? (
        <>
          <StatusBanner
            title="Review original agreement"
            message={`${review.lines.length} goods lines · ${money(review.lines.reduce((sum, line) => sum + BigInt(line.amountMinor), 0n).toString())} · ${new Date(review.agreedAt).toISOString().slice(0, 10)} UTC. Current balance revisions will be fetched again before submission.`}
            tone="primary"
          />
          {review.lines.map((line) => (
            <Text key={line.balanceSourceId} className="text-sm">
              {line.description} · {line.enteredQuantity} ·{" "}
              {money(line.amountMinor)}
            </Text>
          ))}
          <ActionButton
            disabled={
              preparing ||
              recovering ||
              Boolean(confirmedSourceUnverified) ||
              !command.ready ||
              command.pending ||
              ((submissionAttempted || attemptSent.current) &&
                !canConfirmRetainedRetry) ||
              Boolean(command.retained && !canConfirmRetainedRetry)
            }
            isLoading={preparing || recovering || command.pending}
            onPress={() => void confirm()}
          >
            Confirm registration
          </ActionButton>
        </>
      ) : (
        <>
          <FormField
            label="Purchase description"
            value={description}
            onChangeText={setDescription}
            editable={!locked}
            maxLength={400}
            placeholder="Farm eggs for October"
          />
          <FormField
            label="Agreement date (UTC)"
            value={date}
            onChangeText={setDate}
            editable={!locked}
            placeholder="YYYY-MM-DD"
          />
          <Text className="text-lg font-bold">
            Choose actual goods balances
          </Text>
          {availability.isPending || balanceQuery.isPending ? (
            <Text>Loading current Store balances…</Text>
          ) : null}
          {balances.length === 0 && storeId && !balanceQuery.isPending ? (
            <StatusBanner
              title="No stock balances"
              message="Create or receive stock-tracked goods in this Store before registering a purchase source."
              tone="muted"
            />
          ) : null}
          {balances.map((balance) => {
            const selected = Boolean(lineFor(balance))
            return (
              <Pressable
                key={balance.balanceSourceId}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => toggleBalance(balance)}
                className="min-h-16 flex-row items-center justify-between gap-3 border-b border-border py-3"
              >
                <View className="min-w-0 flex-1">
                  <Text className="font-semibold">
                    {balance.productName} · {balance.variantName}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {balance.inventoryUnitName} · {balance.onHandQuantity} on
                    hand · version {balance.configurationVersionId.slice(0, 8)}
                  </Text>
                </View>
                <Text className="font-bold">
                  {selected ? "Selected" : "Select"}
                </Text>
              </Pressable>
            )
          })}
          {lines.map((line) => {
            const balance = balances.find(
              (row) => row.balanceSourceId === line.balanceSourceId,
            )
            if (!balance) return null
            return (
              <View
                key={line.balanceSourceId}
                className="gap-3 rounded-2xl border border-border p-4"
              >
                <Text className="font-bold">
                  {balance.productName} · {balance.variantName}
                </Text>
                <FormField
                  label="Agreed goods description"
                  value={line.description}
                  editable={!locked}
                  onChangeText={(value) =>
                    patchLine(line.balanceSourceId, { description: value })
                  }
                  maxLength={200}
                />
                <FormField
                  label={`Agreed quantity (${balance.inventoryUnitName})`}
                  value={line.enteredQuantity}
                  editable={!locked}
                  onChangeText={(value) =>
                    patchLine(line.balanceSourceId, { enteredQuantity: value })
                  }
                  keyboardType="decimal-pad"
                  placeholder="12"
                  helper={`Unit precision ${balance.inventoryUnitTransactionScale}; exact unit configuration is retained.`}
                />
                <MoneyField
                  label="Agreed line cost"
                  currencyCode={book.currencyCode}
                  value={line.amount}
                  editable={!locked}
                  onChangeValue={(value) =>
                    patchLine(line.balanceSourceId, { amount: value })
                  }
                />
                <StockCategoriesInput
                  value={line.categories}
                  input={line.categoryInput}
                  onChange={(value) =>
                    patchLine(line.balanceSourceId, { categories: value })
                  }
                  onInputChange={(value) =>
                    patchLine(line.balanceSourceId, { categoryInput: value })
                  }
                  disabled={locked}
                  market={false}
                />
                <ActionButton
                  variant="outline"
                  disabled={locked}
                  onPress={() => toggleBalance(balance)}
                >
                  Remove this goods line
                </ActionButton>
              </View>
            )
          })}
          {error ? <StatusBanner tone="destructive" message={error} /> : null}
          <ActionButton
            disabled={
              locked ||
              !balanceQuery.isSuccess ||
              !balanceReadAuthority.verified ||
              lines.length === 0
            }
            onPress={prepare}
          >
            Review agreed goods
          </ActionButton>
        </>
      )}
      {command.error ? (
        <StatusBanner
          title="Registration needs attention"
          message={command.error}
          tone="destructive"
        />
      ) : null}
      {command.notice ? <StatusBanner message={command.notice} /> : null}
    </KeyboardAwareScrollView>
  )
}

export function SupplierPurchaseRecognitionPanel({
  book,
  actorUserId,
  tenantId,
  supplier,
  recognitionId,
  onBack,
}: FinanceWorkspace & {
  supplier: Supplier
  recognitionId: string
  onBack: () => void
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const command = useMobileFinanceCommand({
    actorUserId,
    tenantId,
    bookId: book.id,
  })
  const [retryAuthorization, setRetryAuthorization] =
    useState<PurchaseRestartRetryAuthorization | null>(null)
  const [liveRetryIdentity, setLiveRetryIdentity] =
    useState<PurchaseRestartRetryAuthorization | null>(null)
  const retryAuthorizationRef =
    useRef<PurchaseRestartRetryAuthorization | null>(null)
  const retainedCommandRef = useRef(command.retained)
  retainedCommandRef.current = command.retained
  const [recovering, setRecovering] = useState(false)
  const [stage, setStage] = useState<
    "INVOICE" | "OWNERSHIP" | "RECEIPT" | null
  >(null)
  const [reference, setReference] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState("")
  const [reverseEventId, setReverseEventId] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [preparing, setPreparing] = useState(false)
  const [review, setReview] = useState<
    | { kind: "stage"; payload: StagePayload }
    | { kind: "reverse"; payload: ReversalPayload }
    | null
  >(null)
  const submittedPayload = useRef<StagePayload | ReversalPayload | null>(null)
  const confirmedActionRef = useRef(false)
  const attemptSent = useRef(false)
  const preparingRef = useRef(false)
  const [submissionAttempted, setSubmissionAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scope = `purchase-recognition:${actorUserId}:${tenantId}:${book.id}:${supplier.id}:${recognitionId}`
  function retryOperation() {
    const operation = retryAuthorizationRef.current?.operation
    return operation === "recognizePurchase" ||
      operation === "reversePurchaseRecognition"
      ? operation
      : null
  }
  function restartRetryIsCurrent() {
    const operation = retryOperation()
    return Boolean(
      operation &&
        matchesPurchaseRestartRetryAuthorization({
          authorization: retryAuthorizationRef.current,
          retained: retainedCommandRef.current,
          scope: { actorUserId, tenantId, bookId: book.id },
          contextKey: scope,
          operation,
        }),
    )
  }
  function setRestartRetryAuthorization(
    authorization: PurchaseRestartRetryAuthorization | null,
  ) {
    retryAuthorizationRef.current = authorization
    setRetryAuthorization(authorization)
  }
  useEffect(() => {
    if (
      retryAuthorization &&
      !matchesPurchaseRestartRetryAuthorization({
        authorization: retryAuthorization,
        retained: command.retained,
        scope: { actorUserId, tenantId, bookId: book.id },
        contextKey: scope,
        operation:
          retryAuthorization.operation === "reversePurchaseRecognition"
            ? "reversePurchaseRecognition"
            : "recognizePurchase",
      })
    ) {
      retryAuthorizationRef.current = null
      setRetryAuthorization(null)
    }
  }, [
    retryAuthorization,
    command.retained,
    actorUserId,
    tenantId,
    book.id,
    scope,
  ])
  useEffect(() => {
    if (
      !(attemptSent.current || submissionAttempted) ||
      !submittedPayload.current ||
      liveRetryIdentity
    )
      return
    if (command.retained)
      setLiveRetryIdentity(
        snapshotPurchaseRestartRetryIdentity(command.retained, scope),
      )
  }, [command.retained, liveRetryIdentity, scope, submissionAttempted])
  const restartRetryAuthorized = restartRetryIsCurrent()
  const canReenterRetainedCommand =
    restartRetryAuthorized &&
    !submittedPayload.current &&
    !attemptSent.current &&
    !submissionAttempted &&
    !command.pending
  const canContinue = () => isCurrentActor(actorUserId, tenantId)
  const authority = useCommandAuthority(scope, canContinue)
  const detailInput = { bookId: book.id, recognitionId }
  const detailKey = trpc.finance.purchaseRecognition.queryKey(detailInput)
  const query = useQuery(
    trpc.finance.purchaseRecognition.queryOptions(detailInput, {
      enabled: !offline,
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnMount: "always",
      refetchOnReconnect: "always",
      refetchOnWindowFocus: false,
    }),
  )
  const readAuthority = useSupplierReadAuthority({
    scope,
    enabled: true,
    offline,
    paused: query.fetchStatus === "paused",
    error: query.isError,
    fetching: query.isFetching,
    refetch: query.refetch,
  })
  const visible =
    readAuthority.verified &&
    query.isSuccess &&
    !query.isFetching &&
    query.fetchStatus !== "paused" &&
    !offline &&
    query.data?.id === recognitionId &&
    query.data?.bookId === book.id &&
    query.data?.supplierId === supplier.id
  const data: Recognition | undefined = visible ? query.data : undefined
  const availableStages = data
    ? availablePurchaseRecognitionStages(data.events, data.corrected)
    : []
  const storeBalancesInput = {
    includeCompatibleTotals: false,
    storeId: data?.storeId ?? "",
  }
  const storeBalancesKey =
    trpc.inventory.balanceReport.queryKey(storeBalancesInput)
  const storeBalances = useQuery(
    trpc.inventory.balanceReport.queryOptions(storeBalancesInput, {
      enabled: Boolean(data && stage === "RECEIPT" && !offline),
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnMount: "always",
      refetchOnReconnect: "always",
      refetchOnWindowFocus: false,
    }),
  )
  const storeBalanceReadAuthority = useSupplierReadAuthority({
    scope: `purchase-receipt-balances:${scope}:${data?.storeId ?? "no-store"}`,
    enabled: Boolean(data && stage === "RECEIPT"),
    offline,
    paused: storeBalances.fetchStatus === "paused",
    error: storeBalances.isError,
    fetching: storeBalances.isFetching,
    refetch: storeBalances.refetch,
  })
  const visibleStoreBalances =
    storeBalanceReadAuthority.verified &&
    storeBalances.isSuccess &&
    !storeBalances.isFetching
      ? storeBalances.data.rows
      : []
  const recognize = useMutation(
    trpc.finance.recognizePurchase.mutationOptions({ retry: false }),
  )
  const reverse = useMutation(
    trpc.finance.reversePurchaseRecognition.mutationOptions({ retry: false }),
  )
  const money = (minor: string) => formatFinanceMoney(minor, book.currencyCode)
  const locked =
    offline ||
    command.pending ||
    Boolean(review) ||
    (Boolean(command.retained) && !canReenterRetainedCommand) ||
    submissionAttempted ||
    attemptSent.current ||
    preparing ||
    recovering ||
    !data

  async function protectedRefresh() {
    readAuthority.invalidate()
    readAuthority.runProtectedRead(async () => {
      const result = await client.fetchQuery(
        trpc.finance.purchaseRecognition.queryOptions(detailInput, {
          staleTime: 0,
          retry: false,
        }),
      )
      return {
        isSuccess:
          result.id === recognitionId &&
          result.bookId === book.id &&
          result.supplierId === supplier.id,
        fetchStatus: "idle",
      }
    })
  }

  async function readRetainedCommandStatus(
    clientCommandId: string,
    token: { generation: number; scope: string },
  ) {
    const statusInput = { bookId: book.id, clientCommandId }
    const statusKey = trpc.finance.commandStatus.queryKey(statusInput)
    return runSupplierFreshRead({
      isCurrent: () => authority.valid(token),
      cancelPrior: () =>
        client.cancelQueries(
          { queryKey: statusKey, exact: true },
          { silent: true },
        ),
      getState: () => client.getQueryState(statusKey),
      fetch: () =>
        client.fetchQuery(
          trpc.finance.commandStatus.queryOptions(statusInput, {
            staleTime: 0,
            retry: false,
          }),
        ),
    })
  }

  async function recoverRecognitionCommand() {
    const releasePreparation = beginPurchasePreparation(preparingRef)
    if (!releasePreparation) return
    setRecovering(true)
    try {
      const pending = retainedCommandRef.current
      if (!pending) return
      const operation = pending.command.operation
      if (
        operation !== "recognizePurchase" &&
        operation !== "reversePurchaseRecognition"
      ) {
        setRestartRetryAuthorization(null)
        setError(
          `The saved ${operation} command belongs to another finance workflow. Return to the workflow that started it; this source history will not clear or retry it.`,
        )
        return
      }
      const token = authority.begin()
      if (!token) return
      const statusInput = {
        bookId: book.id,
        clientCommandId: pending.command.clientCommandId,
      }
      const statusKey = trpc.finance.commandStatus.queryKey(statusInput)
      const status = await runSupplierFreshRead({
        isCurrent: () => authority.valid(token),
        cancelPrior: () =>
          client.cancelQueries(
            { queryKey: statusKey, exact: true },
            { silent: true },
          ),
        getState: () => client.getQueryState(statusKey),
        fetch: () =>
          client.fetchQuery(
            trpc.finance.commandStatus.queryOptions(statusInput, {
              staleTime: 0,
              retry: false,
            }),
          ),
      })
      if (!authority.valid(token))
        throw new Error(
          "Account or network changed during saved-result recovery.",
        )
      if (status.status === "NOT_FOUND" && !pending.rejectedCode) {
        if (submittedPayload.current && attemptSent.current) {
          setRestartRetryAuthorization(null)
          setError(
            "No recorded result was found. The exact in-memory source payload remains locked; retry only from its existing review.",
          )
          return
        }
        const authorization = authorizePurchaseRestartRetry({
          status: status.status,
          retained: pending,
          scope: { actorUserId, tenantId, bookId: book.id },
          contextKey: scope,
          operation,
        })
        if (
          !authorization ||
          !matchesPurchaseRestartRetryAuthorization({
            authorization,
            retained: retainedCommandRef.current,
            scope: { actorUserId, tenantId, bookId: book.id },
            contextKey: scope,
            operation,
          })
        )
          throw new Error(
            "The saved command identity or selected source changed during recovery. Check its status again before re-entering details.",
          )
        setRestartRetryAuthorization(authorization)
        setReview(null)
        setReverseEventId(null)
        setError(
          "No recorded result was found. Re-enter the exact original stage or correction details, review them, then confirm. Changed details are refused without clearing or replacing the retained command identity.",
        )
        return
      }
      if (status.status === "NOT_FOUND" && pending.rejectedCode) {
        const acknowledged = await command.acknowledge()
        if (!authority.valid(token))
          throw new Error(
            "Account or network changed during saved-result recovery.",
          )
        if (acknowledged === "REJECTED") {
          submittedPayload.current = null
          attemptSent.current = false
          setSubmissionAttempted(false)
          setReview(null)
          setRestartRetryAuthorization(null)
          setError(
            "The original command was definitively rejected. Its identity was acknowledged; review corrected details before starting a new action.",
          )
        }
        return
      }
      const committedEventId =
        status.result &&
        typeof status.result === "object" &&
        "id" in status.result &&
        typeof status.result.id === "string"
          ? status.result.id
          : undefined
      if (!committedEventId)
        throw new Error(
          "The saved purchase action did not return its source event identity.",
        )
      const current = await runSupplierFreshRead({
        isCurrent: () => authority.valid(token),
        cancelPrior: () =>
          client.cancelQueries(
            { queryKey: detailKey, exact: true },
            { silent: true },
          ),
        getState: () => client.getQueryState(detailKey),
        fetch: () =>
          client.fetchQuery(
            trpc.finance.purchaseRecognition.queryOptions(detailInput, {
              staleTime: 0,
              retry: false,
            }),
          ),
      })
      if (
        !authority.valid(token) ||
        current.id !== recognitionId ||
        current.bookId !== book.id ||
        current.supplierId !== supplier.id ||
        !current.events.some((event) => event.id === committedEventId)
      )
        throw new Error(
          "The committed event could not be verified in this exact supplier source. Its saved identity remains unchanged.",
        )
      const acknowledged = await command.acknowledge()
      if (acknowledged === "RECORDED") {
        confirmedActionRef.current = true
        setReview(null)
      }
      if (!authority.valid(token))
        throw new Error(
          "Account or network changed after saved-result confirmation.",
        )
      if (acknowledged === "REJECTED") {
        submittedPayload.current = null
        attemptSent.current = false
        setLiveRetryIdentity(null)
        setSubmissionAttempted(false)
        setReview(null)
        setRestartRetryAuthorization(null)
        setError(
          "The earlier source command was rejected. Review corrected source details before retrying.",
        )
        return
      }
      if (acknowledged !== "RECORDED") return
      submittedPayload.current = null
      attemptSent.current = false
      setLiveRetryIdentity(null)
      setSubmissionAttempted(false)
      setReview(null)
      setRestartRetryAuthorization(null)
      readAuthority.invalidate()
      await client.invalidateQueries({ queryKey: detailKey, exact: true })
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The saved purchase result remains unconfirmed.",
      )
    } finally {
      releasePreparation()
      setRecovering(false)
    }
  }

  function prepareStage() {
    if (!data || !stage || locked || preparingRef.current) return
    try {
      const effectiveAt = financeUtcDate(date, book.startsAt)
      if (!reference.trim() || reference.trim().length > 160)
        throw new Error("Enter the exact source reference for this dated fact.")
      const payload: StagePayload = {
        bookId: book.id,
        recognitionId: data.id,
        stage,
        effectiveAt,
        reference: reference.trim(),
        ...(stage === "INVOICE"
          ? {
              invoiceAmountMinor: data.amountMinor,
              ...(dueDate.trim()
                ? { dueAt: financeUtcDate(dueDate, book.startsAt) }
                : {}),
            }
          : {}),
      }
      if (payload.dueAt && payload.dueAt < effectiveAt)
        throw new Error("Invoice due date cannot precede the invoice date.")
      confirmedActionRef.current = false
      setReview({ kind: "stage", payload })
      setError(null)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check the source details.",
      )
    }
  }

  function prepareReverse(eventId: string) {
    if (!data || locked || preparingRef.current) return
    try {
      const event = data.events.find((item) => item.id === eventId)
      if (!event || !canReversePurchaseRecognitionEvent(event, data.events))
        throw new Error("Choose an active original purchase fact.")
      if (event.stage === "RECEIPT")
        throw new Error(
          "Physical receipt correction belongs to the supplier return and credit source.",
        )
      if (!reason.trim())
        throw new Error("Enter why this original source must be corrected.")
      confirmedActionRef.current = false
      setReview({
        kind: "reverse",
        payload: {
          bookId: book.id,
          recognitionId: data.id,
          eventId,
          effectiveAt: financeUtcDate(date, book.startsAt),
          reason: reason.trim(),
        },
      })
      setReverseEventId(eventId)
      setError(null)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check the selected source.",
      )
    }
  }

  async function confirm() {
    if (!review || !data || confirmedActionRef.current) return
    const releasePreparation = beginPurchasePreparation(preparingRef)
    if (!releasePreparation) return
    setPreparing(true)
    setError(null)
    try {
      const token = authority.begin()
      if (!token) return
      const restartRetry =
        restartRetryIsCurrent() &&
        !submittedPayload.current &&
        !attemptSent.current
      if (command.retained && !restartRetry && !submittedPayload.current)
        throw new Error(
          "Check the exact saved command status before confirming another source action.",
        )
      if (restartRetry) {
        const pending = retainedCommandRef.current
        const operation = retryOperation()
        if (
          !pending ||
          !operation ||
          !matchesPurchaseRestartRetryAuthorization({
            authorization: retryAuthorizationRef.current,
            retained: pending,
            scope: { actorUserId, tenantId, bookId: book.id },
            contextKey: scope,
            operation,
          })
        )
          throw new Error(
            "The retained command identity or selected source changed. Check its exact status before retrying.",
          )
        const latestStatus = await readRetainedCommandStatus(
          pending.command.clientCommandId,
          token,
        )
        if (
          !authority.valid(token) ||
          latestStatus.status !== "NOT_FOUND" ||
          pending.rejectedCode !== undefined ||
          !restartRetryIsCurrent()
        ) {
          setRestartRetryAuthorization(null)
          throw new Error(
            "The saved command status or identity changed. Nothing was sent; check the saved result again.",
          )
        }
      }
      let payload: StagePayload | ReversalPayload =
        submittedPayload.current ?? review.payload
      if (
        !submittedPayload.current &&
        review.kind === "stage" &&
        review.payload.stage === "RECEIPT"
      ) {
        if (restartRetry) {
          const receipts = retainedPurchaseReceiptConfirmations(
            retainedCommandRef.current?.command,
            {
              bookId: book.id,
              recognitionId: data.id,
              storeId: data.storeId,
              lineIds: data.lines.map((line) => line.id),
            },
          )
          if (!receipts)
            throw new Error(
              "The original receipt revisions are missing or belong to another source. Keep the saved command and reconcile its result; do not submit a replacement receipt.",
            )
          payload = { ...review.payload, receipts }
        } else {
          const readToken = { generation: token.generation, scope: token.scope }
          const fresh = await runSupplierFreshRead({
            isCurrent: () => authority.valid(readToken),
            cancelPrior: () =>
              client.cancelQueries(
                { queryKey: storeBalancesKey, exact: true },
                { silent: true },
              ),
            getState: () => client.getQueryState(storeBalancesKey),
            fetch: () =>
              client.fetchQuery(
                trpc.inventory.balanceReport.queryOptions(storeBalancesInput, {
                  staleTime: 0,
                  retry: false,
                }),
              ),
          })
          if (!authority.valid(token))
            throw new Error(
              "Account, Store, or network changed. Refresh the receipt review.",
            )
          payload = {
            ...review.payload,
            receipts: data.lines.map((line) => {
              const balance = matchPurchaseBalance({
                rows: fresh.rows,
                balanceSourceId: line.balanceSourceId,
                storeId: data.storeId,
                inventoryUnitId: line.enteredInventoryUnitId,
                configurationVersionId: line.configurationVersionId,
              })
              if (!balance)
                throw new Error(
                  `Inventory source changed for ${line.description}. Refresh and resolve the exact unit configuration before receiving goods.`,
                )
              return {
                lineId: line.id,
                expectedBalanceRevision: balance.revision,
              }
            }),
          } as StagePayload
        }
      }
      if (!authority.valid(token))
        throw new Error("Account or network changed. Review this source again.")
      if (restartRetry && !restartRetryIsCurrent())
        throw new Error(
          "The saved command identity changed during preparation. Nothing was sent.",
        )
      submittedPayload.current = payload
      const stageSuccessMessage =
        review.kind === "stage"
          ? review.payload.stage === "INVOICE"
            ? "Supplier invoice recorded against this purchase."
            : review.payload.stage === "OWNERSHIP"
              ? "Ownership recorded for this purchase."
              : restartRetry
                ? "Original physical receipt confirmed with its saved stock revisions."
                : "Physical receipt recorded from current Inventory balances."
          : undefined
      const accepted =
        review.kind === "stage"
          ? await command.run(
              "recognizePurchase",
              payload,
              async (clientCommandId) => {
                if (!authority.valid(token))
                  throw new Error(
                    "Account or network changed before source recognition.",
                  )
                attemptSent.current = true
                setSubmissionAttempted(true)
                const result = await recognize.mutateAsync({
                  ...payload,
                  clientCommandId,
                } as RouterInputs["finance"]["recognizePurchase"])
                if (typeof result.id !== "string" || !result.id)
                  throw new Error(
                    "The recognition result identity is unavailable. Check the original command result before continuing.",
                  )
                return result
              },
              stageSuccessMessage,
              "stage" in payload &&
                payload.stage === "RECEIPT" &&
                payload.receipts
                ? purchaseReceiptRecoveryMetadata({
                    recognitionId: payload.recognitionId,
                    storeId: data.storeId,
                    receipts: payload.receipts,
                  })
                : undefined,
            )
          : await command.run(
              "reversePurchaseRecognition",
              payload,
              async (clientCommandId) => {
                if (!authority.valid(token))
                  throw new Error(
                    "Account or network changed before source correction.",
                  )
                attemptSent.current = true
                setSubmissionAttempted(true)
                const result = await reverse.mutateAsync({
                  ...payload,
                  clientCommandId,
                } as RouterInputs["finance"]["reversePurchaseRecognition"])
                if (typeof result.id !== "string" || !result.id)
                  throw new Error(
                    "The correction result identity is unavailable. Check the original command result before continuing.",
                  )
                return result
              },
              "Selected purchase recognition corrected.",
            )
      if (!accepted) {
        if (restartRetry && !attemptSent.current) {
          submittedPayload.current = null
          setReview(null)
          setRestartRetryAuthorization(null)
        }
        return
      }
      // Clear the confirmed review before post-success authority/source reads.
      // The runner already cleared its identity; the old form must not resend.
      confirmedActionRef.current = true
      attemptSent.current = false
      setSubmissionAttempted(false)
      submittedPayload.current = null
      setLiveRetryIdentity(null)
      setRestartRetryAuthorization(null)
      setReview(null)
      setStage(null)
      setReverseEventId(null)
      setReason("")
      setReference("")
      setDueDate("")
      readAuthority.invalidate()
      if (!authority.valid(token))
        throw new Error(
          "Source action recorded. Account or network changed; refresh its source history before continuing.",
        )
      await client.invalidateQueries({ queryKey: detailKey, exact: true })
      await client.fetchQuery(
        trpc.finance.purchaseRecognition.queryOptions(detailInput, {
          staleTime: 0,
          retry: false,
        }),
      )
      if (review.kind === "stage" && review.payload.stage === "RECEIPT")
        await client.invalidateQueries({
          queryKey: trpc.inventory.balanceReport.pathKey(),
        })
    } catch (failure) {
      if (!attemptSent.current) submittedPayload.current = null
      setError(
        failure instanceof Error
          ? failure.message
          : "The purchase fact could not be confirmed.",
      )
    } finally {
      releasePreparation()
      setPreparing(false)
    }
  }

  function handleBack() {
    if (
      preparingRef.current ||
      recovering ||
      submissionAttempted ||
      attemptSent.current
    )
      return
    if (review) setReview(null)
    else onBack()
  }

  const selectedReverseEvent = data?.events.find(
    (event) => event.id === reverseEventId,
  )
  const reviewOperation =
    review?.kind === "stage"
      ? "recognizePurchase"
      : review?.kind === "reverse"
        ? "reversePurchaseRecognition"
        : null
  const canConfirmRetainedRetry = Boolean(
    command.retained &&
      reviewOperation &&
      canConfirmRetainedPurchaseCommand({
        authorization: retryAuthorizationRef.current,
        retained: command.retained,
        scope: { actorUserId, tenantId, bookId: book.id },
        contextKey: scope,
        operation: reviewOperation,
        hasLiveExactPayload: Boolean(
          submittedPayload.current && attemptSent.current,
        ),
        liveIdentity: liveRetryIdentity,
        pending: command.pending,
      }),
  )
  return (
    <KeyboardAwareScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-4 pb-12"
      bottomOffset={100}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      disableScrollOnKeyboardHide
    >
      <ActionButton
        variant="ghost"
        disabled={
          preparing || recovering || submissionAttempted || attemptSent.current
        }
        onPress={handleBack}
      >
        ‹ {review ? "Purchase history" : "Purchases"}
      </ActionButton>
      {offline ? (
        <StatusBanner
          title="Offline"
          message="Recognition history and finance source actions are hidden until an online read is verified."
          tone="warning"
        />
      ) : null}
      {preparing ? (
        <StatusBanner
          title="Preparing source action"
          message="Refreshing required Inventory facts and verifying the reviewed action before sending it."
          tone="primary"
        />
      ) : null}
      {recovering ? (
        <StatusBanner
          title="Checking saved source result"
          message="Refreshing the exact command status and verifying the source event before any acknowledgment or retry."
          tone="primary"
        />
      ) : null}
      {query.isPending && !offline ? (
        <Text>Loading purchase source history…</Text>
      ) : null}
      {query.isError ? (
        <StatusBanner
          title="Purchase history unavailable"
          message={query.error.message}
          actionLabel="Try again"
          actionDisabled={preparing}
          onActionPress={protectedRefresh}
          tone="destructive"
        />
      ) : null}
      {query.isSuccess && !visible && !offline && !query.isFetching ? (
        <StatusBanner
          title="Purchase source changed"
          message="This source no longer matches the selected supplier and finance book. No action is available."
          tone="warning"
        />
      ) : null}
      {data ? (
        <>
          <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {supplier.name} · purchase source
          </Text>
          <Text className="text-2xl font-bold">{data.description}</Text>
          <Text className="text-sm text-muted-foreground">
            Store {data.storeId} · agreed{" "}
            {new Date(data.agreedAt).toISOString().slice(0, 10)} UTC ·
            registered {money(data.amountMinor)}
          </Text>
          {data.corrected ? (
            <StatusBanner
              title="Source corrected"
              message="This recognition document cannot accept new facts after a correction."
              tone="warning"
            />
          ) : null}
          {data.limits.receiptCorrection ===
          "SUPPLIER_RETURN_SOURCE_REQUIRED" ? (
            <StatusBanner
              message="Physical receipt corrections must use the supplier return and credit source."
              tone="muted"
            />
          ) : null}
          <Text className="text-lg font-bold">
            Agreed goods and receipt evidence
          </Text>
          {data.lines.map((line) => (
            <View key={line.id} className="gap-1 border-b border-border py-3">
              <View className="flex-row justify-between gap-3">
                <Text className="min-w-0 flex-1 font-semibold">
                  {line.description}
                </Text>
                <Text className="font-bold tabular-nums">
                  {money(line.amountMinor)}
                </Text>
              </View>
              <Text className="text-xs text-muted-foreground">
                {line.enteredQuantity} · configuration{" "}
                {line.configurationVersionId.slice(0, 10)} · source{" "}
                {line.balanceSourceId}
              </Text>
              <Text className="text-xs text-muted-foreground">
                Categories:{" "}
                {line.categories.map((category) => category.name).join(", ")}
              </Text>
              {line.receipt ? (
                <Text className="text-xs text-muted-foreground">
                  Receipt {line.receipt.id} · stock movement{" "}
                  {line.receipt.stockMovementId} · valuation{" "}
                  {line.receipt.valuation?.status.toLowerCase() ??
                    "not recorded"}
                  {line.receipt.valuation?.status === "UNKNOWN"
                    ? " (prior carrying value remains unknown)"
                    : ""}
                </Text>
              ) : (
                <Text className="text-xs text-muted-foreground">
                  Physical receipt not recorded.
                </Text>
              )}
            </View>
          ))}
          <Text className="text-lg font-bold">Dated source history</Text>
          {data.events.map((event) => (
            <View
              key={event.id}
              className="gap-1 rounded-2xl border border-border p-4"
            >
              <View className="flex-row items-start justify-between gap-3">
                <Text className="font-semibold">
                  {event.stage.toLowerCase()} ·{" "}
                  {event.reversalOfId ? "correction" : "original"}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {new Date(event.effectiveAt).toISOString().slice(0, 10)} UTC
                </Text>
              </View>
              <Text className="text-xs text-muted-foreground">
                {event.reference} · actor {event.actorUserId} · journal{" "}
                {event.journalEntryId} · sequence {event.sequence}
              </Text>
              {event.reversalOfId ? (
                <Text className="text-xs text-muted-foreground">
                  Corrects source {event.reversalOfId} · {event.reason}
                </Text>
              ) : null}
              {event.invoiceBillId ? (
                <Text className="text-xs text-muted-foreground">
                  Actual supplier bill {event.invoiceBillId}
                </Text>
              ) : null}
              {event.reversalId ? (
                <Text className="text-xs text-muted-foreground">
                  Reversal {event.reversalId}
                </Text>
              ) : null}
              {canReversePurchaseRecognitionEvent(event, data.events) ? (
                <ActionButton
                  variant="outline"
                  disabled={locked}
                  onPress={() => {
                    if (preparingRef.current || locked) return
                    setReverseEventId(event.id)
                    setReason("")
                    setStage(null)
                  }}
                >
                  Correct this {event.stage.toLowerCase()} source
                </ActionButton>
              ) : null}
            </View>
          ))}
          {data.events.length === 0 ? (
            <Text className="text-sm text-muted-foreground">
              No invoice, ownership, or receipt fact has been recorded yet.
            </Text>
          ) : null}
          {availableStages.length ? (
            <>
              <Text className="text-lg font-bold">
                Record a separate source fact
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {availableStages.map((value) => (
                  <ActionButton
                    key={value}
                    variant={stage === value ? "secondary" : "outline"}
                    disabled={locked}
                    onPress={() => {
                      setStage(value)
                      setReverseEventId(null)
                      setError(null)
                    }}
                  >
                    {value === "INVOICE"
                      ? "Invoice"
                      : value === "OWNERSHIP"
                        ? "Ownership"
                        : "Physical receipt"}
                  </ActionButton>
                ))}
              </View>
              {stage ? (
                <View className="gap-3 rounded-2xl border border-border p-4">
                  <Text className="font-bold">
                    {stage === "INVOICE"
                      ? "Invoice and payable"
                      : stage === "OWNERSHIP"
                        ? "Dated ownership declaration"
                        : "Owned goods arriving"}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {stage === "INVOICE"
                      ? "Only the invoice creates the actual supplier bill. The total must equal the immutable agreed costs."
                      : stage === "OWNERSHIP"
                        ? "Enter the merchant's source reference. Billing or shipping status does not establish ownership."
                        : "Each registered line will be received at its exact original unit and current Store balance revision."}
                  </Text>
                  <FormField
                    label={
                      stage === "OWNERSHIP"
                        ? "Merchant ownership reference"
                        : stage === "RECEIPT"
                          ? "Receipt / delivery reference"
                          : "Invoice reference"
                    }
                    value={reference}
                    editable={!locked}
                    onChangeText={setReference}
                    maxLength={160}
                  />
                  <FormField
                    label="Effective date (UTC)"
                    value={date}
                    editable={!locked}
                    onChangeText={setDate}
                    placeholder="YYYY-MM-DD"
                  />
                  {stage === "INVOICE" ? (
                    <>
                      <MoneyField
                        label="Confirm invoice total"
                        currencyCode={book.currencyCode}
                        value={money(data.amountMinor)}
                        editable={false}
                        onChangeValue={() => undefined}
                        helper="This exact amount must match the agreed line costs."
                      />
                      <FormField
                        label="Due date (optional, UTC)"
                        value={dueDate}
                        editable={!locked}
                        onChangeText={setDueDate}
                        placeholder="YYYY-MM-DD"
                      />
                    </>
                  ) : null}
                  {stage === "RECEIPT" ? (
                    <>
                      {storeBalances.isPending ||
                      !storeBalanceReadAuthority.verified ? (
                        <Text>Checking current Store balances…</Text>
                      ) : null}
                      {storeBalances.isError ? (
                        <StatusBanner
                          title="Receipt balances unavailable"
                          message={storeBalances.error.message}
                          actionLabel="Refresh"
                          actionDisabled={preparing}
                          onActionPress={() =>
                            storeBalanceReadAuthority.runProtectedRead()
                          }
                          tone="destructive"
                        />
                      ) : null}
                      {!storeBalances.isError &&
                      storeBalanceReadAuthority.verified
                        ? data.lines.map((line) => {
                            const balance = visibleStoreBalances.find(
                              (row) =>
                                row.balanceSourceId === line.balanceSourceId,
                            )
                            const exact =
                              balance &&
                              balance.storeId === data.storeId &&
                              balance.inventoryUnitId ===
                                line.enteredInventoryUnitId &&
                              balance.configurationVersionId ===
                                line.configurationVersionId
                            return (
                              <Text
                                key={line.id}
                                className="text-xs text-muted-foreground"
                              >
                                {line.description}:{" "}
                                {exact
                                  ? `${balance.inventoryUnitName} · revision ${balance.revision} · ${balance.onHandQuantity} on hand`
                                  : "source balance or unit configuration changed; receipt is blocked"}
                              </Text>
                            )
                          })
                        : null}
                    </>
                  ) : null}
                  <ActionButton
                    disabled={
                      locked ||
                      (stage === "RECEIPT" &&
                        (!storeBalanceReadAuthority.verified ||
                          !storeBalances.isSuccess ||
                          data.lines.some((line) => {
                            const balance = visibleStoreBalances.find(
                              (row) =>
                                row.balanceSourceId === line.balanceSourceId,
                            )
                            return (
                              !balance ||
                              balance.storeId !== data.storeId ||
                              balance.inventoryUnitId !==
                                line.enteredInventoryUnitId ||
                              balance.configurationVersionId !==
                                line.configurationVersionId
                            )
                          })))
                    }
                    onPress={prepareStage}
                  >
                    Review {stage.toLowerCase()}
                  </ActionButton>
                </View>
              ) : null}
            </>
          ) : null}
          {reverseEventId && selectedReverseEvent ? (
            <View className="gap-3 rounded-2xl border border-border p-4">
              <Text className="font-bold">
                Correct selected {selectedReverseEvent.stage.toLowerCase()}
              </Text>
              <Text className="text-xs text-muted-foreground">
                This posts the exact opposite source journal. Later purchase
                facts and any active invoice settlements must be resolved first.
              </Text>
              <FormField
                label="Correction reason"
                value={reason}
                editable={!locked}
                onChangeText={setReason}
                maxLength={400}
                multiline
              />
              <FormField
                label="Correction date (UTC)"
                value={date}
                editable={!locked}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
              />
              <ActionButton
                disabled={locked}
                onPress={() => prepareReverse(reverseEventId)}
              >
                Review correction
              </ActionButton>
            </View>
          ) : null}
          {review ? (
            <View className="gap-3 rounded-2xl border border-primary p-4">
              <StatusBanner
                title={
                  review.kind === "stage"
                    ? `Review ${review.payload.stage.toLowerCase()} source`
                    : "Review source correction"
                }
                message={
                  review.kind === "stage"
                    ? `${review.payload.reference} · ${new Date(review.payload.effectiveAt).toISOString().slice(0, 10)} UTC${review.payload.stage === "INVOICE" ? ` · confirmed total ${money(data.amountMinor)}` : ""}${review.payload.stage === "RECEIPT" ? " · exact goods receipt and current balance revisions will be verified again" : ""}`
                    : `${review.payload.reason} · ${new Date(review.payload.effectiveAt).toISOString().slice(0, 10)} UTC`
                }
                tone="primary"
              />
              {restartRetryAuthorized &&
              review.kind === "stage" &&
              review.payload.stage === "RECEIPT" &&
              !retainedPurchaseReceiptConfirmations(command.retained?.command, {
                bookId: book.id,
                recognitionId: data.id,
                storeId: data.storeId,
                lineIds: data.lines.map((line) => line.id),
              }) ? (
                <StatusBanner
                  title="Receipt replay unavailable after restart"
                  message="The original Inventory balance revisions were not retained. Current revisions cannot stand in for the exact original payload. Keep the command identity and reconcile the source before taking another action."
                  tone="warning"
                />
              ) : null}
              <ActionButton
                disabled={
                  preparing ||
                  recovering ||
                  !command.ready ||
                  command.pending ||
                  ((submissionAttempted || attemptSent.current) &&
                    !canConfirmRetainedRetry) ||
                  Boolean(command.retained && !canConfirmRetainedRetry) ||
                  Boolean(
                    restartRetryAuthorized &&
                      review.kind === "stage" &&
                      review.payload.stage === "RECEIPT" &&
                      !retainedPurchaseReceiptConfirmations(
                        command.retained?.command,
                        {
                          bookId: book.id,
                          recognitionId: data.id,
                          storeId: data.storeId,
                          lineIds: data.lines.map((line) => line.id),
                        },
                      ),
                  )
                }
                isLoading={preparing || recovering || command.pending}
                onPress={() => void confirm()}
              >
                {review.kind === "stage"
                  ? "Confirm source fact"
                  : "Confirm correction"}
              </ActionButton>
            </View>
          ) : null}
        </>
      ) : null}
      {error ? <StatusBanner tone="destructive" message={error} /> : null}
      {command.error ? (
        <StatusBanner
          title="Submission needs attention"
          message={command.error}
          tone="destructive"
        />
      ) : null}
      {command.notice ? <StatusBanner message={command.notice} /> : null}
      {command.retained ? (
        <StatusBanner
          title="Earlier submission needs confirmation"
          message={
            restartRetryAuthorized
              ? "The original source details are not stored on this device. Re-enter them exactly, review them, then confirm with the retained identity. Changed details are refused without clearing that identity."
              : submittedPayload.current && attemptSent.current
                ? "The exact in-memory source payload is locked. Retry only from its existing review, or check the saved result."
                : `Saved operation: ${command.retained.command.operation}. Return to the workflow that created it; this source history will not clear or retry it.`
          }
          actionLabel={recovering ? "Checking…" : "Check saved result"}
          actionDisabled={preparing || recovering}
          onActionPress={() => void recoverRecognitionCommand()}
          tone="warning"
        />
      ) : null}
    </KeyboardAwareScrollView>
  )
}
