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

type Props = {
  ctx: TenantContext
  isExpanded?: boolean
  onNavigate?: () => void
}

export function WorkspaceDropdown({
  ctx,
  isExpanded = false,
  onNavigate,
}: Props) {
  const { error, isSwitching, switchStore, switchTenant } =
    useWorkspaceSwitch(ctx)
  const storeName = ctx.activeStore?.name ?? ctx.tenant.slug
  const hasChoices = ctx.tenants.length > 1 || ctx.stores.length > 1

  return (
    <div className="min-w-0">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              disabled={!hasChoices || isSwitching}
              aria-label={`Business ${ctx.tenant.name}, store ${storeName}`}
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
            <HugeiconsIcon icon={Building02Icon} className="size-4" />
          </span>
          {isExpanded ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {ctx.tenant.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {isSwitching ? "Switching…" : storeName}
              </span>
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
          {ctx.tenants.length > 1 ? (
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

          {ctx.tenants.length > 1 && ctx.stores.length > 1 ? (
            <DropdownMenuSeparator className="my-1" />
          ) : null}

          {ctx.stores.length > 1 ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Stores
              </DropdownMenuLabel>
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
                  {store.id === ctx.activeStore?.id ? (
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
