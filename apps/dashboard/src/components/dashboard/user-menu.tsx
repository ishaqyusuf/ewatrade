"use client"

import { SignOut } from "@/components/dashboard/sign-out"
import { ThemeSwitch } from "@/components/dashboard/theme-switch"
import type { SessionUser } from "@/lib/session"
import { getUserInitials } from "@/lib/user-display"
import { cn } from "@/utils"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import Link from "next/link"
import { SHELL_MENU_CLASS } from "./shell/menu-styles"

type Props = {
  isExpanded?: boolean
  placement?: "sidebar" | "header"
  roleLabel: string
  settingsHref?: string
  user: SessionUser
}

export function UserMenu({
  isExpanded = false,
  placement = "sidebar",
  roleLabel,
  settingsHref,
  user,
}: Props) {
  const displayName =
    user.displayName ??
    (`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            aria-label={`Account menu for ${displayName}`}
            title={isExpanded ? undefined : displayName}
            className={
              isExpanded
                ? "h-auto w-full justify-start gap-3 rounded-lg px-2 py-2 text-left"
                : placement === "header"
                  ? "size-8 rounded-full p-0"
                  : "mx-auto size-10 rounded-lg p-0"
            }
          />
        }
      >
        <Avatar className="size-8 bg-accent">
          {user.avatarUrl ? (
            <AvatarImage src={user.avatarUrl} alt={displayName} />
          ) : null}
          <AvatarFallback className="text-xs font-medium">
            {getUserInitials(user)}
          </AvatarFallback>
        </Avatar>
        {isExpanded ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {displayName}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {roleLabel}
            </span>
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        appearance="dashboard"
        align={placement === "header" ? "end" : "start"}
        side={placement === "header" ? "bottom" : "top"}
        sideOffset={8}
        className={cn("w-60 max-w-[calc(100vw-32px)]", SHELL_MENU_CLASS)}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5">
            <span className="block truncate text-sm font-medium text-foreground">
              {displayName}
            </span>
            <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
            <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">
              {roleLabel}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {settingsHref ? (
          <>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={<Link href={settingsHref} />}
                className="px-2 py-1.5 font-normal"
              >
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator className="my-1" />
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs">Theme</span>
          <ThemeSwitch />
        </div>
        <DropdownMenuSeparator className="my-1" />
        <SignOut />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
