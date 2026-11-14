"use client"
import { FormFeedback } from "@/components/forms/form-feedback"

import { useWorkspaceSwitch } from "@/hooks/use-workspace-switch"
import type { TenantContext } from "@/lib/tenant"
import { cn } from "@/utils"
import { Button } from "@ewatrade/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ewatrade/ui/dropdown-menu"
import {
  ArrowDown01Icon,
  Building02Icon,
  Store04Icon,
  Tick02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { usePathname } from "next/navigation"

type Props = {
  ctx: TenantContext
  selection?: "workspace" | "business" | "store"
  isExpanded?: boolean
  onNavigate?: () => void
}

function businessInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (
    (words.length > 1
      ? `${words[0]?.[0]}${words[1]?.[0]}`
      : name.slice(0, 2)
    ).toUpperCase() || "?"
  )
}

export function WorkspaceDropdown({
  ctx,
  selection = "workspace",
  isExpanded = false,
  onNavigate,
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
              className={cn(
                "disabled:opacity-100",
                isSwitching && "disabled:opacity-70",
                selection === "store"
                  ? "h-11 max-w-64 gap-2 border border-[color:var(--input)] bg-background px-3 font-medium"
                  : "h-11 w-full justify-start gap-2.5 overflow-hidden px-[5px] text-left hover:bg-[var(--hover)]",
              )}
            />
          }
        >
          {selection === "store" ? (
            <HugeiconsIcon icon={Store04Icon} className="size-[18px]" />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-foreground text-sm font-bold tracking-wide text-background"
            >
              {businessInitials(ctx.tenant.name)}
            </span>
          )}
          {selection === "store" ? (
            <span className="min-w-0 truncate text-sm">
              {isSwitching ? "Switching…" : storeName}
            </span>
          ) : (
            <span
              className={cn(
                "grid min-w-0 flex-1 leading-tight transition-opacity duration-150",
                isExpanded ? "opacity-100" : "opacity-0",
              )}
            >
              <span className="truncate text-sm font-semibold text-foreground">
                {ctx.tenant.name}
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {isSwitching ? "Switching…" : storeName}
              </span>
            </span>
          )}
          {hasChoices && (isExpanded || selection === "store") ? (
            <HugeiconsIcon
              icon={selection === "store" ? ArrowDown01Icon : UnfoldMoreIcon}
              className="size-4 shrink-0 text-muted-foreground"
            />
          ) : null}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          appearance="dashboard"
          align={selection === "store" ? "end" : "start"}
          side={selection === "store" || isExpanded ? "bottom" : "right"}
          sideOffset={8}
          className="w-64"
        >
          {showBusinesses ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
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
              <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                {ctx.storeSelectionNeedsRepair
                  ? "Select a Store to refresh access"
                  : "Stores"}
              </DropdownMenuLabel>
              {ctx.membership.staffAccessMode !== "SCOPED" ||
              ["OWNER", "ADMIN"].includes(ctx.membership.role) ? (
                <DropdownMenuItem
                  disabled={isSwitching}
                  onClick={() => void switchAllStores(onNavigate)}
                >
                  All stores{" "}
                  {allStores ? (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      className="ml-auto size-4"
                    />
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
