"use client"

import { Button, FieldGroup, Separator } from "@ewatrade/ui"
import { HugeiconsIcon } from "@hugeicons/react"
import { motion, useReducedMotion } from "framer-motion"
import { useLayoutEffect, useRef, useState } from "react"
import type { ComponentProps, ReactNode } from "react"

export function useCatalogEditorStack() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [stack, setStack] = useState<string[]>([])
  const scrollPositions = useRef(new Map<string, number>())
  const returnFocus = useRef(new Map<string, HTMLElement>())
  const active = stack.at(-1) ?? "main"

  function remember() {
    const scroller = containerRef.current?.closest('[data-slot="sheet-body"]')
    scrollPositions.current.set(active, scroller?.scrollTop ?? 0)
    if (document.activeElement instanceof HTMLElement)
      returnFocus.current.set(active, document.activeElement)
  }

  useLayoutEffect(() => {
    const scroller = containerRef.current?.closest('[data-slot="sheet-body"]')
    if (scroller) scroller.scrollTop = scrollPositions.current.get(active) ?? 0
    const previousFocus = returnFocus.current.get(active)
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    else if (active !== "main")
      containerRef.current
        ?.querySelector<HTMLElement>(`[data-editor="${CSS.escape(active)}"] h3`)
        ?.focus({ preventScroll: true })
  }, [active])

  return {
    active,
    parent: stack.at(-2) ?? "main",
    containerRef,
    open: (editor: string) => {
      remember()
      setStack((current) => [...current, editor])
    },
    back: () => {
      remember()
      setStack((current) => current.slice(0, -1))
    },
  }
}

export function CatalogDetailEditor({
  active,
  backLabel = "Back to setup",
  children,
  description,
  editor,
  onBack,
  title,
}: {
  active: string
  backLabel?: string
  children: ReactNode
  description: string
  editor: string
  onBack: () => void
  title: string
}) {
  return (
    <CatalogEditorPanel active={active === editor} editor={editor}>
      <FieldGroup className="gap-5">
        <header className="flex flex-col gap-3 pt-2">
          <Button
            appearance="form"
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={onBack}
          >
            ← {backLabel}
          </Button>
          <h3 tabIndex={-1} className="text-lg font-medium">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </header>
        <Separator />
        {children}
      </FieldGroup>
    </CatalogEditorPanel>
  )
}

export function CatalogEditorPanel({
  active,
  children,
  editor,
}: {
  active: boolean
  children: ReactNode
  editor: string
}) {
  const reducedMotion = useReducedMotion()
  return (
    <motion.div
      hidden={!active}
      data-editor={editor}
      initial={false}
      animate={{ opacity: active ? 1 : 0, y: active || reducedMotion ? 0 : 8 }}
      transition={{ duration: reducedMotion ? 0 : 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  )
}

export function CatalogFooterLabel({ children }: { children: string }) {
  const reducedMotion = useReducedMotion()
  return (
    <motion.span
      key={children}
      initial={reducedMotion ? false : { opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.14, ease: "easeOut" }}
    >
      {children}
    </motion.span>
  )
}

export function CatalogDetailRow({
  icon,
  title,
  summary,
  onClick,
}: {
  icon?: ComponentProps<typeof HugeiconsIcon>["icon"]
  title: string
  summary: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto w-full justify-between gap-4 py-3 text-left"
      onClick={onClick}
    >
      {icon ? <HugeiconsIcon icon={icon} data-icon="inline-start" /> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span>{title}</span>
        <span className="whitespace-normal text-xs font-normal text-muted-foreground">
          {summary}
        </span>
      </span>
      <span aria-hidden="true">›</span>
    </Button>
  )
}
