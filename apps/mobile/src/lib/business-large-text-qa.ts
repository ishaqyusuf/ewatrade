export const BUSINESS_LARGE_TEXT_QA_STATES = [
  "b001",
  "b002",
  "b003",
  "b004",
  "b005",
  "b006",
  "b007",
  "b008",
  "b009",
  "b010",
  "b011",
  "b012",
  "b013",
  "b014",
  "b015",
  "b016",
  "b017",
  "b018",
  "b019",
  "b020",
  "b021",
  "b022",
  "b023",
  "b024",
  "b025",
  "b026",
  "b027",
  "b028",
  "b029",
  "b030",
  "b031",
  "b032",
] as const

export type BusinessLargeTextQaState =
  (typeof BUSINESS_LARGE_TEXT_QA_STATES)[number]

export function parseBusinessLargeTextQaState(input: {
  development: boolean
  qaState?: string | string[] | null
}): BusinessLargeTextQaState | null {
  if (!input.development || Array.isArray(input.qaState)) return null
  return BUSINESS_LARGE_TEXT_QA_STATES.includes(
    input.qaState as BusinessLargeTextQaState,
  )
    ? (input.qaState as BusinessLargeTextQaState)
    : null
}

export function resolveBusinessLargeTextQaPath(
  path: string,
  development: boolean,
) {
  if (!development) return null

  try {
    const url = new URL(path)
    const qaState = parseBusinessLargeTextQaState({
      development,
      qaState: url.searchParams.get("qaState"),
    })
    if (
      !qaState ||
      url.protocol !== "ewatrade-dev:" ||
      url.hostname !== "business-large-text"
    ) {
      return null
    }

    const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light"
    return `/design-system/business-large-text?qaState=${qaState}&theme=${theme}`
  } catch {
    return null
  }
}
