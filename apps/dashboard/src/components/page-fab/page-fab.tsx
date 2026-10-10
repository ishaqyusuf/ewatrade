"use client"

import { Button, cn } from "@ewatrade/ui"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  AnimatePresence,
  type Transition,
  motion,
  useReducedMotion,
} from "framer-motion"
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { createPortal } from "react-dom"
import { usePageFabSlot } from "./fab-slot"

// Portaled to <body>: page content can sit under transformed scroll wrappers,
// which would otherwise pin `fixed` to the wrapper instead of the viewport.
const corner =
  "fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] sm:hidden"

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
}

/** Small-screen primary add action. Spreads trigger props so menus and sheets can render it. */
export function PageFab({
  label,
  icon = Add01Icon,
  className,
  ...props
}: { label: string; icon?: IconSvgElement } & ComponentProps<"button">) {
  usePageFabSlot()
  if (!useHydrated()) return null
  return createPortal(
    <Button
      type="button"
      size="icon"
      aria-label={label}
      title={label}
      className={cn(corner, "z-30 size-14 rounded-[50%] shadow-lg", className)}
      {...props}
    >
      <HugeiconsIcon icon={icon} className="size-6" />
    </Button>,
    document.body,
  )
}

export type PageFabAction = {
  label: string
  icon: IconSvgElement
  onSelect: () => void
}

const MAIN = 56
const ACTION = 44
const INSET = (MAIN - ACTION) / 2
const FIRST_OFFSET = 64
const STEP = 60
// Room around the blobs so the goo blur is not clipped by the filter region.
const GOO_PAD = 16

const spring: Transition = {
  type: "spring",
  stiffness: 480,
  damping: 30,
  mass: 0.9,
}

/**
 * Small-screen speed dial. Action bubbles split out of the main button through
 * an SVG goo filter; icons and labels sit on an unfiltered layer above it.
 */
export function PageFabMenu({
  label,
  actions,
}: { label: string; actions: PageFabAction[] }) {
  usePageFabSlot()
  const hydrated = useHydrated()
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const filterId = `page-fab-goo-${useId().replace(/[^a-zA-Z0-9]/g, "")}`

  const close = useCallback(() => {
    setOpen(false)
    toggleRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      event.preventDefault()
      close()
    }
    document.addEventListener("keydown", onEscape)
    return () => document.removeEventListener("keydown", onEscape)
  }, [open, close])

  if (!hydrated) return null
  const last = actions.length - 1
  const offset = (index: number) => -(FIRST_OFFSET + STEP * index)
  const move = (index: number): Transition =>
    reduceMotion
      ? { duration: 0 }
      : { ...spring, delay: open ? index * 0.03 : (last - index) * 0.02 }

  return createPortal(
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="backdrop"
            aria-hidden="true"
            className="fixed inset-0 z-50 bg-background/40 backdrop-blur-sm sm:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onClick={close}
          />
        ) : null}
      </AnimatePresence>
      <div className={cn(corner, "size-14", open ? "z-50" : "z-30")}>
        <svg aria-hidden="true" className="absolute size-0">
          <defs>
            <filter id={filterId} colorInterpolationFilters="sRGB">
              <feGaussianBlur in="SourceGraphic" stdDeviation="9" />
              <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" />
            </filter>
          </defs>
        </svg>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            right: -GOO_PAD,
            bottom: -GOO_PAD,
            width: MAIN + GOO_PAD * 2,
            height: GOO_PAD * 2 + INSET + ACTION - offset(last),
            filter: `url(#${filterId}) drop-shadow(0 8px 14px rgb(0 0 0 / 0.2))`,
          }}
        >
          {actions.map((action, index) => (
            <motion.span
              key={action.label}
              className="absolute size-11 rounded-full bg-primary"
              style={{ right: GOO_PAD + INSET, bottom: GOO_PAD + INSET }}
              initial={false}
              animate={{ y: open ? offset(index) : 0 }}
              transition={move(index)}
            />
          ))}
          <motion.span
            className="absolute size-14 rounded-full bg-primary"
            style={{ right: GOO_PAD, bottom: GOO_PAD }}
            initial={false}
            animate={{ scale: open ? 0.8 : 1 }}
            transition={reduceMotion ? { duration: 0 } : spring}
          />
        </div>
        <button
          ref={toggleRef}
          type="button"
          aria-label={open ? "Close quick actions" : label}
          aria-expanded={open}
          aria-controls={menuId}
          title={open ? "Close" : label}
          className="absolute inset-0 grid place-items-center rounded-[50%] text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => (open ? close() : setOpen(true))}
        >
          <motion.span
            className="grid place-items-center"
            initial={false}
            animate={{ rotate: open ? 135 : 0 }}
            transition={reduceMotion ? { duration: 0 } : spring}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-6" />
          </motion.span>
        </button>
        <fieldset
          id={menuId}
          aria-label={label}
          inert={!open}
          className={cn(!open && "pointer-events-none")}
        >
          {actions.map((action, index) => (
            <motion.button
              key={action.label}
              type="button"
              className="group/fab-action absolute flex items-center gap-3 rounded-full outline-none"
              style={{ right: INSET, bottom: INSET }}
              initial={false}
              animate={{ y: open ? offset(index) : 0 }}
              transition={move(index)}
              onClick={() => {
                setOpen(false)
                action.onSelect()
              }}
            >
              <motion.span
                className="whitespace-nowrap rounded-full border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-md"
                initial={false}
                animate={{ opacity: open ? 1 : 0, x: open ? 0 : 8 }}
                transition={{
                  duration: reduceMotion ? 0 : open ? 0.18 : 0.08,
                  delay: open && !reduceMotion ? 0.1 + index * 0.03 : 0,
                }}
              >
                {action.label}
              </motion.span>
              <motion.span
                className="grid size-11 place-items-center rounded-full text-primary-foreground group-focus-visible/fab-action:ring-3 group-focus-visible/fab-action:ring-ring/50"
                initial={false}
                animate={{ opacity: open ? 1 : 0 }}
                transition={{
                  duration: reduceMotion ? 0 : open ? 0.15 : 0.06,
                  delay: open && !reduceMotion ? 0.08 + index * 0.03 : 0,
                }}
              >
                <HugeiconsIcon icon={action.icon} className="size-5" />
              </motion.span>
            </motion.button>
          ))}
        </fieldset>
      </div>
    </>,
    document.body,
  )
}
