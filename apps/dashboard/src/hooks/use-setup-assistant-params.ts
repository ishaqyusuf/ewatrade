"use client"

import { useQueryStates } from "nuqs"
import { parseAsStringLiteral } from "nuqs/server"

/** `?setup=assistant` opens the Setup Assistant modal over the Overview. */
export function useSetupAssistantParams() {
  const [params, setParams] = useQueryStates({
    setup: parseAsStringLiteral(["assistant"]),
  })
  return {
    setupOpen: params.setup === "assistant",
    setSetupOpen: (open: boolean) =>
      setParams(
        { setup: open ? "assistant" : null },
        { history: "replace", scroll: false },
      ),
  }
}
