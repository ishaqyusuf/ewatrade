"use client"

import { isAccessDrift } from "@/components/activity/activity-read-errors"
import { MyPreferences } from "@/components/notification-center/business-notification-settings"
import {
  NotificationPolicyContent,
  PolicyEditor,
} from "@/components/notifications/notification-policy-content"
import {
  type AlertMember,
  type MemberAlertsDraft,
  MemberAlertsEditor,
  NotificationSubscriptionContent,
} from "@/components/notifications/notification-subscription-content"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import type {
  BusinessEventCatalogItem,
  BusinessNotificationPolicyView,
  BusinessNotificationSubscriptionView,
} from "@ewatrade/notifications/business-events"
import {
  Button,
  Input,
  Sheet,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ewatrade/ui"
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import { useEffect, useState } from "react"

const freshRead = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always",
  trpc: { abortOnUnmount: true },
} as const

const CONFLICT =
  "Someone else changed these settings. The latest values are shown; review and save again."

function saveError(error: unknown) {
  return error instanceof TRPCClientError && error.data?.code === "CONFLICT"
    ? CONFLICT
    : "That change wasn't saved. Try again."
}

/**
 * Owner/Admin notification settings: which alert types exist, who receives
 * them, and the admin's own preferences. Alerts never grant record access.
 */
export function BusinessNotificationSettingsPage({
  scopeKey,
  stores,
}: {
  scopeKey: string
  stores: Array<{ id: string; name: string }>
}) {
  return (
    <Tabs defaultValue="types" className="grid gap-5" key={scopeKey}>
      <TabsList variant="line">
        <TabsTrigger value="types">Alert types</TabsTrigger>
        <TabsTrigger value="recipients">Who gets alerts</TabsTrigger>
        <TabsTrigger value="mine">My preferences</TabsTrigger>
      </TabsList>
      <TabsContent value="types">
        <PolicyTab />
      </TabsContent>
      <TabsContent value="recipients">
        <RecipientsTab stores={stores} />
      </TabsContent>
      <TabsContent value="mine">
        <MyPreferences />
      </TabsContent>
    </Tabs>
  )
}

function ReadState({
  state,
  label,
  onRetry,
}: {
  state: "checking" | "refused"
  label: string
  onRetry: () => void
}) {
  return state === "refused" ? (
    <div role="alert" className="grid justify-items-start gap-3 text-sm">
      <p>{label} couldn't load.</p>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  ) : (
    <output aria-live="polite" className="text-sm text-muted-foreground">
      Loading {label.toLowerCase()}…
    </output>
  )
}

function PolicyTab() {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const [editing, setEditing] = useState<{
    entry: BusinessEventCatalogItem
    policy: BusinessNotificationPolicyView | undefined
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const query = useQuery(
    mountOwnedRead(
      trpc.businessNotifications.policy.queryOptions(undefined, freshRead),
      mount,
    ),
  )
  const update = useMutation(
    trpc.businessNotifications.updatePolicy.mutationOptions(),
  )
  const read = freshShownRead(query)
  if (read.state !== "ready")
    return (
      <ReadState
        state={read.state}
        label="Alert types"
        onRetry={() => void query.refetch()}
      />
    )
  return (
    <div className="grid gap-3">
      {read.data.catalog.length ? (
        <NotificationPolicyContent
          items={read.data.items}
          catalog={read.data.catalog}
          onEdit={(entry, policy) => {
            setError(null)
            setEditing({ entry, policy })
          }}
        />
      ) : (
        <p className="border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No alert types are available yet. They become available as each type
          is released.
        </p>
      )}
      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !update.isPending) setEditing(null)
        }}
      >
        {editing ? (
          <SheetFrame
            title={editing.entry.label}
            closeDisabled={update.isPending}
          >
            <PolicyEditor
              // Remount on a fresh revision so a conflict shows latest values.
              key={`${editing.entry.type}:${editing.policy?.revision ?? 0}`}
              entry={editing.entry}
              policy={editing.policy}
              saving={update.isPending}
              error={error}
              onCancel={() => setEditing(null)}
              onSave={(draft) => {
                setError(null)
                update.mutate(
                  {
                    type: editing.entry.type,
                    allowed: {
                      inApp: draft.allowInApp,
                      email: editing.policy?.allowed.email ?? false,
                    },
                    defaults: {
                      inApp: draft.allowInApp && draft.defaultInApp,
                      email: editing.policy?.defaults.email ?? false,
                    },
                    recipientRoles: draft.defaultInApp
                      ? draft.recipientRoles
                      : [],
                    expectedRevision: editing.policy?.revision ?? 0,
                  },
                  {
                    onSuccess: () => setEditing(null),
                    onError: async (err) => {
                      setError(saveError(err))
                      const latest = await query.refetch()
                      const policy = latest.data?.items.find(
                        (item) => item.type === editing.entry.type,
                      )
                      setEditing({ entry: editing.entry, policy })
                    },
                    onSettled: () => void query.refetch(),
                  },
                )
              }}
            />
          </SheetFrame>
        ) : null}
      </Sheet>
    </div>
  )
}

