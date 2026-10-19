"use client"

import { parseAsString, useQueryStates } from "nuqs"
import { parseAsStringLiteral } from "nuqs/server"

/** `?setup=assistant` opens the Setup Assistant modal over the Overview. */
export function useSetupAssistantParams() {
  const [params, setParams] = useQueryStates({
    setup: parseAsStringLiteral(["assistant"]),
    setupConversation: parseAsString,
  })
  return {
    setupOpen: params.setup === "assistant",
    expectedConversationId: params.setupConversation,
    setSetupOpen: (open: boolean) =>
      setParams(
        {
          setup: open ? "assistant" : null,
          ...(!open ? { setupConversation: null } : {}),
        },
        { history: "replace", scroll: false },
      ),
  }
}
