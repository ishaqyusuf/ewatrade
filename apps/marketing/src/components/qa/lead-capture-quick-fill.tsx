"use client"

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import {
  QaQuickFillButton,
  type QaQuickFillOption,
} from "./qa-quick-fill-button"

export type LeadQuickFillTarget = QaQuickFillOption & { qaDomain: string }
type RegisterTarget = (target: LeadQuickFillTarget) => () => void
const LeadQuickFillContext = createContext<RegisterTarget | null>(null)

export function useLeadQuickFillRegistration() {
  return useContext(LeadQuickFillContext)
}

export function LeadCaptureQuickFillProvider({
  children,
}: { children: ReactNode }) {
  const [targets, setTargets] = useState<Record<string, LeadQuickFillTarget>>(
    {},
  )
  const register = useCallback<RegisterTarget>((target) => {
    setTargets((current) => ({ ...current, [target.id]: target }))
    return () => {
      setTargets((current) => {
        if (current[target.id] !== target) return current
        const next = { ...current }
        delete next[target.id]
        return next
      })
    }
  }, [])
  const options = useMemo(
    () =>
      [targets["early-access"], targets.waitlist].filter(
        (target): target is LeadQuickFillTarget => Boolean(target),
      ),
    [targets],
  )

  return (
    <LeadQuickFillContext.Provider value={register}>
      {children}
      <QaQuickFillButton
        onFill={() => {}}
        options={options}
        qaDomain={options[0]?.qaDomain}
        visible={options.length > 0}
      />
    </LeadQuickFillContext.Provider>
  )
}
