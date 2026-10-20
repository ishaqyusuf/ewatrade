import { StaffRoleBadge, StaffStatus } from "@/components/tables/staff/format"
import type { StaffAccessResponse } from "@/hooks/use-staff-access"
import {
  type StaffMemberRow,
  getStaffRoleLabel,
  getStaffStatusKey,
} from "@/lib/staff-management"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"
import { Mail01Icon, PauseCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

type Member = RouterOutputs["retailOps"]["staffDirectoryMember"]
type Invitation = RouterOutputs["retailOps"]["staffInvitations"]["data"][number]

const dateFormat = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" })
function formatDate(value: Date | string | null | undefined) {
  return value ? dateFormat.format(new Date(value)) : "Not yet"
}

/** The member as a Staff page row, so status and actions read the same everywhere. */
export function memberAsStaffRow(
  member: Member,
  access: StaffAccessResponse | undefined,
  invitation: Invitation | undefined,
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
    access: {
      allStores:
        ["OWNER", "ADMIN"].includes(member.role) ||
        record?.staffAccessMode === "LEGACY",
      catalogEditor: record?.catalogEditor ?? false,
      defaultStoreId: record?.retailOpsStaffProfile?.defaultStoreId ?? null,
      stores: (record?.staffStoreAssignments ?? []).map((row) => ({
        storeId: row.storeId,
        role: row.role,
        storeName:
          access?.stores.find((store) => store.id === row.storeId)?.name ??
          "Store no longer available",
      })),
      invitationId: invitation?.id ?? null,
      invitationExpiresAt: invitation?.expiresAt
        ? new Date(invitation.expiresAt).toISOString()
        : null,
    },
  }
}

export function StaffMemberContent({
  row,
  showStores,
  onOpenInvitation,
}: {
  row: StaffMemberRow
  showStores: boolean
  onOpenInvitation?: () => void
}) {
  const key = getStaffStatusKey(row)
  const access = row.access
  return (
    <div className="grid gap-6 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <StaffRoleBadge role={row.role} />
        <StaffStatus member={row} showDetail={false} />
      </div>
      {key === "suspended" ? (
        <div className="flex gap-2.5 bg-muted p-3">
          <HugeiconsIcon
            icon={PauseCircleIcon}
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <p>
            <span className="font-medium">Suspended.</span>{" "}
            <span className="text-muted-foreground">
              They can’t sign in to any store until you reactivate them.
            </span>
          </p>
        </div>
      ) : key === "invited" || key === "expired" ? (
        <div
          className={
            key === "expired"
              ? "flex gap-2.5 bg-warning p-3"
              : "flex gap-2.5 bg-muted p-3"
          }
        >
          <HugeiconsIcon
            icon={Mail01Icon}
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <div className="grid gap-1">
            <p className="font-medium">
              {key === "expired"
                ? `Invite expired ${formatDate(access?.invitationExpiresAt)}`
                : `Invite sent ${formatDate(row.invitedAt)}`}
            </p>
            <p className="text-muted-foreground">
              {key === "expired"
                ? "Send a new invite so they can join."
                : `Not accepted yet. The link expires ${formatDate(access?.invitationExpiresAt)}.`}
            </p>
            {onOpenInvitation ? (
              <Button
                type="button"
                variant="link"
                className="h-auto justify-self-start p-0"
                onClick={onOpenInvitation}
              >
                See invite
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {showStores && access ? (
        <section className="grid gap-2">
          <h3 className="font-medium">Stores</h3>
          {access.allStores ? (
            <p>Every store</p>
          ) : access.stores.length ? (
            <ul className="grid gap-1.5">
              {access.stores.map((store) => (
                <li key={store.storeId} className="flex justify-between gap-3">
                  <span>
                    {store.storeName}
                    {store.storeId === access.defaultStoreId ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · Starts here
                      </span>
                    ) : null}
                  </span>
                  <span className="font-medium">
                    {getStaffRoleLabel(store.role)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              No stores. They can’t open any store.
            </p>
          )}
          {row.role === "MANAGER" ? (
            <p className="text-muted-foreground">
              Can edit Products and prices:{" "}
              {access.catalogEditor ? "Yes" : "No"}
            </p>
          ) : null}
        </section>
      ) : null}
      <section className="grid gap-2">
        <h3 className="font-medium">Dates</h3>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5">
          <dt className="text-muted-foreground">Invited</dt>
          <dd>{formatDate(row.invitedAt)}</dd>
          <dt className="text-muted-foreground">Joined</dt>
          <dd>{formatDate(row.acceptedAt)}</dd>
        </dl>
      </section>
    </div>
  )
}