function RecipientsTab({
  stores,
}: {
  stores: Array<{ id: string; name: string }>
}) {
  const [text, setText] = useState("")
  const [search, setSearch] = useState("")
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim().slice(0, 120)), 250)
    return () => clearTimeout(timer)
  }, [text])
  return (
    <div className="grid gap-4">
      <Input
        type="search"
        aria-label="Search team members"
        placeholder="Search team members"
        className="max-w-sm"
        maxLength={120}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {/* A new search or restart remounts the list; no earlier page shows. */}
      <RecipientsBody
        key={`${attempt}:${search}`}
        search={search}
        stores={stores}
        onRestart={() => setAttempt((current) => current + 1)}
      />
    </div>
  )
}

type DirectoryPage = RouterOutputs["retailOps"]["staffDirectoryPage"]

function RecipientsBody({
  search,
  stores,
  onRestart,
}: {
  search: string
  stores: Array<{ id: string; name: string }>
  onRestart: () => void
}) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const [editing, setEditing] = useState<AlertMember | null>(null)
  const [directoryCursor, setDirectoryCursor] = useState<string | undefined>()
  // Pages keyed by the cursor that read them, so a refetch replaces a page
  // instead of appending a duplicate.
  const [directoryByCursor, setDirectoryByCursor] = useState<
    ReadonlyMap<string, DirectoryPage>
  >(new Map())
  const policy = useQuery(
    mountOwnedRead(
      trpc.businessNotifications.policy.queryOptions(undefined, freshRead),
      mount,
    ),
  )
  const subscriptions = useInfiniteQuery(
    mountOwnedRead(
      trpc.businessNotifications.subscriptions.infiniteQueryOptions(
        { limit: 100 },
        {
          ...freshRead,
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        },
      ),
      mount,
    ),
  )
  // Members come from the separately authorized staff directory, paged by
  // cursor like the Staff page (its input is strict, so no infinite query).
  // All statuses are listed so inactive assignments stay visible/removable.
  const directory = useQuery(
    mountOwnedRead(
      trpc.retailOps.staffDirectoryPage.queryOptions(
        {
          ...(search ? { search } : {}),
          ...(directoryCursor ? { cursor: directoryCursor } : {}),
          limit: 25,
        },
        freshRead,
      ),
      mount,
    ),
  )
  const directoryData = directory.isSuccess ? directory.data : undefined
  useEffect(() => {
    if (!directoryData) return
    setDirectoryByCursor((current) =>
      new Map(current).set(directoryCursor ?? "", directoryData),
    )
  }, [directoryData, directoryCursor])
  const directoryPages = [...directoryByCursor.values()]
  // A directory access/cursor refusal hides every member read earlier and
  // closes the editor in this same render; only transient failures keep pages.
  if (directory.isError && isAccessDrift(directory.error))
    return (
      <div role="alert" className="grid justify-items-start gap-3 text-sm">
        <p>
          Your access has changed, so the team list shown earlier was cleared.
        </p>
        <Button variant="outline" onClick={onRestart}>
          Reload team members
        </Button>
      </div>
    )
  if (
    policy.isError ||
    subscriptions.isError ||
    (directory.isError && !directoryPages.length)
  )
    return (
      <ReadState
        state="refused"
        label="Alert assignments"
        onRetry={() => {
          void policy.refetch()
          void subscriptions.refetch()
          void directory.refetch()
        }}
      />
    )
  if (!policy.isSuccess || subscriptions.isPending || !directoryPages.length)
    return (
      <ReadState
        state="checking"
        label="Alert assignments"
        onRetry={() => {}}
      />
    )

  const catalog = policy.data.catalog
  const subs = subscriptions.data.pages.flatMap((page) => page.items)
  const members: AlertMember[] = directoryPages
    .flatMap((page) => page.data)
    .filter(
      (person) =>
        person.status === "ACTIVE" ||
        subs.some((sub) => sub.membershipId === person.membershipId) ||
        subscriptions.hasNextPage,
    )
    .map((person) => ({
      membershipId: person.membershipId,
      name: person.name,
      role: person.role,
      active: person.status === "ACTIVE",
    }))

  const lastDirectoryPage = directoryPages.at(-1)
  return (
    <div className="grid gap-4">
      {catalog.length ? null : (
        <p className="border border-dashed px-4 py-3 text-sm text-muted-foreground">
          No alert types are available yet, so there is nothing to assign.
        </p>
      )}
      <NotificationSubscriptionContent
        members={members}
        subscriptions={subs}
        subscriptionsComplete={!subscriptions.hasNextPage}
        catalog={catalog}
        stores={stores}
        onEdit={(member) => setEditing(member)}
      />
      <div className="flex flex-wrap gap-2">
        {lastDirectoryPage?.nextCursor || directory.isError ? (
          <Button
            variant="outline"
            disabled={directory.isFetching}
            onClick={() =>
              directory.isError
                ? void directory.refetch()
                : setDirectoryCursor(lastDirectoryPage?.nextCursor ?? undefined)
            }
          >
            {directory.isFetching
              ? "Loading…"
              : directory.isError
                ? "Try loading more team members again"
                : "More team members"}
          </Button>
        ) : null}
        {subscriptions.hasNextPage ? (
          <Button
            variant="outline"
            disabled={subscriptions.isFetchingNextPage}
            onClick={() => void subscriptions.fetchNextPage()}
          >
            {subscriptions.isFetchingNextPage
              ? "Loading…"
              : "Load more assignments"}
          </Button>
        ) : null}
      </div>
      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        {editing ? (
          <SheetFrame title={`Alerts for ${editing.name}`}>
            <MemberAlertsContainer
              key={editing.membershipId}
              member={editing}
              catalog={catalog}
              stores={stores}
              onDone={() => {
                setEditing(null)
                void subscriptions.refetch()
              }}
              onChanged={() => void subscriptions.refetch()}
            />
          </SheetFrame>
        ) : null}
      </Sheet>
    </div>
  )
}

