"use client"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
} from "react"
const FinanceFormContext = createContext<{
  actorUserId: string
  locked: boolean
  recoveryNotice: string | null
  recoveryAcknowledgement: (() => Promise<void>) | null
  setRecoveryNotice: (value: string | null) => void
  recoveryRefresh: number
  refreshRecovery: () => void
  setRecoveryAcknowledgement: (value: (() => Promise<void>) | null) => void
  setLocked: (value: boolean) => void
  tenantId: string
} | null>(null)
export function FinanceFormProvider({
  actorUserId,
  children,
  tenantId,
}: {
  actorUserId: string
  children: ReactNode
  tenantId: string
}) {
  const [locked, setLocked] = useState(false)
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null)
  const [recoveryAcknowledgement, setRecoveryAcknowledgement] = useState<
    (() => Promise<void>) | null
  >(null)
  const setRecoveryAcknowledgementValue = useCallback(
    (value: (() => Promise<void>) | null) =>
      setRecoveryAcknowledgement(() => value),
    [],
  )
  const [recoveryRefresh, setRecoveryRefresh] = useState(0)
  const refreshRecovery = useCallback(
    () => setRecoveryRefresh((value) => value + 1),
    [],
  )
  return (
    <FinanceFormContext.Provider
      value={{
        actorUserId,
        locked,
        recoveryAcknowledgement,
        recoveryNotice,
        recoveryRefresh,
        refreshRecovery,
        setLocked,
        setRecoveryAcknowledgement: setRecoveryAcknowledgementValue,
        setRecoveryNotice,
        tenantId,
      }}
    >
      {children}
    </FinanceFormContext.Provider>
  )
}
export function useFinanceForm() {
  const context = useContext(FinanceFormContext)
  if (!context) throw new Error("FinanceFormProvider is missing")
  return context
}
