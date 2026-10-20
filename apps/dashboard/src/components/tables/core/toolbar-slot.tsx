"use client"

import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react"
import { createPortal } from "react-dom"

type ToolbarSlot = {
  target: HTMLElement | null
  setTarget: (element: HTMLElement | null) => void
}

const TableToolbarSlotContext = createContext<ToolbarSlot | null>(null)

/**
 * Lets a suspended directory table put its Sort and Columns controls in the
 * page header row, beside View and Add, while it keeps the table instance.
 */
export function TableToolbarSlotProvider({
  children,
}: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const value = useMemo(() => ({ target, setTarget }), [target])
  return (
    <TableToolbarSlotContext.Provider value={value}>
      {children}
    </TableToolbarSlotContext.Provider>
  )
}

/** Where the header row receives the table's controls. */
export function TableToolbarSlot() {
  const slot = useContext(TableToolbarSlotContext)
  return <div ref={slot?.setTarget} className="contents" />
}

/** Renders into the header slot, or in place when the page has none. */
export function TableToolbarPortal({ children }: { children: ReactNode }) {
  const slot = useContext(TableToolbarSlotContext)
  if (!slot) return children
  return slot.target ? createPortal(children, slot.target) : null
}
