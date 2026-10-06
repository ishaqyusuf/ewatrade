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
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { usePathname } from "next/navigation"

type Props = {
  ctx: TenantContext
  selection?: "workspace" | "business" | "store"
  isExpanded?: boolean
  onNavigate?: () => void
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
              className={
                isExpanded
                  ? cn(
                      "h-auto w-full justify-start gap-3 rounded-none px-2 py-2 text-left disabled:opacity-100",
                      isSwitching && "disabled:opacity-70",
                    )
                  : cn(
                      "mx-auto flex size-10 rounded-none p-0 disabled:opacity-100",
                      isSwitching && "disabled:opacity-70",
                    )
              }
            />
          }
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-none border border-border bg-muted text-foreground">
            <HugeiconsIcon
              icon={selection === "store" ? Store04Icon : Building02Icon}
              className="size-4"
            />
          </span>
          {isExpanded ? (
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
          {isExpanded && hasChoices ? (
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className="size-4 shrink-0 text-muted-foreground"
            />
          ) : null}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          appearance="dashboard"
          align={isExpanded ? "start" : "end"}
          side={isExpanded ? "bottom" : "right"}
          sideOffset={8}
          className="w-64"
        >
          {showBusinesses ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Businesses
              </DropdownMenuLabel>
              {ctx.tenants.map((tenant) => (
                <DropdownMenuItem
                  key={tenant.id}
                  disabled={isSwitching}
                  className="rounded-none px-2 py-1.5 font-normal"
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
              <DropdownMenuLabel className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                  className="rounded-none px-2 py-1.5 font-normal"
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
