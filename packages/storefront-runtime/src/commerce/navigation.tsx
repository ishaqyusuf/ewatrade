"use client"

import {
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  createContext,
  useContext,
} from "react"

export type CommerceLinkProps = ComponentProps<"a">
export type CommerceNavigation = {
  Link: ComponentType<CommerceLinkProps>
  navigate(
    path: string,
    options?: { replace?: boolean; refresh?: boolean },
  ): void
  refresh(): void
  pending: boolean
}

const NavigationContext = createContext<CommerceNavigation | null>(null)

export function CommerceNavigationProvider({
  value,
  children,
}: { value: CommerceNavigation; children: ReactNode }) {
  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useCommerceNavigation() {
  return useContext(NavigationContext)
}

/** The host supplies routing; standalone fixtures and editor previews keep anchors. */
export function CommerceLink(props: CommerceLinkProps) {
  const navigation = useCommerceNavigation()
  if (
    navigation &&
    props.href?.startsWith("/") &&
    !props.href.startsWith("//")
  ) {
    const Link = navigation.Link
    return <Link {...props} />
  }
  return <a {...props} />
}
