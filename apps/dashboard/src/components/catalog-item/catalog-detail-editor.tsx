"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  FieldGroup,
  Separator,
} from "@ewatrade/ui"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { motion, useReducedMotion } from "framer-motion"
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import type { ComponentProps, ReactNode } from "react"

type SectionIcon = ComponentProps<typeof HugeiconsIcon>["icon"]

/**
 * Optional sections open in place inside the form. Each open section keeps a
 * one-level child editor (a selling unit or a customer choice) that replaces
 * the section's own content until its Back button returns to the section.
 */
export function useCatalogSections() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<string[]>([])
  const [children, setChildren] = useState<Record<string, string>>({})
  const returnFocus = useRef(new Map<string, HTMLElement>())
  const focusTarget = useRef<string | null>(null)

  useLayoutEffect(() => {
    const target = focusTarget.current
    if (!target) return
    focusTarget.current = null
    const returning = returnFocus.current.get(target)
    if (returning?.isConnected) {
      returnFocus.current.delete(target)
      returning.focus({ preventScroll: true })
      return
    }
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-editor="${CSS.escape(target)}"] h3`)
      ?.focus({ preventScroll: true })
  })

  function reveal(section: string) {
    const alreadyOpen = open.includes(section)
    setOpen((current) =>
      current.includes(section) ? current : [...current, section],
    )
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    // Scroll after the panel has expanded so the whole section can reach the top.
    requestAnimationFrame(() => {
      const target = containerRef.current?.querySelector(
        `[data-section="${CSS.escape(section)}"]`,
      )
      if (!target) return
      const scroll = () =>
        target.scrollIntoView({
          block: "start",
          behavior: reduce ? "auto" : "smooth",
        })
      const panel = target.querySelector('[data-slot="accordion-content"]')
      if (alreadyOpen || reduce || !panel) return scroll()
      let done = false
      const once = () => {
        if (done) return
        done = true
        scroll()
      }
      panel.addEventListener("animationend", once, { once: true })
      window.setTimeout(once, 400)
    })
  }

  return {
    containerRef,
    open,
    setOpen,
    reveal,
    /** The editor stack for one section, in the shape nested editors expect. */
    section(section: string) {
      const child = children[section]
      return {
        active: child ?? section,
        open: (editor: string) => {
          if (document.activeElement instanceof HTMLElement)
            returnFocus.current.set(section, document.activeElement)
          focusTarget.current = editor
          setChildren((current) => ({ ...current, [section]: editor }))
        },
        back: () => {
          focusTarget.current = section
          setChildren((current) => {
            const { [section]: _closed, ...rest } = current
            return rest
          })
        },
      }
    },
  }
}

const CatalogSectionContext = createContext<string | null>(null)

/** Accordion of optional sections; several may be open at once and closed ones stay mounted. */
export function CatalogSections({
  children,
  onValueChange,
  value,
}: {
  children: ReactNode
  onValueChange: (value: string[]) => void
  value: string[]
}) {
  return (
    <Accordion
      appearance="dashboard"
      multiple
      value={value}
      onValueChange={(next) => onValueChange(next as string[])}
    >
      {children}
    </Accordion>
  )
}

export function CatalogSection({
  children,
  icon,
  id,
  summary,
  title,
}: {
  children: ReactNode
  icon: SectionIcon
  id: string
  summary: string
  title: string
}) {
  return (
    <AccordionItem value={id} data-section={id} className="scroll-mt-2">
      <AccordionTrigger className="items-center gap-3 px-4 py-3 hover:no-underline">
        <HugeiconsIcon
          icon={icon}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">{title}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {summary}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent keepMounted className="pt-1">
        <CatalogSectionContext.Provider value={id}>
          {children}
        </CatalogSectionContext.Provider>
      </AccordionContent>
    </AccordionItem>
  )
}

export function CatalogSectionNav({
  essentialsSummary,
  onSelect,
  sections,
}: {
  essentialsSummary: string
  onSelect: (id: string) => void
  sections: Array<{ id: string; title: string; summary: string; done: boolean }>
}) {
  const item = (id: string, title: string, summary: string, done: boolean) => (
    <Button
      key={id}
      type="button"
      variant="ghost"
      className="h-auto w-full justify-start gap-2 px-2 py-1.5 text-left font-normal"
      onClick={() => onSelect(id)}
    >
      <span
        aria-hidden="true"
        className={
          done
            ? "mt-0.5 grid size-3.5 shrink-0 place-items-center self-start rounded-full bg-primary text-primary-foreground"
            : "mt-0.5 size-3.5 shrink-0 self-start rounded-full border border-border"
        }
      >
        {done ? <HugeiconsIcon icon={Tick02Icon} className="size-2.5" /> : null}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm">{title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {summary}
        </span>
      </span>
      <span className="sr-only">{done ? "(filled)" : "(empty)"}</span>
    </Button>
  )
  return (
    <nav
      aria-label="Item sections"
      className="hidden lg:sticky lg:top-0 lg:flex lg:flex-col lg:gap-0.5"
    >
      {item("essentials", "Essentials", essentialsSummary, true)}
      <p className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">
        Optional
      </p>
      {sections.map((section) =>
        item(section.id, section.title, section.summary, section.done),
      )}
    </nav>
  )
}

export function CatalogDetailEditor({
  active,
  backLabel = "Back",
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
  // The section header already names its own editor; children keep a heading and a way back.
  const isSectionRoot = useContext(CatalogSectionContext) === editor
  return (
    <CatalogEditorPanel active={active === editor} editor={editor}>
      <FieldGroup className="gap-5">
        {isSectionRoot ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : (
          <>
            <header className="flex flex-col gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit"
                onClick={onBack}
              >
                ← {backLabel}
              </Button>
              <h3 tabIndex={-1} className="text-base font-medium">
                {title}
              </h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </header>
            <Separator />
          </>
        )}
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
  icon?: SectionIcon
  title: string
  summary: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto w-full justify-between gap-4 rounded-none py-3 text-left"
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
