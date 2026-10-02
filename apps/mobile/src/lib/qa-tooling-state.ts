type ToolingFacts = {
  expiresAt: Date
  principalId: string
  storeId: string
  tenantId: string
}

export function currentQaToolingFacts<T extends ToolingFacts>(input: {
  active: boolean
  businessId: string | undefined
  data: T | null | undefined
  failed: boolean
  fetching: boolean
  now: number
  sessionMatches: boolean
  storeId: string | undefined
  userId: string | undefined
}) {
  const data = input.data
  if (
    !input.active ||
    !input.sessionMatches ||
    input.failed ||
    input.fetching ||
    !data ||
    data.principalId !== input.userId ||
    data.tenantId !== input.businessId ||
    (input.storeId && data.storeId !== input.storeId) ||
    data.expiresAt.getTime() <= input.now
  )
    return null
  return data
}
