import { normalizeQaDomain } from "./qa-accelerator"

export type QaFixtureContext = {
  currencyCode: string
  domain: string
  invocationId: string
  now: Date
  seed: string
  storeId: string
  tenantId: string
  timezone: string
}

function hashSeed(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pick<T>(values: readonly T[], seed: number, offset: number) {
  return values[(seed + offset) % values.length] as T
}

function slugPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32)
}

export function createQaFixtureContext(
  input: Omit<QaFixtureContext, "domain" | "now"> & {
    domain: string
    now?: Date
  },
): QaFixtureContext {
  return {
    ...input,
    domain: normalizeQaDomain(input.domain),
    now: input.now ?? new Date(),
  }
}

function fixtureName(
  context: QaFixtureContext,
  input: { formId: string; sequence?: number },
) {
  const seed = hashSeed(
    `${context.seed}:${context.invocationId}:${input.formId}:${input.sequence ?? 1}`,
  )
  const firstName = pick(
    ["Ada", "Bola", "Chidi", "Damilola", "Ese", "Femi"],
    seed,
    0,
  )
  const lastName = pick(
    ["Adebayo", "Eze", "Ibrahim", "Nwosu", "Okafor", "Williams"],
    seed,
    3,
  )
  return { firstName, lastName, seed }
}

/**
 * A readable QA address on the QA domain, such as chidi.williams.7k2@…: the
 * fixture's own name plus three letters or digits so repeat fills differ.
 * The domain alone marks it as QA.
 */
export function createQaFixtureEmail(
  context: QaFixtureContext,
  input: { formId: string; sequence?: number },
) {
  const { firstName, lastName } = fixtureName(context, input)
  const suffix = (
    hashSeed(`${context.invocationId}:${input.formId}:${input.sequence ?? 1}`) %
    36 ** 3
  )
    .toString(36)
    .padStart(3, "0")
  return `${firstName}.${lastName}.${suffix}@${context.domain}`.toLowerCase()
}

export function createQaFixtureIdentity(
  context: QaFixtureContext,
  input: { formId: string; sequence?: number },
) {
  const { firstName, lastName, seed } = fixtureName(context, input)
  const suffix = (seed % 100).toString().padStart(2, "0")
  return {
    addressLine1: `QA ONLY — ${10 + (seed % 80)} Test Fixture Lane`,
    city: "Test City",
    email: createQaFixtureEmail(context, input),
    firstName,
    fullName: `${firstName} ${lastName} (QA)`,
    lastName,
    note: `QA fixture ${context.invocationId}; safe to remove after testing.`,
    phone: `+120255501${suffix}`,
  }
}

export function createQaFixtureBusiness(
  context: QaFixtureContext,
  input: { formId: string; sequence?: number },
) {
  const sequence = Math.max(1, Math.trunc(input.sequence ?? 1))
  const identity = createQaFixtureIdentity(context, input)
  const run = slugPart(context.invocationId).slice(-8) || "run"
  return {
    addressLine1: identity.addressLine1,
    businessName: `QA Market ${run.toUpperCase()} ${sequence}`,
    city: identity.city,
    currencyCode: context.currencyCode,
    email: identity.email,
    phone: identity.phone,
    timezone: context.timezone,
  }
}
