import type { QaFixtureContext } from "@ewatrade/utils/qa-fixtures"

export function createReadableQaEmail(
  context: Pick<QaFixtureContext, "domain" | "invocationId">,
  identity: { firstName: string; lastName: string },
  sequence = 1,
) {
  const name =
    identity.firstName
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .slice(0, 16) || "tester"
  let run = 0
  for (const character of context.invocationId) {
    run = (Math.imul(run, 31) + character.charCodeAt(0)) >>> 0
  }
  const suffix = ((run + Math.max(1, Math.trunc(sequence))) % 36 ** 3)
    .toString(36)
    .padStart(3, "0")
  return `${name}${suffix}@${context.domain}`
}
