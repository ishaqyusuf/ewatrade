"use client"

import { type ReactNode, createContext, useContext } from "react"

const AssistantReadActivity = createContext(true)

export function useAssistantReadActivity() {
  return useContext(AssistantReadActivity)
}

/** Optional descendant reads follow the retained chat's visible lifetime. */
export function AssistantReadActivityProvider({
  active,
  children,
}: { active: boolean; children: ReactNode }) {
  return (
    <AssistantReadActivity.Provider value={active}>
      {children}
    </AssistantReadActivity.Provider>
  )
}
