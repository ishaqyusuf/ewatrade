import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import * as Crypto from "expo-crypto"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import {
  type OfflineCommandScope,
  offlineCommandScope,
  offlineCommandScopeKey,
  ownsOfflineCommand,
  sameOfflineCommandFacts,
  scopedOfflineCommands,
} from "@/lib/offline-command-scope"
import {
  type CorrectionDescription,
  type QuickSaleCorrectionAttempt,
  blankQuickSaleLines,
  correctionAvailability,
  correctionDescriptions,
  correctionKey,
  localStatusForCorrection,
  restoreCorrectionAttempt,
  validateCorrectionReceipt,
} from "@/lib/quick-sale-correction"
import { getSession, getSessionGeneration } from "@/lib/session-store"
import { zustandStorage } from "./mmkv"

type ReplayInput = RouterInputs["offline"]["replay"]
type ReplayCommand = ReplayInput["commands"][number]
type ReplayResult = RouterOutputs["offline"]["replay"][number]
type RecoveryResult = RouterOutputs["offline"]["recover"][number]
type CorrectionReceipt = RouterOutputs["offline"]["correctBlankQuickSale"]

export type LocalOfflineCommand = Omit<
  ReplayCommand,
  "createdAtClient" | "dependencyClientIds"
> & {
  createdAtClient: Date
  dependencyClientIds: string[]
  /** Missing on legacy records: retained privately, never adopted or replayed. */
  actorUserId?: string
  storeId?: string
  deviceId?: string
  displayTotal?: { amountMinor: number; currencyCode: string }
  authoritativeState?: unknown
  conflictCode?: string | null
  conflictMessage?: string | null
  businessId: string
  localStatus:
    | "applied"
    | "approval"
    | "blocked"
    | "discarded"
    | "pending"
    | "review"
  result?: unknown
  /** Durable hold; ordinary sync and local retry cannot bypass admin recovery. */
  recoveryHeld?: boolean
  /**
   * Retired by a server-confirmed Quick sale correction: the replacement's
   * command identity. The original stays as immutable history.
   */
  correctedBy?: string
}

export type OfflineReplayBatch = {
  scope: OfflineCommandScope
  deviceId: string
  commands: Array<
    ReplayCommand & { createdAtClient: Date; dependencyClientIds: string[] }
  >
}

export type OfflineRecoveryPartition = {
  scope: OfflineCommandScope
  deviceId: string
  commandCount: number
}

type OfflineCommandState = {
  commands: LocalOfflineCommand[]
  /**
   * Durable Quick sale correction attempts, separate from the immutable
   * original queue entries. Keyed by owner, device and original identity.
   */
  corrections: Record<string, QuickSaleCorrectionAttempt>
  deviceId: string
  deviceIdsByScope: Record<string, string>
  hasHydrated: boolean
  /** Missing origin is refused; old callers must capture prepareReplay(). */
  applyReplayResults: (
    results: ReplayResult[],
    batch?: OfflineReplayBatch,
  ) => void
  applyScopedReplayResults: (
    results: ReplayResult[],
    batch: OfflineReplayBatch,
  ) => void
  applyScopedRecoveryResults: (
    results: RecoveryResult[],
    batch: OfflineReplayBatch,
  ) => void
  prepareReplay: (mode?: "ordinary" | "recovery") => OfflineReplayBatch | null
  /** Explicit choice of original local ownership; confers no business access. */
  recoveryPartitions: () => OfflineRecoveryPartition[]
  prepareRecovery: (scope: OfflineCommandScope) => OfflineReplayBatch | null
  discardCommand: (clientCommandId: string) => void
  queueCommand: (
    command: Omit<ReplayCommand, "clientCommandId" | "createdAtClient"> & {
      displayTotal?: { amountMinor: number; currencyCode: string }
      clientCommandId?: string
      createdAtClient?: Date
    },
  ) => string
  retryCommand: (clientCommandId: string) => void
  /**
   * The one correction attempt for this current user's own queued original,
   * confirmed durably saved before it is returned. An existing attempt is
   * returned unchanged (never a second proposal); otherwise valid
   * descriptions mint fresh identities. Null when not eligible or not saved.
   */
  prepareCorrection: (
    clientCommandId: string,
    descriptions: Readonly<Record<number, string>>,
  ) => Promise<QuickSaleCorrectionAttempt | null>
  /**
   * Prove the entire exact attempt is durably saved right now (write through
   * and read back). Required before every send; the proof covers only this
   * exact attempt and is used up by the next issue.
   */
  secureCorrection: (key: string) => Promise<boolean>
  /**
   * Issue the transport request for a durably proven attempt under the
   * current session. Only an issued ticket can later settle the attempt.
   */
  issueCorrection: (key: string) => CorrectionTicket | null
  /**
   * Settle exactly the attempt a ticket was issued for, with a validated
   * server receipt or a classified failure. Returns whether anything changed.
   */
  settleCorrection: (
    ticket: CorrectionTicket,
    outcome: { receipt: unknown } | { failure: "unknown" | "refused" },
  ) => boolean
  /** The attempt for a queued original in its exact owner/device partition. */
  correctionFor: (
    command: LocalOfflineCommand,
  ) => QuickSaleCorrectionAttempt | null
  setHasHydrated: (value: boolean) => void
}

