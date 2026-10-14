import {
  getBusinessActivity,
  getBusinessActivityFilters,
  listBusinessActivity,
} from "@ewatrade/db/queries"
import {
  businessActivityFiltersInput,
  businessActivityGetInput,
  businessActivityListInput,
} from "../../schemas/business-activity"
import { withBusinessActivityAvailability as read } from "../business-activity-availability"
import { createTRPCRouter, protectedProcedure } from "../init"

export const activityRouter = createTRPCRouter({
  listPage: protectedProcedure
    .input(businessActivityListInput)
    .query(({ ctx, input }) =>
      read(() =>
        listBusinessActivity(
          ctx.db,
          {
            tenantId: ctx.tenantContext.tenant.id,
            viewerUserId: ctx.session.user.id,
          },
          input,
        ),
      ),
    ),
  get: protectedProcedure
    .input(businessActivityGetInput)
    .query(({ ctx, input }) =>
      read(() =>
        getBusinessActivity(
          ctx.db,
          {
            tenantId: ctx.tenantContext.tenant.id,
            viewerUserId: ctx.session.user.id,
          },
          input.key,
        ),
      ),
    ),
  filters: protectedProcedure
    .input(businessActivityFiltersInput)
    .query(({ ctx, input }) =>
      read(() =>
        getBusinessActivityFilters(
          ctx.db,
          {
            tenantId: ctx.tenantContext.tenant.id,
            viewerUserId: ctx.session.user.id,
          },
          input,
        ),
      ),
    ),
})
