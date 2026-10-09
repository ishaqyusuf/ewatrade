"use client"
import { FormFeedback } from "@/components/forms/form-feedback"

import { useWorkspaceSwitch } from "@/hooks/use-workspace-switch"
import type { TenantContext } from "@/lib/tenant"
import { cn } from "@/utils"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import {
  ArrowDown01Icon,
  Building02Icon,
  Store04Icon,
  Tick02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { usePathname } from "next/navigation"
import { SHELL_MENU_CLASS, SHELL_MENU_LABEL_CLASS } from "./shell/menu-styles"
import { getWorkspaceInitials } from "./shell/rail-model"

type Props = {
  ctx: TenantContext
  selection?: "workspace" | "business" | "store"
  isExpanded?: boolean
  onNavigate?: () => void
  /** "topbar": compact business switcher for the desktop top bar. */
  variant?: "default" | "topbar"
}

export function WorkspaceDropdown({
  ctx,
  selection = "workspace",
  isExpanded = false,
  onNavigate,
  variant = "default",
}: Props) {
  const { error, isSwitching, switchStore, switchTenant, switchAllStores } =
    useWorkspaceSwitch(ctx)
  const pathname = usePathname()
  const allStores =
    ctx.inventoryScope === "all" && pathname.startsWith("/inventory")
  const storeName = allStores
    ? "All stores"
    : (ctx.activeStore?.name ?? ctx.tenant.slug)
  const showBusinesses = selection !== "store" && ctx.tenants.length > 1
  const showStores =
    selection !== "business" &&
    (ctx.stores.length > 1 ||
      Boolean(ctx.storeSelectionNeedsRepair && ctx.stores.length))
  const hasChoices = showBusinesses || showStores
  const isTopbar = variant === "topbar"
  // The store sits beside the business name when there is more than one.
  const showStoreInTopbar = ctx.stores.length > 1 || allStores

  return (
    <div className="min-w-0">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              disabled={!hasChoices || isSwitching}
              aria-label={
                selection === "store"
                  ? `Store: ${storeName}`
                  : `Business ${ctx.tenant.name}, store ${storeName}`
              }
              title={`${ctx.tenant.name} · ${storeName}`}
              className={
                isTopbar
                  ? cn(
                      "h-9 max-w-full justify-start gap-2 rounded-lg pr-2 pl-1.5 text-left text-sm font-semibold disabled:opacity-100",
                      isSwitching && "disabled:opacity-70",
                    )
                  : isExpanded
                    ? cn(
                        "h-auto w-full justify-start gap-3 rounded-lg px-2 py-2 text-left disabled:opacity-100",
                        isSwitching && "disabled:opacity-70",
                      )
                    : cn(
                        "mx-auto flex size-10 rounded-lg p-0 disabled:opacity-100",
                        isSwitching && "disabled:opacity-70",
                      )
              }
            />
          }
        >
          {isTopbar ? (
            <>
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-[calc(var(--radius)-1px)] bg-primary text-[10.5px] font-bold tracking-wide text-primary-foreground"
              >
                {getWorkspaceInitials(ctx.tenant.name)}
              </span>
              <span className="min-w-0 truncate">{ctx.tenant.name}</span>
              {isSwitching || showStoreInTopbar ? (
                <span
                  className={cn(
                    "min-w-0 truncate font-normal text-muted-foreground",
                    isSwitching ? "inline" : "hidden xl:inline",
                  )}
                >
                  {isSwitching ? "Switching…" : storeName}
                </span>
              ) : null}
              {hasChoices ? (
                <HugeiconsIcon
                  icon={UnfoldMoreIcon}
                  className="size-4 shrink-0 text-muted-foreground"
                />
              ) : null}
            </>
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-foreground">
              <HugeiconsIcon
                icon={selection === "store" ? Store04Icon : Building02Icon}
                className="size-4"
              />
            </span>
          )}
          {!isTopbar && isExpanded ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {selection === "store" ? storeName : ctx.tenant.name}
              </span>
              {selection !== "store" || isSwitching ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {isSwitching ? "Switching…" : storeName}
                </span>
              ) : null}
            </span>
          ) : null}
          {!isTopbar && isExpanded && hasChoices ? (
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className="size-4 shrink-0 text-muted-foreground"
            />
          ) : null}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          appearance="dashboard"
          align={isTopbar || isExpanded ? "start" : "end"}
          side={isTopbar || isExpanded ? "bottom" : "right"}
          sideOffset={isTopbar ? 6 : 8}
          className={cn("w-64", SHELL_MENU_CLASS)}
        >
          {showBusinesses ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel className={SHELL_MENU_LABEL_CLASS}>
                Businesses
              </DropdownMenuLabel>
              {ctx.tenants.map((tenant) => (
                <DropdownMenuItem
                  key={tenant.id}
                  disabled={isSwitching}
                  className="px-2 py-1.5 font-normal"
                  onClick={() => void switchTenant(tenant.id, onNavigate)}
                >
                  <HugeiconsIcon
                    icon={Building02Icon}
                    className="size-4 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate">{tenant.name}</span>
                  {tenant.id === ctx.tenant.id ? (
                    <HugeiconsIcon icon={Tick02Icon} className="size-4" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ) : null}

          {showBusinesses && showStores ? (
            <DropdownMenuSeparator className="my-1" />
          ) : null}

          {showStores ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel className={SHELL_MENU_LABEL_CLASS}>
                {ctx.storeSelectionNeedsRepair
                  ? "Select a Store to refresh access"
                  : "Stores"}
              </DropdownMenuLabel>
              {ctx.membership.staffAccessMode !== "SCOPED" ||
              ["OWNER", "ADMIN"].includes(ctx.membership.role) ? (
                <DropdownMenuItem
                  disabled={isSwitching}
                  className="px-2 py-1.5 font-normal"
                  onClick={() => void switchAllStores(onNavigate)}
                >
                  <HugeiconsIcon
                    icon={Store04Icon}
                    className="size-4 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate">All stores</span>
                  {allStores ? (
                    <HugeiconsIcon icon={Tick02Icon} className="size-4" />
                  ) : null}
                </DropdownMenuItem>
              ) : null}
              {ctx.stores.map((store) => (
                <DropdownMenuItem
                  key={store.id}
                  disabled={isSwitching}
                  className="px-2 py-1.5 font-normal"
                  onClick={() => void switchStore(store.id, onNavigate)}
                >
                  <HugeiconsIcon
                    icon={Store04Icon}
                    className="size-4 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate">{store.name}</span>
                  {!allStores && store.id === ctx.activeStore?.id ? (
                    <HugeiconsIcon icon={Tick02Icon} className="size-4" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
    </div>
  )
}
