import { z } from "zod"

const age = z.number().int().min(0).max(18).nullable()
const rawObservation = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("disabled") }),
  z.object({ kind: z.literal("unsupported") }),
  z.object({ kind: z.literal("unknown") }),
  z.object({ kind: z.literal("not-shared") }),
  z.object({ kind: z.literal("verification-required") }),
  z.object({ kind: z.literal("unavailable") }),
  z.object({
    kind: z.literal("shared"),
    lower: age,
    upper: age,
    source: z.enum([
      "self-declared",
      "parent-managed",
      "assessed",
      "checked",
      "unknown",
    ]),
    change: z.enum([
      "approved",
      "pending",
      "declined",
      "not-provided",
      "unknown",
    ]),
  }),
])
export type PlayAgeObservation = z.infer<typeof rawObservation>

/** Data validation is not server attestation, identity verification or consent. */
export function normalizePlayAgeObservation(
  input: unknown,
): PlayAgeObservation {
  const parsed = rawObservation.safeParse(input)
  if (!parsed.success) return { kind: "unavailable" }
  const value = parsed.data
  if (
    value.kind === "shared" &&
    ((value.lower === null && value.upper !== null) ||
      (value.lower !== null &&
        value.upper !== null &&
        value.lower > value.upper))
  )
    return { kind: "unavailable" }
  // z.object deliberately strips all unrelated fields, including identifiers.
  return value
}

export type LocalAgeHint =
  | "existing-policy"
  | "resolve-in-play"
  | "under-13"
  | "restrict-free-form"
  | "approval-review"

/** Restrictive local hints only. Never grants adult/server/account privileges. */
export function localPlayAgeHint(
  observation: PlayAgeObservation,
): LocalAgeHint {
  if (observation.kind === "verification-required") return "resolve-in-play"
  if (observation.kind !== "shared") return "existing-policy"
  if (observation.upper !== null && observation.upper < 13) return "under-13"
  if (observation.change === "pending" || observation.change === "declined")
    return "approval-review"
  if (observation.upper !== null && observation.upper < 18)
    return "restrict-free-form"
  // Adult, null or cross-threshold bounds confer no new privilege. The existing
  // authenticated declaration/feature policy still decides access.
  return "existing-policy"
}

export type NativePlayAgeProvider = {
  requestAccess: () => Promise<unknown>
  readShared: () => Promise<unknown>
}

/** The real two-stage caller; optional refusal never invokes the data query. */
export async function requestPlayAgeObservation(
  native: NativePlayAgeProvider,
  isCurrent: () => boolean,
): Promise<PlayAgeObservation> {
  if (!isCurrent()) return { kind: "unavailable" }
  const access = await native.requestAccess()
  if (!isCurrent()) return { kind: "unavailable" }
  const shared = z
    .object({ kind: z.literal("access-shared") })
    .safeParse(access)
  if (shared.success)
    return normalizePlayAgeObservation(await native.readShared())
  const observation = normalizePlayAgeObservation(access)
  // A data payload from the access phase cannot skip the actual query protocol.
  return observation.kind === "shared" ? { kind: "unavailable" } : observation
}

export type PlayAgeRead = {
  observation: PlayAgeObservation
  provenance: "unattested-client"
  observedAt: number
  contextRevision: number
  stale: boolean
}

/** The caller must invalidate on session/install/context changes. No persistence. */
export function createPlayAgeReader(input: {
  observe: (isCurrent: () => boolean) => Promise<unknown>
  contextRevision: () => number
  now?: () => number
}) {
  const now = input.now ?? Date.now
  let generation = 0
  let active: {
    revision: number
    generation: number
    promise: Promise<PlayAgeRead>
  } | null = null
  const envelope = (
    observation: PlayAgeObservation,
    revision: number,
    stale = false,
  ): PlayAgeRead => ({
    observation,
    provenance: "unattested-client",
    observedAt: now(),
    contextRevision: revision,
    stale,
  })
  return {
    invalidate() {
      generation++
    },
    read(): Promise<PlayAgeRead> {
      const revision = input.contextRevision()
      const startedGeneration = generation
      if (active) {
        if (active.revision === revision && active.generation === generation)
          return active.promise
        // Never overlap another system sharing prompt while the old one settles.
        return Promise.resolve(
          envelope({ kind: "unavailable" }, revision, true),
        )
      }
      const promise = Promise.resolve()
        .then(() =>
          input.observe(
            () =>
              revision === input.contextRevision() &&
              startedGeneration === generation,
          ),
        )
        .then(normalizePlayAgeObservation)
        .catch(() => ({
          kind: "unavailable" as const,
        }))
        .then((observation) => {
          const stale =
            revision !== input.contextRevision() ||
            startedGeneration !== generation
          return envelope(
            stale ? { kind: "unavailable" } : observation,
            revision,
            stale,
          )
        })
        .finally(() => {
          if (active?.promise === promise) active = null
        })
      active = { revision, generation: startedGeneration, promise }
      return promise
    },
  }
}
