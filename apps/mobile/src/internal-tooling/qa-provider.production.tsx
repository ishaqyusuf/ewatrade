import { useAuthenticatedQaTools } from "@/hooks/use-authenticated-qa-tools"
import { type ReactNode, createContext, useContext } from "react"
import type { QaAcceleratorContextValue } from "../hooks/use-qa-accelerator"

const Context = createContext<QaAcceleratorContextValue | null>(null)

export function QaAcceleratorProvider({ children }: { children: ReactNode }) {
  const tools = useAuthenticatedQaTools()
  const value: QaAcceleratorContextValue = {
    authorization: null,
    authorizationError: null,
    authorizationSheetRequest: 0,
    authorize() {},
    capabilityAvailable: false,
    capabilityCategory: null,
    clientEnabled: false,
    toolingAvailable: Boolean(tools.fixtureContext),
    async clearQaData() {},
    isAuthorizing: false,
    isLoading: tools.isLoading,
    isSelecting: false,
    openAuthorizationSheet() {},
    profilesLoading: false,
    selectingProfileReference: null,
    fixtureContext: tools.fixtureContext,
    profileError: null,
    profiles: [],
    async retryCapability() {},
    async refreshProfiles() {},
    refreshFixtureContext: tools.refreshFixtureContext,
    selectProfile() {},
  }
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useQaAccelerator() {
  const value = useContext(Context)
  if (!value) throw new Error("Draft tooling provider is unavailable.")
  return value
}
