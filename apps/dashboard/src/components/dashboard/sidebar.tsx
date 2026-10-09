"use client"

import type { DashboardNavItem } from "@/lib/navigation"
import { cn } from "@/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import { SidebarLeftIcon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  type FocusEvent,
  Fragment,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { NavIcon } from "./nav-icon"
import { useDashboardShell } from "./shell/dashboard-shell"
import {
  SHELL_MENU_CLASS,
  SHELL_MENU_ITEM_CLASS,
  SHELL_MENU_LABEL_CLASS,
} from "./shell/menu-styles"
import {
  getActiveFlyoutHref,
  getFlyoutLinks,
  groupRailItems,
  isNavItemActive,
} from "./shell/rail-model"

type Props = {
  navItems: DashboardNavItem[]
}

type Tip = { label: string; top: number; left: number }

type TipHandlers = {
  onBlur: () => void
  onFocus: (event: FocusEvent<HTMLElement>) => void
  onPointerEnter: (event: PointerEvent<HTMLElement>) => void
  onPointerLeave: () => void
}

const RAIL_ITEM_CLASS =
  "group/rail flex w-full flex-col items-center gap-[3px] py-[3px] text-muted-foreground outline-none transition-colors hover:text-foreground aria-expanded:text-foreground"

function RailItemBody({
  active,
  hasFlyout,
  icon,
  label,
  showLabel,
}: {
  active: boolean
  hasFlyout?: boolean
  icon: ReactNode
  label: string
  showLabel: boolean
}) {
  return (
    <>
      <span
        className={cn(
          "relative grid h-8 w-11 place-items-center rounded-full transition-colors group-focus-visible/rail:ring-2 group-focus-visible/rail:ring-ring motion-reduce:transition-none",
          active
            ? "bg-primary/20 text-primary"
            : "group-hover/rail:bg-accent group-aria-expanded/rail:bg-accent",
        )}
      >
        {icon}
        {hasFlyout ? (
          <span
            aria-hidden="true"
            className="absolute right-[5px] bottom-[5px] size-0 border-b-4 border-l-4 border-b-current border-l-transparent opacity-45"
          />
        ) : null}
      </span>
      {showLabel ? (
        <span
          aria-hidden="true"
          className={cn(
            "max-w-full truncate px-1 text-[11px] leading-[1.15]",
            active ? "font-bold" : "font-medium",
          )}
        >
          {label}
        </span>
      ) : null}
    </>
  )
}

