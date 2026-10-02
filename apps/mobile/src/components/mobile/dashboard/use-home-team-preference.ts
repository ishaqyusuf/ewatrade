import AsyncStorage from "@react-native-async-storage/async-storage"
import { useEffect, useRef, useState } from "react"
import { parseHomeTeamDismissal } from "./home-journey-model"

type Preference = {
  scope: string | null
  resolved: boolean
  dismissed: boolean
  saving: boolean
  error: string | null
}
const emptyPreference = (scope: string | null): Preference => ({
  scope,
  resolved: false,
  dismissed: false,
  saving: false,
  error: null,
})
const storageKey = (scope: string) => `ewatrade:home-team-prompt:v1:${scope}`

export function useHomeTeamPreference(scope: string | null) {
  const [value, setValue] = useState<Preference>(() => emptyPreference(scope))
  const currentScope = useRef(scope)
  currentScope.current = scope
  const pendingWrite = useRef(false)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setValue(emptyPreference(scope))
    if (scope) {
      void AsyncStorage.getItem(storageKey(scope))
        .then((raw) => {
          if (!cancelled)
            setValue({
              ...emptyPreference(scope),
              resolved: true,
              dismissed: parseHomeTeamDismissal(raw),
            })
        })
        .catch(() => {
          if (!cancelled)
            setValue({
              ...emptyPreference(scope),
              resolved: true,
              error: "Your saved team preference could not load.",
            })
        })
    }
    return () => {
      cancelled = true
    }
  }, [scope])

  const active = value.scope === scope ? value : emptyPreference(scope)
  async function dismiss() {
    if (!scope || !active.resolved || pendingWrite.current) return
    const capturedScope = scope
    pendingWrite.current = true
    setValue((previous) => ({ ...previous, saving: true, error: null }))
    try {
      await AsyncStorage.setItem(storageKey(capturedScope), "dismissed")
      if (mounted.current && currentScope.current === capturedScope) {
        setValue({
          scope: capturedScope,
          resolved: true,
          dismissed: true,
          saving: false,
          error: null,
        })
      }
    } catch {
      if (mounted.current && currentScope.current === capturedScope) {
        setValue((previous) => ({
          ...previous,
          saving: false,
          error:
            "We couldn’t save your choice. Try again to hide this team prompt.",
        }))
      }
    } finally {
      pendingWrite.current = false
    }
  }
  return { ...active, dismiss }
}