/** Reads one member's own rows (bounded below the catalog size) to edit. */
function MemberAlertsContainer({
  member,
  catalog,
  stores,
  onDone,
  onChanged,
}: {
  member: AlertMember
  catalog: BusinessEventCatalogItem[]
  stores: Array<{ id: string; name: string }>
  onDone: () => void
  onChanged: () => void
}) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const query = useQuery(
    mountOwnedRead(
      trpc.businessNotifications.subscriptions.queryOptions(
        { membershipId: member.membershipId, limit: 100 },
        freshRead,
      ),
      mount,
    ),
  )
  const update = useMutation(
    trpc.businessNotifications.updateSubscription.mutationOptions(),
  )
  const read = freshShownRead(query)
  if (read.state !== "ready")
    return (
      <ReadState
        state={read.state}
        label="Their alert assignments"
        onRetry={() => void query.refetch()}
      />
    )
  if (read.data.nextCursor)
    return (
      <p role="alert" className="text-sm">
        This person has more assignments than can be edited here. Contact
        support.
      </p>
    )
  const mine = read.data.items

  async function save(draft: MemberAlertsDraft) {
    setSaving(true)
    setError(null)
    const sameScope = (sub: BusinessNotificationSubscriptionView) =>
      JSON.stringify(sub.scope) === JSON.stringify(draft.scope)
    const changes = catalog.flatMap((entry) => {
      const existing = mine.find((sub) => sub.type === entry.type)
      const wanted = draft.types.includes(entry.type)
      if (
        wanted &&
        member.active &&
        (!existing?.enabled || !sameScope(existing))
      )
        return [
          {
            membershipId: member.membershipId,
            type: entry.type,
            scope: draft.scope,
            allowed: { inApp: true, email: false },
            enabled: true,
            expectedRevision: existing?.revision ?? 0,
          },
        ]
      if (!wanted && existing?.enabled)
        return [
          {
            membershipId: member.membershipId,
            type: entry.type,
            scope: existing.scope,
            allowed: existing.allowed,
            enabled: false,
            expectedRevision: existing.revision,
          },
        ]
      return []
    })
    let saved = 0
    try {
      // Each change is its own command; report exactly what was saved.
      for (const change of changes) {
        await update.mutateAsync(change)
        saved += 1
      }
      onDone()
    } catch (err) {
      const reason = saveError(err)
      setError(
        saved
          ? `Saved ${saved} of ${changes.length} changes. ${reason}`
          : reason,
      )
      await query.refetch()
      // Re-seed the editor from the latest saved rows and revisions.
      setRevision((current) => current + 1)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <MemberAlertsEditor
      key={revision}
      member={member}
      subscriptions={mine}
      catalog={catalog}
      stores={stores}
      saving={saving}
      error={error}
      onSave={(draft) => void save(draft)}
      onCancel={onDone}
    />
  )
}
