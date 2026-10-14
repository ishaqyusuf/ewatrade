import {
  countMyBusinessNotifications,
  listMyBusinessNotifications,
  markAllMyBusinessNotificationsRead,
  readMyNotificationPreferences,
  readNotificationPolicy,
  readNotificationSubscriptions,
  updateMyBusinessNotificationReceipts,
  updateMyNotificationPreferences,
  updateNotificationPolicy,
  updateNotificationSubscription,
  withNotifications,
} from "@ewatrade/db/queries"
import type { Prisma } from "@ewatrade/db/types"
import {
  businessNotificationListInput,
  businessNotificationMarkAllInput,
  businessNotificationPolicyInput,
  businessNotificationPreferenceInput,
  businessNotificationReceiptInput,
  businessNotificationSubscriptionInput,
  businessNotificationSubscriptionsInput,
} from "@ewatrade/notifications/business-events"
import { TRPCError } from "@trpc/server"
import { withBusinessActivityAvailability } from "../business-activity-availability"
import { type TRPCContext, createTRPCRouter, protectedProcedure } from "../init"

function run<T>(
  ctx: TRPCContext,
  action: (
    tx: Prisma.TransactionClient,
    viewer: { tenantId: string; viewerUserId: string },
  ) => Promise<T>,
) {
  const tenantId = ctx.tenantContext?.tenant.id
  const viewerUserId = ctx.session?.user.id
  if (!tenantId || !viewerUserId) throw new TRPCError({ code: "UNAUTHORIZED" })
  return withBusinessActivityAvailability(() =>
    withNotifications(ctx.db, (tx) =>
      action(tx, {
        tenantId,
        viewerUserId,
      }),
    ),
  )
}
export const businessNotificationsRouter = createTRPCRouter({
  listMine: protectedProcedure
    .input(businessNotificationListInput)
    .query(({ ctx, input }) =>
      run(ctx, (tx, viewer) => listMyBusinessNotifications(tx, viewer, input)),
    ),
  unreadCount: protectedProcedure.query(({ ctx }) =>
    run(ctx, countMyBusinessNotifications),
  ),
  markRead: protectedProcedure
    .input(businessNotificationReceiptInput)
    .mutation(({ ctx, input }) =>
      run(ctx, (tx, viewer) =>
        updateMyBusinessNotificationReceipts(tx, viewer, "read", input),
      ),
    ),
  archive: protectedProcedure
    .input(businessNotificationReceiptInput)
    .mutation(({ ctx, input }) =>
      run(ctx, (tx, viewer) =>
        updateMyBusinessNotificationReceipts(tx, viewer, "archive", input),
      ),
    ),
  markAllRead: protectedProcedure
    .input(businessNotificationMarkAllInput)
    .mutation(({ ctx, input }) =>
      run(ctx, (tx, viewer) =>
        markAllMyBusinessNotificationsRead(tx, viewer, input),
      ),
    ),
  myPreferences: protectedProcedure.query(({ ctx }) =>
    run(ctx, readMyNotificationPreferences),
  ),
  updateMyPreferences: protectedProcedure
    .input(businessNotificationPreferenceInput)
    .mutation(({ ctx, input }) =>
      run(ctx, (tx, viewer) =>
        updateMyNotificationPreferences(tx, viewer, input),
      ),
    ),
  policy: protectedProcedure.query(({ ctx }) =>
    run(ctx, readNotificationPolicy),
  ),
  updatePolicy: protectedProcedure
    .input(businessNotificationPolicyInput)
    .mutation(({ ctx, input }) =>
      run(ctx, (tx, viewer) => updateNotificationPolicy(tx, viewer, input)),
    ),
  subscriptions: protectedProcedure
    .input(businessNotificationSubscriptionsInput)
    .query(({ ctx, input }) =>
      run(ctx, (tx, viewer) =>
        readNotificationSubscriptions(tx, viewer, input),
      ),
    ),
  updateSubscription: protectedProcedure
    .input(businessNotificationSubscriptionInput)
    .mutation(({ ctx, input }) =>
      run(ctx, (tx, viewer) =>
        updateNotificationSubscription(tx, viewer, input),
      ),
    ),
})
