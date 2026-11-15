import { StaffStatusChip } from "@/components/staff/staff-list"
import type { StaffAccessResponse } from "@/hooks/use-staff-access"
import {
  type StaffMemberRow,
  getStaffRoleLabel,
  getStaffStatusKey,
  getStaffWorkingRoleLabel,
} from "@/lib/staff-management"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { cn } from "@ewatrade/ui"

type Member = RouterOutputs["retailOps"]["staffDirectoryMember"]

const dateFormat = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" })
function formatDate(value: Date | string | null | undefined) {
  return value ? dateFormat.format(new Date(value)) : null
}

/** The member as a Staff page row, so status and actions read the same everywhere. */
export function memberAsStaffRow(
  member: Member,
  access: StaffAccessResponse | undefined,
): StaffMemberRow {
  const record = access?.access
  return {
    id: member.membershipId,
    role: member.role,
    status: member.status,
    acceptedAt: member.acceptedAt
      ? new Date(member.acceptedAt).toISOString()
      : null,
    invitedAt: member.invitedAt
      ? new Date(member.invitedAt).toISOString()
      : null,
    createdAt: new Date(member.createdAt).toISOString(),
    updatedAt: new Date(member.updatedAt).toISOString(),
    invitedByUserId: null,
    user: {
      id: member.userId,
      email: member.email,
      name: member.name,
      displayName: member.name,
      avatarUrl: null,
      image: null,
    },
    access: !record
      ? undefined
      : {
          allStores:
            ["OWNER", "ADMIN"].includes(member.role) ||
            record.staffAccessMode === "LEGACY",
          catalogEditor: record.catalogEditor,
          defaultStoreId: record.retailOpsStaffProfile?.defaultStoreId ?? null,
          stores: record.staffStoreAssignments.map((row) => ({
            storeId: row.storeId,
            role: row.role,
            storeName:
              access?.stores.find((store) => store.id === row.storeId)?.name ??
              "Store no longer open",
          })),
          invitationId: record.invitation?.id ?? null,
          invitationExpiresAt: record.invitation?.expiresAt
            ? new Date(record.invitation.expiresAt).toISOString()
            : null,
        },
  }
}

/** One short line under the status: what it means for them. */
function statusLine(row: StaffMemberRow) {
  const key = getStaffStatusKey(row)
  const expires = formatDate(row.access?.invitationExpiresAt)
  if (key === "invited")
    return expires
      ? `They haven’t joined yet. The link works until ${expires}.`
      : "They haven’t joined yet."
  if (key === "expired") return "The link stopped working. Send it again."
  if (key === "cancelled") return "They never joined."
  if (key === "suspended")
    return row.acceptedAt
      ? "They can’t sign in until you reactivate them."
      : "They never joined."
  return null
}

export function StaffMemberContent({
  row,
  showStores,
  loading = false,
}: {
  row: StaffMemberRow
  showStores: boolean
  /** Store access is still loading. */
  loading?: boolean
}) {
  const access = row.access
  const line = statusLine(row)
  const joined = formatDate(row.acceptedAt)
  const invited = formatDate(row.invitedAt)
  return (
    <div className="grid gap-6 text-base">
      {line ? (
        <div className="flex items-start gap-3 rounded-[var(--ui-radius-item)] border border-border p-3">
          <StaffStatusChip member={row} />
          <p className="min-w-0 self-center text-sm">{line}</p>
        </div>
      ) : null}

      <section className="grid gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Access</h3>
        {!showStores ? (
          <p className="font-medium">{getStaffWorkingRoleLabel(row)}</p>
        ) : loading || !access ? (
          <output aria-live="polite" className="text-muted-foreground">
            Loading…
          </output>
        ) : access.allStores ? (
          <p>
            <span className="font-medium">{getStaffRoleLabel(row.role)}</span>{" "}
            in every store
          </p>
        ) : access.stores.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--ui-radius-item)] border border-border">
            {access.stores.map((store) => (
              <li
                key={store.storeId}
                className="flex min-h-11 items-center justify-between gap-3 px-3 py-2"
              >
                <span className="grid min-w-0">
                  <span className="truncate">{store.storeName}</span>
                  {store.storeId === access.defaultStoreId &&
                  access.stores.length > 1 ? (
                    <span className="text-sm text-muted-foreground">
                      Starts here
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-medium">
                  {getStaffRoleLabel(store.role)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            No stores. They can’t sign in to any store.
          </p>
        )}
        {showStores &&
        access &&
        access.stores.some((store) => store.role === "MANAGER") ? (
          <p
            className={cn(
              "text-sm",
              !access.catalogEditor && "text-muted-foreground",
            )}
          >
            {access.catalogEditor
              ? "Can change items and prices"
              : "Can’t change items or prices"}
          </p>
        ) : null}
      </section>

      <p className="text-sm text-muted-foreground">
        {joined
          ? `Joined ${joined}`
          : invited
            ? `Invited ${invited}`
            : "Hasn’t joined yet"}
      </p>
    </div>
  )
}