/** An opaque issued request; its proof lives only in memory. */
export type CorrectionTicket = {
  readonly key: string
  readonly request: CorrectionRequest
}
type CorrectionRequest = RouterInputs["offline"]["correctBlankQuickSale"]

type PersistedOfflineCommands = Pick<
  OfflineCommandState,
  "commands" | "corrections" | "deviceId" | "deviceIdsByScope"
>

function recoverySessionLifetime() {
  const session = getSession()
  if (
    !session?.token ||
    session.token.startsWith("local-") ||
    session.token.startsWith("qas_") ||
    !session.profile.id ||
    (session.expiresAt !== undefined &&
      (!Number.isFinite(Date.parse(session.expiresAt)) ||
        Date.parse(session.expiresAt) <= Date.now()))
  )
    return null
  return JSON.stringify([session.token, session.profile, session.accessProfile])
}

/** Ephemeral session proof for issued corrections; never persisted. */
function correctionSessionLifetime() {
  const lifetime = recoverySessionLifetime()
  return lifetime ? JSON.stringify([lifetime, getSessionGeneration()]) : null
}

function canRecoverScope(scope: OfflineCommandScope) {
  const session = getSession()
  return Boolean(
    recoverySessionLifetime() &&
      session?.profile.id === scope.actorUserId &&
      (session.accessProfile?.hasBusinessAccess === false ||
        ownsOfflineCommand(scope, offlineCommandScope(session.profile))),
  )
}

function recoveryPending(command: LocalOfflineCommand) {
  return ["pending", "approval", "review"].includes(command.localStatus)
}

function captureBatch(
  scope: OfflineCommandScope,
  deviceId: string,
  commands: OfflineReplayBatch["commands"],
): OfflineReplayBatch {
  return {
    scope: { ...scope },
    deviceId,
    commands: commands.map((entry) => ({
      clientCommandId: entry.clientCommandId,
      eventVersion: entry.eventVersion,
      payload: JSON.parse(JSON.stringify(entry.payload)),
      dependencyClientIds: [...entry.dependencyClientIds],
      createdAtClient: new Date(entry.createdAtClient),
    })),
  }
}

function localStatus(result: ReplayResult) {
  if (result.status === "APPLIED") return "applied" as const
  if (result.status === "DISCARDED") return "discarded" as const
  if (result.status === "BLOCKED") return "blocked" as const
  if (result.status === "REVIEW_REQUIRED") {
    return result.conflictCode ? ("review" as const) : ("approval" as const)
  }
  return "pending" as const
}

export function getOfflineProvisionalProjection(
  commands: LocalOfflineCommand[],
) {
  const provisional = commands.filter(
    (command) =>
      command.localStatus === "pending" || command.localStatus === "approval",
  )
  return {
    catalogItems: [],
    commercialOrders: provisional.length,
    customers: provisional.filter((command) =>
      Boolean(
        command.payload.customerEmail ||
          command.payload.customerName ||
          command.payload.customerPhone,
      ),
    ).length,
    inventoryOperations: 0,
    serviceOperations: 0,
  }
}

