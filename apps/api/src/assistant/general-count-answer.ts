import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"

export function generalCountAnswer(input: {
  title: string
  count: number
  scope: string
  detail: string
}): GeneralAnswer {
  if (!Number.isSafeInteger(input.count) || input.count < 0)
    throw new Error("Exact count unavailable")
  return {
    id: `count_${crypto.randomUUID()}`,
    title: input.title,
    value: String(input.count),
    scope: input.scope.slice(0, 500),
    detail: input.detail,
    asOf: new Date().toISOString(),
  }
}
