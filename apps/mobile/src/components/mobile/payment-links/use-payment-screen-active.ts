import { useIsFocused } from "@react-navigation/native"
import { useEffect, useState } from "react"
import { AppState } from "react-native"

/** Payment reads run only while their route is visible in the foreground. */
export function usePaymentScreenActive() {
  const isFocused = useIsFocused()
  const [appState, setAppState] = useState(AppState.currentState)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState)
    setAppState(AppState.currentState)
    return () => subscription.remove()
  }, [])
  return isFocused && appState === "active"
}
