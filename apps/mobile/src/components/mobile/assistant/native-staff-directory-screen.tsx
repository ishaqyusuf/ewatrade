import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import {
  type GeneralAnswer,
  staffDirectoryTargetSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { ScrollView } from "react-native"
import { ActionButton } from "../action-button"
import {
  SearchFooterField,
  SearchFooterScope,
  SearchFooterSpacer,
} from "../search-footer-scope"

type AnswerTarget = NonNullable<GeneralAnswer["target"]>
type Target = Extract<AnswerTarget, { kind: "staff_directory" }>
type Props = { target: Target; onOpen: (target: AnswerTarget) => void }
const roles =
  staffDirectoryTargetSchema.shape.filters.shape.role.unwrap().options
const statuses =
  staffDirectoryTargetSchema.shape.filters.shape.status.unwrap().options
const label = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
const utc = (value: Date | string | null | undefined) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toISOString()
    : "Not recorded"

/** Protected current directory, preserving the original saved filters exactly. */
export function NativeStaffDirectoryScreen({ target, onOpen }: Props) {
  const { profile } = useAuthContext()
  const parsed = staffDirectoryTargetSchema.safeParse(target)
  if (!parsed.success)
    return (
      <Text accessibilityRole="alert" className="p-5 text-sm text-foreground">
        This staff directory link is invalid. Open the original saved answer
        again.
      </Text>
    )
  const canRead =
    profile?.id &&
    profile?.businessId &&
    (profile.status === undefined || profile.status === "ACTIVE") &&
    (profile.role === "OWNER" ||
      profile.role === "ADMIN" ||
      (profile.role === "MANAGER" && profile.staffAccessMode === "LEGACY"))
  if (!canRead)
    return (
      <Text accessibilityRole="alert" className="p-5 text-sm text-foreground">
        Current Owner, Admin or legacy Manager access is required for the staff
        directory.
      </Text>
    )
  const scope = JSON.stringify([
    profile.id,
    profile.businessId,
    profile.storeId,
    profile.role,
    profile.staffAccessMode,
    profile.catalogEditor,
    profile.status,
    parsed.data,
  ])
  return <DirectoryPage key={scope} target={parsed.data} onOpen={onOpen} />
}

function DirectoryPage({ target, onOpen }: Props) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.retailOps.staffDirectoryPage.queryOptions(
        { ...target.filters, limit: 10 },
        {
          retry: false,
          staleTime: 0,
          gcTime: 0,
          refetchOnMount: "always",
          trpc: { abortOnUnmount: true },
        },
      ),
      mount,
    ),
  )
  const read = freshShownRead(query)
  const page = read.state === "ready" ? read.data : null
  const scopeMatches =
    page &&
    page.assignmentStoreId === (target.filters.assignmentStoreId ?? null) &&
    page.scope ===
      (target.filters.assignmentStoreId
        ? "active_store_assignments"
        : "tenant_memberships")
  if (read.state === "checking")
    return (
      <Text className="p-5 text-sm text-muted-foreground">
        Checking current access and staff directory…
      </Text>
    )
  if (read.state === "refused" || !scopeMatches || !page)
    return (
      <View className="gap-4 p-5">
        <Text accessibilityRole="alert" className="text-sm text-foreground">
          This directory page is unavailable for your current access or saved
          filters. The original filters and cursor have been kept. No empty
          result or zero total is inferred.
        </Text>
        <ActionButton variant="outline" onPress={() => void query.refetch()}>
          Retry directory
        </ActionButton>
      </View>
    )
  const continued = Boolean(target.filters.cursor)
  const filtered = Boolean(
    target.filters.search ||
      target.filters.role ||
      target.filters.status ||
      target.filters.assignmentStoreId,
  )
  return (
    <SearchFooterScope>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 36 }}
      >
        <Text
          accessibilityRole="header"
          className="text-xl font-bold text-foreground"
        >
          Staff directory
        </Text>
        <Text className="font-medium text-foreground">
          {page.total} matching memberships · {page.data.length} on this page
        </Text>
        <Text className="text-sm text-muted-foreground">
          {page.scope === "active_store_assignments"
            ? "Business · explicit active Store assignments"
            : "Business · membership directory"}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Request as of {utc(page.asOf)} UTC. The total covers all matching
          memberships. Page results may change between requests.
        </Text>
        <FilterControls target={target} onOpen={onOpen} />
        {page.data.length ? (
          page.data.map((member, index) => (
            <View
              key={member.membershipId}
              className="gap-2 rounded-xl border border-border p-4"
            >
              <Text className="font-bold text-foreground">
                {member.name?.trim() || "Name not recorded"}
              </Text>
              <Text className="text-sm text-foreground">
                {member.email?.trim() || "Email not recorded"}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {label(member.role)} · {label(member.status)}
              </Text>
              <Text className="text-xs text-muted-foreground">
                Invited: {utc(member.invitedAt)} UTC
              </Text>
              <Text className="text-xs text-muted-foreground">
                Accepted: {utc(member.acceptedAt)} UTC
              </Text>
              {member.profileCoverage === "unavailable" ? (
                <Text className="text-xs text-muted-foreground">
                  Durable staff profile unavailable. Current membership facts
                  are shown; missing profile or dates are not inferred.
                </Text>
              ) : null}
              <ActionButton
                variant="outline"
                accessibilityLabel={`Open membership ${index + 1}: ${member.name?.trim() || "Name not recorded"}, ${member.email?.trim() || "Email not recorded"}`}
                onPress={() =>
                  onOpen({
                    kind: "staff_member",
                    membershipId: member.membershipId,
                  })
                }
              >
                Open membership
              </ActionButton>
            </View>
          ))
        ) : (
          <Text className="text-sm text-foreground">
            {continued
              ? "No memberships on this continuation page. Matching totals are from this current request; return to First page or refresh."
              : filtered
                ? "No memberships match these saved filters in the current request."
                : "No memberships were returned for this current business directory request."}
          </Text>
        )}
        <View className="gap-2 border-t border-border pt-4">
          <Text className="text-xs text-muted-foreground">
            {page.coverage.profile === "partial"
              ? "Some durable profiles are unavailable on this page."
              : "Durable profiles are available on this page."}{" "}
            Current membership role and status are shown. History has not been
            read. Store filters require saved active assignments; legacy Store
            access is not inferred.
          </Text>
          <Text className="text-xs text-muted-foreground">
            {page.nextCursor
              ? "More matching memberships are available."
              : "End of available matching results for this request."}
          </Text>
        </View>
        <ActionButton variant="outline" onPress={() => void query.refetch()}>
          Refresh directory
        </ActionButton>
        {continued ? (
          <ActionButton
            variant="outline"
            onPress={() => {
              const { cursor: _cursor, ...filters } = target.filters
              onOpen({ kind: "staff_directory", filters })
            }}
          >
            First page
          </ActionButton>
        ) : null}
        {page.nextCursor ? (
          <ActionButton
            onPress={() =>
              onOpen({
                kind: "staff_directory",
                filters: {
                  ...target.filters,
                  cursor: page.nextCursor ?? undefined,
                },
              })
            }
          >
            Next page
          </ActionButton>
        ) : null}
        <SearchFooterSpacer />
      </ScrollView>
    </SearchFooterScope>
  )
}

