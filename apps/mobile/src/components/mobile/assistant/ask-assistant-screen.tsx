import { useLocalSearchParams } from "expo-router"
import { AskAssistantLive } from "./ask-assistant-live"
import { AskAssistantQa } from "./ask-assistant-qa"
export function AskAssistantScreen() {
  const { qaState, view } = useLocalSearchParams<{
    qaState?: string
    view?: string
  }>()
  if (
    __DEV__ &&
    qaState &&
    [
      "normal",
      "loading",
      "offline",
      "allowance",
      "outage",
      "manager",
      "rep",
      "noaccess",
    ].includes(qaState)
  )
    return <AskAssistantQa state={qaState} initialView={view} />
  return <AskAssistantLive />
}
