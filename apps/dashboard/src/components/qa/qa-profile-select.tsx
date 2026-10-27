"use client"

import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ewatrade/ui"
import {
  type QaProfile,
  filterQaProfiles,
  formatQaCount,
  groupQaProfiles,
  qaProfileDisplayName,
  qaProfileLabel,
} from "@ewatrade/utils/qa-profiles"
import { useMemo, useState } from "react"

/** Midday account-combobox ownership; flat business sections from Workshop02v5. */
export function QaProfileSelect({
  profiles,
  selected,
  qaDomain,
  disabled,
  onSelect,
  onRefresh,
  onChangeDomain,
}: {
  profiles: QaProfile[]
  selected?: QaProfile
  qaDomain: string
  disabled: boolean
  onSelect(profile: QaProfile): void
  onRefresh(): void
  onChangeDomain(): void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const groups = useMemo(
    () => groupQaProfiles(filterQaProfiles(profiles, search)),
    [profiles, search],
  )
  return (
    <Popover
      open={open && !disabled}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) setSearch("")
      }}
    >
      <PopoverTrigger
        render={<Button type="button" variant="outline" />}
        id="email"
        // biome-ignore lint/a11y/useSemanticElements: Searchable Popover/Command account picker requires a combobox trigger.
        role="combobox"
        aria-haspopup="listbox"
        aria-label="QA profile"
        aria-expanded={open && !disabled}
        disabled={disabled}
        className="h-auto min-h-11 w-full justify-between gap-3 whitespace-normal text-left"
      >
        <span className="min-w-0 break-words">
          {selected ? (
            <>
              <span className="block text-base">
                {qaProfileDisplayName(selected)}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                {selected.business.name} · {selected.store.name} ·{" "}
                {selected.membership.role}
              </span>
            </>
          ) : (
            "Choose a QA profile"
          )}
        </span>
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[460px] max-w-[calc(100vw-32px)] gap-0 border border-border bg-background p-0"
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">QA businesses</h3>
            <p className="break-words text-sm text-muted-foreground">
              {qaDomain}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="ghost" size="icon" />}
              aria-label="QA domain options"
            >
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <circle cx="5" cy="12" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="19" cy="12" r="1.5" />
              </svg>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRefresh}>
                Refresh list
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setOpen(false)
                  onChangeDomain()
                }}
              >
                Change QA domain
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Command shouldFilter={false}>
          <CommandInput
            aria-label="Search QA businesses"
            placeholder="Search businesses or people"
            value={search}
            onValueChange={setSearch}
            className="border-b border-border px-5"
          />
          <CommandList
            className="max-h-[min(480px,60vh)]"
            aria-label="QA profiles"
          >
            <CommandEmpty>
              {profiles.length
                ? "No matching profiles. Try a business, Store, person or role."
                : "No active QA businesses for this domain."}
            </CommandEmpty>
            {groups.map((group) => (
              <CommandGroup
                key={group.business.id}
                className="p-0 [&_[cmdk-group-heading]]:p-0"
                heading={
                  <div className="border-b border-border px-5 pb-3 pt-6 font-sans normal-case tracking-normal">
                    <div className="break-words text-base font-semibold text-foreground">
                      {group.business.name}
                    </div>
                    <div
                      className="mt-2 flex flex-wrap gap-x-5 gap-y-1"
                      title="Services are included in Catalog items. Orders are per Store. — means unavailable."
                    >
                      <Count
                        label="Catalog items"
                        value={group.profiles[0]?.counts?.catalogItems}
                      />
                      <Count
                        label="Services"
                        value={group.profiles[0]?.counts?.services}
                      />
                    </div>
                  </div>
                }
              >
                {group.profiles.map((profile) => (
                  <CommandItem
                    key={profile.profileReference}
                    value={profile.profileReference}
                    aria-label={qaProfileLabel(profile)}
                    disabled={disabled}
                    onSelect={() => {
                      onSelect(profile)
                      setOpen(false)
                      setSearch("")
                    }}
                    className="block min-h-20 cursor-pointer space-y-2 rounded-none border-b border-border px-5 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 break-words text-base font-semibold">
                        {profile.store.name}
                      </span>
                      <span className="shrink-0 text-sm font-normal text-muted-foreground">
                        {profile.membership.role}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3 text-sm font-normal text-muted-foreground">
                      <span className="min-w-0 break-words">
                        {qaProfileDisplayName(profile)}
                      </span>
                      <span className="shrink-0 tabular-nums text-primary">
                        {formatQaCount(profile.counts?.orders)} orders
                      </span>
                    </div>
                    {selected?.profileReference === profile.profileReference ? (
                      <span className="sr-only">Selected</span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function Count({ label, value }: { label: string; value?: number | null }) {
  return (
    <div
      className="flex items-baseline gap-1.5 text-sm font-normal"
      aria-label={`${label}: ${value == null ? "unavailable" : value}`}
    >
      <span className="font-semibold tabular-nums text-foreground">
        {formatQaCount(value)}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}
