import { readStaffStoreAccess } from "../staff-store-access"
import {
  type BookingTransaction,
  ServiceCommerceBookingError,
  assertBookingMember,
} from "./shared"

/** Fresh native role/attendant ceiling plus persisted active scope and exact Store grant. */
export async function assertStaffBookingCommandScopeInTransaction(
  tx: BookingTransaction,
  input: { actorUserId: string; tenantId: string; storeId: string },
) {
  const member = await assertBookingMember(tx, input)
  const [tenant, store, access] = await Promise.all([
    tx.tenant.findFirst({
      where: { id: input.tenantId, isActive: true },
      select: { id: true, isActive: true },
    }),
    tx.store.findFirst({
      where: { id: input.storeId, tenantId: input.tenantId, status: "ACTIVE" },
      select: { id: true, tenantId: true, status: true },
    }),
    readStaffStoreAccess(tx, member.id, input.tenantId),
  ])
  if (
    !tenant ||
    tenant.id !== input.tenantId ||
    !tenant.isActive ||
    !store ||
    store.id !== input.storeId ||
    store.tenantId !== input.tenantId ||
    store.status !== "ACTIVE" ||
    !access ||
    access.status !== "ACTIVE" ||
    access.role !== member.role ||
    !["OWNER", "ADMIN", "MANAGER", "OPERATOR", "CASHIER"].includes(
      access.role,
    ) ||
    !["LEGACY", "SCOPED"].includes(access.staffAccessMode) ||
    !Number.isSafeInteger(access.staffAccessRevision) ||
    access.staffAccessRevision < 1 ||
    (access.staffAccessMode === "SCOPED" &&
      !["OWNER", "ADMIN"].includes(access.role) &&
      !access.staffStoreAssignments.some(
        (row) => row.storeId === input.storeId && row.status === "ACTIVE",
      ))
  )
    throw new ServiceCommerceBookingError(
      "BOOKING_FORBIDDEN",
      "Current accepted Store booking access is required.",
    )
}
