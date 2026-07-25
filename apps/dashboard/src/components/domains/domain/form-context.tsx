"use client"

import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react"

export type DomainQuoteDraft = {
  expiresAt: string
  id: string
  normalizedDomain: string
  provider: "EXTERNAL" | "GO54" | "OPENPROVIDER"
  retailCurrencyCode: string
  retailPriceMinor: number
}

type DomainFormState = {
  domain: string
  profileId: string | null
  quote: DomainQuoteDraft | null
  setTermsAccepted: (value: boolean) => void
  setDomain: (value: string) => void
  setProfileId: (value: string | null) => void
  setQuote: (value: DomainQuoteDraft | null) => void
  termsAccepted: boolean
}

const DomainFormContext = createContext<DomainFormState | null>(null)

export function DomainFormProvider({ children }: { children: ReactNode }) {
  const [domain, setDomain] = useState("")
  const [profileId, setProfileId] = useState<string | null>(null)
  const [quote, setQuote] = useState<DomainQuoteDraft | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const value = useMemo(
    () => ({
      domain,
      profileId,
      quote,
      setTermsAccepted,
      setDomain,
      setProfileId,
      setQuote,
      termsAccepted,
    }),
    [domain, profileId, quote, termsAccepted],
  )

  return (
    <DomainFormContext.Provider value={value}>
      {children}
    </DomainFormContext.Provider>
  )
}

export function useDomainForm() {
  const context = useContext(DomainFormContext)
  if (!context) throw new Error("DomainFormProvider is missing.")
  return context
}
