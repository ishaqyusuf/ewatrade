"use client"

import { createContext, useContext } from "react"
import type { ComponentInput } from "./contracts"

/** Internal only: absent from package exports and generated import permissions. */
export const ComponentContext = createContext<{
  input: ComponentInput
} | null>(null)

export function useComponentHost() {
  const value = useContext(ComponentContext)
  if (!value) throw new Error("COMPONENT_TRUSTED_HOST_REQUIRED")
  return value
}
