"use client"

import type { StorefrontAction } from "@ewatrade/storefront-contracts/actions"
import { type MouseEvent, type ReactNode, useMemo } from "react"
import { ComponentContext } from "./context"
import type { ComponentInput } from "./contracts"

/** Trusted renderer host only. Generated imports cannot construct this boundary. */
export function ComponentHost({
  input,
  onAction,
  children,
}: {
  input: ComponentInput
  onAction: (action: StorefrontAction) => void | Promise<void>
  children: ReactNode
}) {
  const value = useMemo(() => ({ input }), [input])
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!event.nativeEvent.isTrusted || !(event.target instanceof Element))
      return
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-sf-action-index]",
    )
    if (!button || button.disabled || !event.currentTarget.contains(button))
      return
    const index = button.getAttribute("data-sf-action-index")
    if (index === null || !/^(0|[1-9][0-9]*)$/.test(index)) return
    const action = input.actions[Number(index)]
    if (action) void onAction(action)
  }
  return (
    <ComponentContext.Provider value={value}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Descendant native buttons emit click for keyboard activation; this wrapper only delegates. */}
      <div onClick={handleClick}>{children}</div>
    </ComponentContext.Provider>
  )
}
