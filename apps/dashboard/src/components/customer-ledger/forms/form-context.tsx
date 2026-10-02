"use client"
import { type ReactNode, createContext, useContext, useState } from "react"
const Context = createContext<{
  locked: boolean
  setLocked: (locked: boolean) => void
} | null>(null)
export function CustomerLedgerFormProvider({
  children,
}: { children: ReactNode }) {
  const [locked, setLocked] = useState(false)
  return (
    <Context.Provider value={{ locked, setLocked }}>
      {children}
    </Context.Provider>
  )
}
export function useCustomerLedgerForm() {
  const value = useContext(Context)
  if (!value) throw new Error("Customer ledger form context missing.")
  return value
}
