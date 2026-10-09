import { createContext, useContext } from "react"

/** What the open job puts in the modal bar instead of "Service jobs ✕". */
export type ServiceChromeHeader = {
  onBack: () => void
  onHistory: () => void
  title: string
}

export const ServiceChromeContext = createContext<
  (header: ServiceChromeHeader | null) => void
>(() => {})

export function useSetServiceChromeHeader() {
  return useContext(ServiceChromeContext)
}