function RailFlyout({
  active,
  item,
  onOpenChange,
  pathname,
  showLabel,
  tipHandlers,
}: {
  active: boolean
  item: DashboardNavItem
  onOpenChange: (open: boolean) => void
  pathname: string
  showLabel: boolean
  tipHandlers: TipHandlers
}) {
  const links = getFlyoutLinks(item)
  const activeHref = getActiveFlyoutHref(pathname, item)

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        aria-label={item.label}
        className={cn(RAIL_ITEM_CLASS, active && "text-foreground")}
        {...tipHandlers}
      >
        <RailItemBody
          active={active}
          hasFlyout
          icon={<NavIcon name={item.icon} className="size-[19px]" />}
          label={item.label}
          showLabel={showLabel}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        appearance="dashboard"
        side="right"
        align="start"
        sideOffset={8}
        alignOffset={-4}
        className={cn("w-60", SHELL_MENU_CLASS)}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className={SHELL_MENU_LABEL_CLASS}>
            {item.label}
          </DropdownMenuLabel>
          {links.map((link) => {
            const isCurrent = link.href === activeHref
            return (
              <DropdownMenuItem
                key={link.href}
                render={
                  <Link
                    href={link.href}
                    prefetch
                    aria-current={pathname === link.href ? "page" : undefined}
                  />
                }
                className={cn(
                  SHELL_MENU_ITEM_CLASS,
                  isCurrent && "font-semibold! text-primary",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{link.label}</span>
                {isCurrent ? (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    className="size-4 text-primary"
                  />
                ) : null}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Desktop icon rail under the top bar: 64px icons with tooltips, or 88px with
 * short labels. Sections with child pages open a flyout instead of a list.
 */
export function DashboardSidebar({ navItems }: Props) {
  const pathname = usePathname()
  const { railLabels, toggleRailLabels } = useDashboardShell()
  const [tip, setTip] = useState<Tip | null>(null)
  const [openFlyout, setOpenFlyout] = useState<string | null>(null)
  const { main, footer } = useMemo(() => groupRailItems(navItems), [navItems])

  const hideTip = useCallback(() => setTip(null), [])

  useEffect(() => {
    if (!tip) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setTip(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [tip])

  // Labels mode shows names inline; tooltips would only repeat them.
  useEffect(() => {
    if (railLabels) setTip(null)
  }, [railLabels])

  function tipHandlers(label: string, flyoutKey?: string): TipHandlers {
    function show(element: HTMLElement) {
      if (railLabels || (flyoutKey && openFlyout === flyoutKey)) return
      const rect = element.getBoundingClientRect()
      setTip({ label, left: rect.right + 10, top: rect.top + rect.height / 2 })
    }
    return {
      onPointerEnter: (event) => {
        if (event.pointerType === "mouse") show(event.currentTarget)
      },
      onPointerLeave: hideTip,
      onFocus: (event) => {
        let focusVisible = true
        try {
          focusVisible = event.currentTarget.matches(":focus-visible")
        } catch {
          // Older engines without :focus-visible: show on any focus.
        }
        if (focusVisible) show(event.currentTarget)
      },
      onBlur: hideTip,
    }
  }

  function renderItem(item: DashboardNavItem) {
    const active = isNavItemActive(pathname, item)

    if (item.children?.length) {
      return (
        <li key={item.href} className="w-full">
          <RailFlyout
            active={active}
            item={item}
            pathname={pathname}
            showLabel={railLabels}
            tipHandlers={tipHandlers(item.label, item.href)}
            onOpenChange={(open) => {
              setTip(null)
              setOpenFlyout(open ? item.href : null)
            }}
          />
        </li>
      )
    }

    return (
      <li key={item.href} className="w-full">
        <Link
          href={item.href}
          aria-label={item.label}
          aria-current={
            pathname === item.href ? "page" : active ? "true" : undefined
          }
          className={cn(RAIL_ITEM_CLASS, active && "text-foreground")}
          {...tipHandlers(item.label)}
        >
          <RailItemBody
            active={active}
            icon={<NavIcon name={item.icon} className="size-[19px]" />}
            label={item.label}
            showLabel={railLabels}
          />
        </Link>
      </li>
    )
  }

  const toggleLabel = railLabels ? "Hide labels" : "Show labels"

  return (
    <aside
      aria-label="Dashboard sidebar"
      className="fixed bottom-0 left-0 top-14 z-30 hidden w-(--dashboard-rail-width) flex-col border-r border-border bg-background transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex"
    >
      <nav
        aria-label="Main navigation"
        className="scrollbar-hide flex min-h-0 flex-1 flex-col items-center overflow-x-hidden overflow-y-auto pt-2.5"
        onScroll={hideTip}
      >
        {main.map((group, index) => (
          <Fragment key={group[0]?.href ?? index}>
            {index ? (
              <span
                aria-hidden="true"
                className="my-1.5 h-px w-6 shrink-0 bg-border"
              />
            ) : null}
            <ul className="flex w-full flex-col items-center gap-0.5">
              {group.map(renderItem)}
            </ul>
          </Fragment>
        ))}
        <span aria-hidden="true" className="min-h-2 flex-1" />
        {footer.length ? (
          <ul className="flex w-full flex-col items-center gap-0.5">
            {footer.map(renderItem)}
          </ul>
        ) : null}
      </nav>
      <div className="flex shrink-0 pt-0.5 pb-2.5">
        <button
          type="button"
          aria-label="Show labels"
          aria-pressed={railLabels}
          className={RAIL_ITEM_CLASS}
          onClick={toggleRailLabels}
          {...tipHandlers(toggleLabel)}
        >
          <RailItemBody
            active={false}
            icon={
              <HugeiconsIcon icon={SidebarLeftIcon} className="size-[18px]" />
            }
            label="Labels"
            showLabel={railLabels}
          />
        </button>
      </div>
      {tip ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-[calc(var(--radius)-1px)] bg-foreground px-[9px] py-[5px] text-xs font-medium text-background shadow-sm"
          style={{ left: tip.left, top: tip.top }}
        >
          {tip.label}
        </div>
      ) : null}
    </aside>
  )
}
