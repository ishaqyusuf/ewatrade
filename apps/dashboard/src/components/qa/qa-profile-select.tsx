"use client"

import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ewatrade/ui"
import {
  type QaProfile,
  filterQaProfiles,
  formatQaCount,
  groupQaProfiles,
  qaProfileLabel,
} from "@ewatrade/utils/qa-profiles"
import { useMemo, useState } from "react"

/** Midday's account combobox composition, grouped by the authorized business ID. */
export function QaProfileSelect({
  profiles,
  selected,
  disabled,
  onSelect,
}: {
  profiles: QaProfile[]
  selected?: QaProfile
  disabled: boolean
  onSelect(profile: QaProfile): void
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
        aria-label="Email address"
        aria-expanded={open && !disabled}
        disabled={disabled}
        className="h-auto min-h-11 w-full justify-between gap-3 whitespace-normal text-left"
      >
        <span className="min-w-0 break-words">
          {selected ? (
            <>
              <span className="block">{selected.identity.email}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {selected.business.name} · {selected.store.name} ·{" "}
                {selected.membership.role}
              </span>
            </>
          ) : (
            "Choose a QA email address"
          )}
        </span>
        <span aria-hidden="true" className="text-muted-foreground">
          ⌄
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[420px] max-w-[calc(100vw-32px)] gap-0 rounded-2xl border border-border bg-background p-2"
      >
        <Command shouldFilter={false}>
          <CommandInput
            aria-label="Search QA businesses"
            placeholder="Search businesses, Stores or people"
            value={search}
            onValueChange={setSearch}
            className="px-3"
          />
          <p className="px-3 pb-2 text-xs text-muted-foreground">
            Services are included in catalog items. Orders are per Store. —
            means unavailable.
          </p>
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
                className="mb-2 overflow-hidden rounded-xl border border-border p-0 [&_[cmdk-group-heading]]:p-0"
                heading={
                  <div className="space-y-3 bg-muted/30 p-4 normal-case tracking-normal">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary"
                      >
                        {group.business.name.trim().slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 break-words text-sm font-semibold text-foreground">
                        {group.business.name}
                      </span>
                    </div>
                    <div
                      className="flex gap-6"
                      title="Business counts. Services are included in catalog items."
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
                    className="block cursor-pointer space-y-1 rounded-none border-t border-border px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 break-words font-semibold">
                        {profile.store.name}
                      </span>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {profile.membership.role}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
                      <span className="min-w-0 break-words">
                        {profile.identity.name}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-primary">
                        {formatQaCount(profile.counts?.orders)} orders
                      </span>
                    </div>
                    <div className="break-words text-xs text-muted-foreground">
                      {profile.identity.email}
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
    <div aria-label={`${label}: ${value == null ? "unavailable" : value}`}>
      <div className="text-base font-bold tabular-nums text-foreground">
        {formatQaCount(value)}
      </div>
      <div className="text-xs font-normal text-muted-foreground">{label}</div>
    </div>
  )
}
