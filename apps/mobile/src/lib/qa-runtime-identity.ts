export function qaRuntimeIdentity(input: {
  enabled: boolean
  embedded: boolean
  emergency: boolean
  updateId: string | null
  build: string | null
}) {
  if (!input.enabled) return "QA runtime development"
  if (input.emergency) return "QA runtime recovery"
  const runtime = input.embedded ? "embedded" : input.updateId
  return `QA runtime ${runtime || "unknown"} · build ${input.build || "unknown"}`
}
