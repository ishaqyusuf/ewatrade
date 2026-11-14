"use client"

import { SignOut } from "@/components/dashboard/sign-out"
import { ThemeSwitch } from "@/components/dashboard/theme-switch"
import type { SessionUser } from "@/lib/session"
import { getUserInitials } from "@/lib/user-display"
import { cn } from "@/utils"
import { getMarketingUrl } from "@ewatrade/onboarding/lib/signup-navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@ewatrade/ui/avatar"
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
  ArrowRight01Icon,
  HelpCircleIcon,
  Settings01Icon,
  TelegramIcon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"

type Props = {
  /** Top bar avatar button, or the account row at the foot of the phone menu. */
  placement?: "header" | "sheet"
  roleLabel: string
  settingsHref?: string
  user: SessionUser
  onNavigate?: () => void
}

function UserAvatar({ user, name }: { user: SessionUser; name: string }) {
  return (
    <Avatar className="size-9 shrink-0 bg-[var(--avatar)]">
      {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={name} /> : null}
      <AvatarFallback className="bg-[var(--avatar)] text-sm font-semibold text-[var(--avatar-foreground)]">
        {getUserInitials(user)}
      </AvatarFallback>
    </Avatar>
  )
}

const itemClass = "gap-2.5 px-2.5 text-sm"

export function UserMenu({
  placement = "header",
  roleLabel,
  settingsHref,
  user,
  onNavigate,
}: Props) {
  const displayName =
    user.displayName ??
    (`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email)
  const inSheet = placement === "sheet"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${displayName}`}
        className={cn(
          "flex items-center gap-2.5 rounded-[10px] text-left outline-none hover:bg-[var(--hover)] aria-expanded:bg-[var(--hover)]",
          inSheet ? "h-14 w-full px-2" : "h-11 shrink-0 px-1 xl:pr-2.5",
        )}
      >
        <UserAvatar user={user} name={displayName} />
        <span
          className={cn(
            "min-w-0 flex-1 leading-tight",
            inSheet ? "grid" : "hidden xl:grid",
          )}
        >
          <span className="truncate text-sm font-semibold text-foreground">
            {displayName}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {roleLabel}
          </span>
        </span>
        {inSheet ? (
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="size-4 shrink-0 text-muted-foreground"
          />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        appearance="dashboard"
        align={inSheet ? "start" : "end"}
        side={inSheet ? "top" : "bottom"}
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-24px)] p-1.5"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5 px-2.5 py-2">
            <UserAvatar user={user} name={displayName} />
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-sm font-semibold text-foreground">
                {displayName}
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {user.email}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-[var(--neutral)] px-2.5 py-0.5 text-xs font-semibold text-[var(--neutral-foreground)]">
              {roleLabel}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-1" />
        <div className="grid gap-1.5 px-2.5 pt-1 pb-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Appearance
          </span>
          <ThemeSwitch />
        </div>
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuGroup>
          {settingsHref ? (
            <DropdownMenuItem
              render={<Link href={settingsHref} onClick={onNavigate} />}
              className={itemClass}
            >
              <HugeiconsIcon icon={Settings01Icon} className="size-[18px]" />
              Settings
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            render={<Link href="/account/whatsapp" onClick={onNavigate} />}
            className={itemClass}
          >
            <HugeiconsIcon icon={WhatsappIcon} className="size-[18px]" />
            WhatsApp assistant
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link href="/account/telegram" onClick={onNavigate} />}
            className={itemClass}
          >
            <HugeiconsIcon icon={TelegramIcon} className="size-[18px]" />
            Telegram assistant
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              // biome-ignore lint/a11y/useAnchorContent: the menu item renders its children into this anchor.
              <a
                href={`${getMarketingUrl()}/support`}
                target="_blank"
                rel="noreferrer"
              />
            }
            className={itemClass}
          >
            <HugeiconsIcon icon={HelpCircleIcon} className="size-[18px]" />
            Help
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-1" />
        <SignOut />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
