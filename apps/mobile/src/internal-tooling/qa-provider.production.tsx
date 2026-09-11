import type { ReactNode } from "react"

export function QaAcceleratorProvider({ children }: { children: ReactNode }) {
  return children
}

export function useQaAccelerator(): never {
  throw new Error("This internal capability is unavailable in this build.")
}