export function activeBusinessOfflineCommands(
  commands: LocalOfflineCommand[],
  businessId: string | null | undefined,
) {
  const scope = offlineCommandScope(getSession()?.profile)
  if (!scope || scope.businessId !== businessId) return []
  const deviceId =
    useOfflineCommandStore.getState().deviceIdsByScope[
      offlineCommandScopeKey(scope)
    ]
  if (!deviceId) return []
  return scopedOfflineCommands(commands, scope).filter(
    (command) => command.deviceId === deviceId,
  )
}

export const useOfflineCommandStore = create<OfflineCommandState>()(
  persist<OfflineCommandState, [], [], PersistedOfflineCommands>(
    (set, get) => {
      const recoveryBatches = new WeakMap<
        OfflineReplayBatch,
        {
          lifetime: string
          original: OfflineReplayBatch
        }
      >()
      function bindRecovery(batch: OfflineReplayBatch) {
        const lifetime = recoverySessionLifetime()
        if (lifetime)
          recoveryBatches.set(batch, {
            lifetime,
            original: captureBatch(batch.scope, batch.deviceId, batch.commands),
          })
        return batch
      }
      function deviceForScope(scope: OfflineCommandScope) {
        const key = offlineCommandScopeKey(scope)
        const existing = get().deviceIdsByScope[key]
        if (existing) return existing
        const deviceId = `device-${Crypto.randomUUID()}`
        set((state) => ({
          deviceIdsByScope: { ...state.deviceIdsByScope, [key]: deviceId },
        }))
        return deviceId
      }
      function applyResults(
        results: ReplayResult[],
        batch?: OfflineReplayBatch,
      ) {
        const current = offlineCommandScope(getSession()?.profile)
        if (
          !batch ||
          !ownsOfflineCommand(batch.scope, current) ||
          get().deviceIdsByScope[offlineCommandScopeKey(batch.scope)] !==
            batch.deviceId
        )
          return
        set((state) => ({
          commands: state.commands.map((command) => {
            if (
              command.recoveryHeld ||
              correctionOwns(command) ||
              !ownsOfflineCommand(command, batch.scope) ||
              command.deviceId !== batch.deviceId
            )
              return command
            const submittedMatches = batch.commands.filter(
              (entry) => entry.clientCommandId === command.clientCommandId,
            )
            const submitted =
              submittedMatches.length === 1 ? submittedMatches[0] : null
            if (
              !submitted ||
              !sameOfflineCommandFacts(submitted, {
                clientCommandId: command.clientCommandId,
                createdAtClient: command.createdAtClient,
                dependencyClientIds: command.dependencyClientIds,
                eventVersion: command.eventVersion,
                payload: command.payload,
              })
            )
              return command
            const result = results.find(
              (entry) => entry.clientCommandId === command.clientCommandId,
            )
            if (
              !result ||
              typeof result.payload !== "object" ||
              !result.payload ||
              Array.isArray(result.payload)
            )
              return command
            const { actorUserId, ...payload } = result.payload
            if (
              actorUserId !== batch.scope.actorUserId ||
              !sameOfflineCommandFacts(payload, command.payload)
            )
              return command
            return {
              ...command,
              authoritativeState: result.authoritativeState,
              conflictCode: result.conflictCode,
              conflictMessage: result.conflictMessage,
              localStatus: localStatus(result),
              result: result.result,
            }
          }),
        }))
      }
      const correctionTickets = new WeakMap<
        CorrectionTicket,
        { lifetime: string; attempt: QuickSaleCorrectionAttempt }
      >()
      /** The unique original in its exact owner/device partition, or null. */
      function correctionOriginal(attempt: QuickSaleCorrectionAttempt) {
        const matches = get().commands.filter(
          (command) =>
            ownsOfflineCommand(command, attempt) &&
            command.deviceId === attempt.deviceId &&
            command.clientCommandId === attempt.original.clientCommandId,
        )
        const original = matches.length === 1 ? matches[0] : null
        if (
          !original ||
          !sameOfflineCommandFacts(attempt.original, {
            clientCommandId: original.clientCommandId,
            createdAtClient: original.createdAtClient,
            dependencyClientIds: original.dependencyClientIds,
            eventVersion: original.eventVersion,
            payload: original.payload,
          })
        )
          return null
        return original
      }
      /** Retired, terminal or management-held originals can't be settled. */
      function correctionClosed(original: LocalOfflineCommand) {
        return Boolean(
          original.recoveryHeld ||
            original.correctedBy ||
            original.localStatus === "applied" ||
            original.localStatus === "discarded",
        )
      }
      function correctionOf(command: LocalOfflineCommand) {
        if (
          !command.actorUserId ||
          !command.storeId ||
          !command.deviceId ||
          !command.businessId
        )
          return null
        return (
          get().corrections?.[
            correctionKey({
              actorUserId: command.actorUserId,
              businessId: command.businessId,
              storeId: command.storeId,
              deviceId: command.deviceId,
              clientCommandId: command.clientCommandId,
            })
          ] ?? null
        )
      }
      /**
       * A corrected original, or one with a correction in progress, belongs to
       * the correction path: ordinary retry, discard, replay and replay
       * results never touch it. A refused fix leaves the original as it was.
       */
      function correctionOwns(command: LocalOfflineCommand) {
        if (command.correctedBy) return true
        const attempt = correctionOf(command)
        return Boolean(attempt && attempt.state !== "refused")
      }
      /** Proven-durable attempts, by key; consumed when a ticket is issued. */
      const durableCorrections = new Map<string, QuickSaleCorrectionAttempt>()
      function proposal(attempt: QuickSaleCorrectionAttempt) {
        return {
          key: attempt.key,
          actorUserId: attempt.actorUserId,
          businessId: attempt.businessId,
          storeId: attempt.storeId,
          deviceId: attempt.deviceId,
          original: attempt.original,
          replacementClientCommandId: attempt.replacementClientCommandId,
          replacementClientPaymentId:
            attempt.replacementClientPaymentId ?? null,
          descriptions: attempt.descriptions,
        }
      }
      async function correctionSaved(
        key: string,
        attempt: QuickSaleCorrectionAttempt,
      ) {
        const storage = useOfflineCommandStore.persist.getOptions().storage
        if (!storage) return false
        try {
          const state = get()
          await storage.setItem("ewatrade-mobile-offline-commands", {
            state: {
              commands: state.commands,
              corrections: state.corrections,
              deviceId: state.deviceId,
              deviceIdsByScope: state.deviceIdsByScope,
            },
            version: 3,
          })
          const saved = await storage.getItem(
            "ewatrade-mobile-offline-commands",
          )
          const stored = (
            saved?.state as Partial<PersistedOfflineCommands> | undefined
          )?.corrections?.[key]
          // The whole proposal must read back exactly: owner, device, the
          // immutable original, both fresh identities and the descriptions.
          return Boolean(
            stored &&
              sameOfflineCommandFacts(proposal(stored), proposal(attempt)),
          )
        } catch {
          return false
        }
      }
      return {
        commands: [],
        corrections: {},
        deviceId: `device-${Crypto.randomUUID()}`,
        deviceIdsByScope: {},
        hasHydrated: false,
        applyReplayResults: applyResults,
        applyScopedReplayResults: applyResults,
        applyScopedRecoveryResults: (results, batch) => {
          const issued = recoveryBatches.get(batch)
          if (
            !batch ||
            !Array.isArray(results) ||
            !canRecoverScope(batch.scope) ||
            !issued ||
            issued.lifetime !== recoverySessionLifetime() ||
            !sameOfflineCommandFacts(issued.original, batch) ||
            get().deviceIdsByScope[offlineCommandScopeKey(batch.scope)] !==
              batch.deviceId
          )
            return
          set((state) => ({
            commands: state.commands.map((command) => {
              if (
                !ownsOfflineCommand(command, batch.scope) ||
                command.deviceId !== batch.deviceId ||
                command.localStatus === "applied" ||
                command.localStatus === "discarded"
              )
                return command
              if (
                state.commands.filter(
                  (candidate) =>
                    ownsOfflineCommand(candidate, batch.scope) &&
                    candidate.deviceId === batch.deviceId &&
                    candidate.clientCommandId === command.clientCommandId,
                ).length !== 1
              )
                return command
              const submittedMatches = batch.commands.filter(
                (entry) => entry.clientCommandId === command.clientCommandId,
              )
              const submitted =
                submittedMatches.length === 1 ? submittedMatches[0] : null
              const matches = results.filter(
                (entry) =>
                  entry &&
                  typeof entry === "object" &&
                  !Array.isArray(entry) &&
                  entry.clientCommandId === command.clientCommandId,
              )
              const result = matches.length === 1 ? matches[0] : null
              if (
                !submitted ||
                !result ||
                !["held", "approved", "rejected"].includes(result.status) ||
                !sameOfflineCommandFacts(submitted, {
                  clientCommandId: command.clientCommandId,
                  createdAtClient: command.createdAtClient,
                  dependencyClientIds: command.dependencyClientIds,
                  eventVersion: command.eventVersion,
                  payload: command.payload,
                })
              )
                return command
              return {
                ...command,
                recoveryHeld: true,
                localStatus:
                  result.status === "approved"
                    ? "applied"
                    : result.status === "rejected"
                      ? "discarded"
                      : "approval",
                // A status acknowledgement never becomes a canonical receipt.
                result: undefined,
                authoritativeState: undefined,
                conflictCode: null,
                conflictMessage: null,
              }
            }),
          }))
        },
        recoveryPartitions: () => {
          if (!get().hasHydrated || !recoverySessionLifetime()) return []
          const partitions = new Map<string, OfflineRecoveryPartition>()
          for (const command of get().commands) {
            const scope = offlineCommandScope({
              id: command.actorUserId,
              businessId: command.businessId,
              storeId: command.storeId,
            })
            if (!scope || !canRecoverScope(scope) || !recoveryPending(command))
              continue
            const key = offlineCommandScopeKey(scope)
            const deviceId = get().deviceIdsByScope[key]
            if (!deviceId || command.deviceId !== deviceId) continue
            const previous = partitions.get(key)
            partitions.set(key, {
              scope,
              deviceId,
              commandCount: (previous?.commandCount ?? 0) + 1,
            })
          }
          return [...partitions.values()].filter(({ scope, deviceId }) => {
            const originals = get().commands.filter(
              (command) =>
                ownsOfflineCommand(command, scope) &&
                command.deviceId === deviceId,
            )
            return (
              new Set(originals.map((command) => command.clientCommandId))
                .size === originals.length
            )
          })
        },
        prepareRecovery: (scope) => {
          const partition = get()
            .recoveryPartitions()
            .find((entry) => ownsOfflineCommand(entry.scope, scope))
          if (!partition) return null
          const commands = get().commands.filter(
            (command) =>
              ownsOfflineCommand(command, partition.scope) &&
              command.deviceId === partition.deviceId &&
              recoveryPending(command),
          )
          return bindRecovery(
            captureBatch(partition.scope, partition.deviceId, commands),
          )
        },
        prepareReplay: (mode = "ordinary") => {
          const scope = offlineCommandScope(getSession()?.profile)
          if (!scope) return null
          const deviceId = deviceForScope(scope)
          const commands = pendingOfflineCommands(
            get(),
            scope.businessId,
            mode === "recovery",
          ).filter((entry) =>
            get().commands.some(
              (command) =>
                command.clientCommandId === entry.clientCommandId &&
                ownsOfflineCommand(command, scope) &&
                command.deviceId === deviceId &&
                !correctionOwns(command),
            ),
          )
          const batch = captureBatch(scope, deviceId, commands)
          return mode === "recovery" ? bindRecovery(batch) : batch
        },
        discardCommand: (clientCommandId) =>
          set((state) => ({
            commands: state.commands.map((command) =>
              command.clientCommandId === clientCommandId &&
              !command.recoveryHeld &&
              !correctionOwns(command) &&
              ownsOfflineCommand(
                command,
                offlineCommandScope(getSession()?.profile),
              ) &&
              activeBusinessOfflineCommands([command], command.businessId)
                .length === 1
                ? { ...command, localStatus: "discarded" }
                : command,
            ),
          })),
        queueCommand: (input) => {
          const scope = offlineCommandScope(getSession()?.profile)
          if (!scope) {
            throw new Error(
              "Offline work requires the original account, business and Store.",
            )
          }
          const clientCommandId =
            input.clientCommandId ?? `command-${Crypto.randomUUID()}`
          const deviceId = deviceForScope(scope)
          set((state) => ({
            commands: [
              ...state.commands,
              {
                ...input,
                ...scope,
                deviceId,
                payload: JSON.parse(JSON.stringify(input.payload)),
                dependencyClientIds: [...(input.dependencyClientIds ?? [])],
                clientCommandId,
                createdAtClient: input.createdAtClient
                  ? new Date(input.createdAtClient.getTime())
                  : new Date(),
                localStatus: "pending",
              },
            ],
          }))
          return clientCommandId
        },
        retryCommand: (clientCommandId) =>
          set((state) => ({
            commands: state.commands.map((command) =>
              command.clientCommandId === clientCommandId &&
              !command.recoveryHeld &&
              !correctionOwns(command) &&
              ownsOfflineCommand(
                command,
                offlineCommandScope(getSession()?.profile),
              ) &&
              activeBusinessOfflineCommands([command], command.businessId)
                .length === 1
                ? {
                    ...command,
                    authoritativeState: undefined,
                    conflictCode: null,
                    conflictMessage: null,
                    localStatus: "pending",
                  }
                : command,
            ),
          })),
        prepareCorrection: async (clientCommandId, values) => {
          const scope = offlineCommandScope(getSession()?.profile)
          if (!scope || !get().hasHydrated) return null
          const deviceId = get().deviceIdsByScope[offlineCommandScopeKey(scope)]
          if (!deviceId) return null
          const partition = get().commands.filter(
            (command) =>
              ownsOfflineCommand(command, scope) &&
              command.deviceId === deviceId,
          )
          const matches = partition.filter(
            (command) => command.clientCommandId === clientCommandId,
          )
          const command = matches.length === 1 ? matches[0] : null
          if (!command) return null
          const key = correctionKey({ ...scope, deviceId, clientCommandId })
          let attempt = get().corrections?.[key] ?? null
          if (!attempt) {
            if (correctionAvailability(command, partition) !== "eligible")
              return null
            const descriptions: CorrectionDescription[] | null =
              correctionDescriptions(
                blankQuickSaleLines(command.payload),
                values,
              )
            if (!descriptions) return null
            const fresh: QuickSaleCorrectionAttempt = {
              key,
              ...scope,
              deviceId,
              original: {
                clientCommandId: command.clientCommandId,
                eventVersion: command.eventVersion,
                payload: JSON.parse(JSON.stringify(command.payload)),
                dependencyClientIds: [...command.dependencyClientIds],
                createdAtClient: new Date(command.createdAtClient),
              },
              replacementClientCommandId: `command-${Crypto.randomUUID()}`,
              ...(command.payload.initialPayment
                ? {
                    replacementClientPaymentId: `payment-${Crypto.randomUUID()}`,
                  }
                : {}),
              descriptions,
              state: "ready",
            }
            set((state) => ({
              corrections: { ...state.corrections, [key]: fresh },
            }))
            attempt = fresh
          }
          // Durable before anything is sent: write through and read it back.
          // Nothing left to send (refused, invalid or settled): return it as
          // it is; only sendable attempts need a durable proof here.
          if (!["ready", "sent", "unknown"].includes(attempt.state))
            return attempt
          if (!(await get().secureCorrection(key))) return null
          return get().corrections?.[key] === attempt ? attempt : null
        },
        secureCorrection: async (key) => {
          durableCorrections.delete(key)
          const attempt = get().corrections?.[key]
          if (!attempt || !["ready", "sent", "unknown"].includes(attempt.state))
            return false
          if (!(await correctionSaved(key, attempt))) return false
          // Proof only for the exact attempt that was read back.
          if (get().corrections?.[key] !== attempt) return false
          durableCorrections.set(key, attempt)
          return true
        },
        issueCorrection: (key) => {
          const attempt = get().corrections?.[key]
          const lifetime = correctionSessionLifetime()
          const scope = offlineCommandScope(getSession()?.profile)
          if (
            !attempt ||
            !lifetime ||
            !ownsOfflineCommand(attempt, scope) ||
            !scope ||
            get().deviceIdsByScope[offlineCommandScopeKey(scope)] !==
              attempt.deviceId ||
            !["ready", "sent", "unknown"].includes(attempt.state)
          )
            return null
          const original = correctionOriginal(attempt)
          if (!original || correctionClosed(original)) return null
          // Never sent without a fresh proof that exactly this is saved.
          if (durableCorrections.get(key) !== attempt) return null
          durableCorrections.delete(key)
          const ticket: CorrectionTicket = Object.freeze({
            key,
            request: {
              deviceId: attempt.deviceId,
              storeId: attempt.storeId,
              envelope: {
                clientCommandId: attempt.original.clientCommandId,
                eventVersion: attempt.original.eventVersion,
                payload: JSON.parse(JSON.stringify(attempt.original.payload)),
                dependencyClientIds: [...attempt.original.dependencyClientIds],
                createdAtClient: new Date(attempt.original.createdAtClient),
              },
              replacementClientCommandId: attempt.replacementClientCommandId,
              ...(attempt.replacementClientPaymentId
                ? {
                    replacementClientPaymentId:
                      attempt.replacementClientPaymentId,
                  }
                : {}),
              descriptions: attempt.descriptions.map((entry) => ({
                ...entry,
              })),
            } as CorrectionRequest,
          })
          correctionTickets.set(ticket, { lifetime, attempt })
          if (attempt.state !== "sent")
            set((state) => ({
              corrections: {
                ...state.corrections,
                [key]: { ...attempt, state: "sent" },
              },
            }))
          return ticket
        },
        settleCorrection: (ticket, outcome) => {
          const issued = correctionTickets.get(ticket)
          const attempt = issued ? get().corrections?.[ticket.key] : null
          if (
            !issued ||
            !attempt ||
            // The same live session that issued it; a late receipt after a
            // sign-out or account change stays unapplied (resend later).
            issued.lifetime !== correctionSessionLifetime() ||
            attempt.replacementClientCommandId !==
              issued.attempt.replacementClientCommandId ||
            attempt.state !== "sent"
          )
            return false
          correctionTickets.delete(ticket)
          if ("failure" in outcome) {
            // Uncertainty is monotonic: once a send may have arrived, a later
            // refusal can't prove it didn't, so it stays unknown.
            const everUncertain = issued.attempt.state !== "ready"
            set((state) => ({
              corrections: {
                ...state.corrections,
                [ticket.key]: {
                  ...attempt,
                  state:
                    outcome.failure === "refused" && !everUncertain
                      ? "refused"
                      : "unknown",
                },
              },
            }))
            return true
          }
          const receipt = validateCorrectionReceipt(attempt, outcome.receipt)
          const original = correctionOriginal(attempt)
          if (!receipt || !original || correctionClosed(original)) {
            // An answer that doesn't match can't be trusted either way: keep
            // the same fix and check again later.
            set((state) => ({
              corrections: {
                ...state.corrections,
                [ticket.key]: { ...attempt, state: "unknown" },
              },
            }))
            return false
          }
          if (receipt.outcome === "already_applied") {
            set((state) => ({
              commands: state.commands.map((command) =>
                command === original
                  ? {
                      ...command,
                      localStatus: "applied",
                      result: receipt.result,
                      authoritativeState: undefined,
                      conflictCode: null,
                      conflictMessage: null,
                    }
                  : command,
              ),
              corrections: {
                ...state.corrections,
                [ticket.key]: { ...attempt, state: "already_applied" },
              },
            }))
            return true
          }
          // The fresh identity must not already exist anywhere locally.
          if (
            get().commands.some(
              (command) =>
                command.clientCommandId === attempt.replacementClientCommandId,
            )
          ) {
            set((state) => ({
              corrections: {
                ...state.corrections,
                [ticket.key]: { ...attempt, state: "unknown" },
              },
            }))
            return false
          }
          const installed: LocalOfflineCommand = {
            clientCommandId: receipt.envelope.clientCommandId,
            eventVersion: receipt.envelope.eventVersion,
            payload: JSON.parse(JSON.stringify(receipt.envelope.payload)),
            dependencyClientIds: [...receipt.envelope.dependencyClientIds],
            createdAtClient: new Date(receipt.envelope.createdAtClient),
            actorUserId: attempt.actorUserId,
            businessId: attempt.businessId,
            storeId: attempt.storeId,
            deviceId: attempt.deviceId,
            displayTotal: original.displayTotal,
            localStatus: localStatusForCorrection(
              receipt.status,
              receipt.recoveryHeld,
            ),
            ...(receipt.recoveryHeld ? { recoveryHeld: true } : {}),
            result: receipt.result ?? undefined,
            conflictCode: null,
            conflictMessage: null,
          }
          set((state) => ({
            commands: [
              ...state.commands.map((command) =>
                command === original
                  ? {
                      ...command,
                      localStatus: "discarded" as const,
                      correctedBy: attempt.replacementClientCommandId,
                      result: undefined,
                      authoritativeState: undefined,
                      conflictCode: null,
                      conflictMessage: null,
                    }
                  : command,
              ),
              installed,
            ],
            corrections: {
              ...state.corrections,
              [ticket.key]: { ...attempt, state: "replaced" },
            },
          }))
          return true
        },
        correctionFor: (command) => correctionOf(command),
        setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      }
    },
    {
      // This is an intentional clean schema boundary. A version mismatch starts
      // with an empty command queue; events from an incompatible schema are never read.
      migrate: () => ({
        commands: [],
        corrections: {},
        deviceId: `device-${Crypto.randomUUID()}`,
        deviceIdsByScope: {},
        hasHydrated: false,
      }),
      merge: (persisted, current) => {
        // Nothing is saved on a fresh device: zustand passes undefined.
        const saved = (persisted ?? {}) as Partial<PersistedOfflineCommands>
        return {
          ...current,
          ...saved,
          deviceIdsByScope: saved.deviceIdsByScope ?? {},
          // Untrusted on restore: well-formed attempts keep their exact
          // identities (sent → unknown); malformed ones become unsendable.
          corrections: Object.fromEntries(
            Object.entries(
              saved.corrections && typeof saved.corrections === "object"
                ? saved.corrections
                : {},
            ).flatMap(([key, attempt]) => {
              const restored = restoreCorrectionAttempt(key, attempt)
              return restored ? [[key, restored]] : []
            }),
          ),
          commands: (saved.commands ?? []).map((command) => ({
            ...command,
            createdAtClient: new Date(
              command.createdAtClient as unknown as string | Date,
            ),
          })),
          hasHydrated: current.hasHydrated,
        }
      },
      name: "ewatrade-mobile-offline-commands",
      // A failed restore passes no state; still mark the queue ready so
      // screens waiting on it (Sync & offline) never stay on "Checking".
      onRehydrateStorage: (initial) => (state, error) => {
        if (error && __DEV__)
          console.warn("Offline command queue was not restored", error)
        ;(state ?? initial).setHasHydrated(true)
        void zustandStorage.removeItem("ewatrade-mobile-retail-ops")
      },
      partialize: (state) => ({
        commands: state.commands,
        corrections: state.corrections,
        deviceId: state.deviceId,
        deviceIdsByScope: state.deviceIdsByScope,
      }),
      storage: createJSONStorage(() => zustandStorage),
      version: 3,
    },
  ),
)

export function pendingOfflineCommands(
  state: OfflineCommandState,
  businessId: string | null | undefined,
  includeRecovery = false,
) {
  return activeBusinessOfflineCommands(state.commands, businessId)
    .filter(
      (command) =>
        (includeRecovery || !command.recoveryHeld) &&
        (command.localStatus === "pending" ||
          command.localStatus === "approval" ||
          command.localStatus === "review"),
    )
    .map((command) => ({
      clientCommandId: command.clientCommandId,
      createdAtClient: command.createdAtClient,
      dependencyClientIds: command.dependencyClientIds,
      eventVersion: command.eventVersion,
      payload: command.payload,
    }))
}
