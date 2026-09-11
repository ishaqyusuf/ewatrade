import type { ReactNode } from "react"

export function QaWebAccelerator({ children }: { children: ReactNode }) {
  return children
}

export function QaWebAccountChooser() {
  return null
}

export function useOptionalQaWebAccelerator() {
  return null
}

export function useQaWebAccelerator(): never {
  throw new Error("This internal capability is unavailable in this build.")
}
