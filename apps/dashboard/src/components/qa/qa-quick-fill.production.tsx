import type { ReactNode } from "react"

export function QaDashboardProvider({ children }: { children: ReactNode }) {
  return children
}

export function QaDashboardQuickFill(_props: {
  canUndo?: boolean
  formId: string
  isDirty?: boolean
  label?: string
  onFill: (...args: never[]) => void
  onUndo?: () => void
}) {
  return null
}