function FilterControls({ target, onOpen }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [search, setSearch] = useState(target.filters.search ?? "")
  const [role, setRole] = useState(target.filters.role)
  const [status, setStatus] = useState(target.filters.status)
  return (
    <View className="gap-3">
      <Text className="text-sm text-muted-foreground">
        Search: {target.filters.search || "All names and emails"} · Role:{" "}
        {target.filters.role ? label(target.filters.role) : "All"} · Status:{" "}
        {target.filters.status ? label(target.filters.status) : "All"}
      </Text>
      {target.filters.assignmentStoreId ? (
        <Text className="text-xs text-muted-foreground">
          The original saved Store assignment filter is retained when filtering
          or paging. Legacy Store access is not inferred.
        </Text>
      ) : null}
      <ActionButton
        variant="outline"
        onPress={() => setExpanded((value) => !value)}
      >
        {expanded ? "Close filter choices" : "Edit search, role and status"}
      </ActionButton>
      {expanded ? (
        <>
          <SearchFooterField
            accessibilityLabel="Search staff by name or email"
            placeholder="Search staff by name or email"
            value={search}
            maxLength={120}
            onChangeText={setSearch}
          />
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Staff role"
            className="gap-2"
          >
            <Choice
              label="All roles"
              selected={!role}
              onPress={() => setRole(undefined)}
            />
            {roles.map((value) => (
              <Choice
                key={value}
                label={label(value)}
                selected={role === value}
                onPress={() => setRole(value)}
              />
            ))}
          </View>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Membership status"
            className="gap-2"
          >
            <Choice
              label="All statuses"
              selected={!status}
              onPress={() => setStatus(undefined)}
            />
            {statuses.map((value) => (
              <Choice
                key={value}
                label={label(value)}
                selected={status === value}
                onPress={() => setStatus(value)}
              />
            ))}
          </View>
          <ActionButton
            onPress={() => {
              const { cursor: _cursor, ...original } = target.filters
              const parsed = staffDirectoryTargetSchema.safeParse({
                kind: "staff_directory",
                filters: {
                  ...original,
                  search: search.trim() || undefined,
                  role,
                  status,
                },
              })
              if (parsed.success) onOpen(parsed.data)
            }}
          >
            Apply filters
          </ActionButton>
        </>
      ) : null}
    </View>
  )
}

function Choice({
  label,
  selected,
  onPress,
}: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={`min-h-11 rounded-lg border px-3 py-3 ${selected ? "border-primary bg-secondary" : "border-border bg-background"}`}
    >
      <Text className="text-sm text-foreground">{label}</Text>
    </Pressable>
  )
}
