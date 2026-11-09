import {
  adjustFinanceShipmentLineCost,
  closeFinanceShipment,
  confirmFinanceShipment,
  createFinanceShipment,
  getFinanceShipment,
  listFinanceShipments,
  mapFinanceShipmentLine,
  receiveFinanceShipment,
  reopenFinanceShipment,
  updateFinanceShipmentDraft,
} from "@ewatrade/db/queries"
import {
  financeShipmentAdjustSchema,
  financeShipmentCloseSchema,
  financeShipmentCreateSchema,
  financeShipmentDetailSchema,
  financeShipmentMapLineSchema,
  financeShipmentReceiveSchema,
  financeShipmentRevisionSchema,
  financeShipmentUpdateSchema,
  financeShipmentsSchema,
} from "../../schemas/finance-shipments"
import { financeProcedure } from "../finance-procedure"
import { createTRPCRouter } from "../init"

/** Incoming shipments; receipts reuse the canonical received purchase owner. */
export const financeShipmentsRouter = createTRPCRouter({
  create: financeProcedure
    .input(financeShipmentCreateSchema)
    .mutation(({ ctx, input }) =>
      createFinanceShipment(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  update: financeProcedure
    .input(financeShipmentUpdateSchema)
    .mutation(({ ctx, input }) =>
      updateFinanceShipmentDraft(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  confirm: financeProcedure
    .input(financeShipmentRevisionSchema)
    .mutation(({ ctx, input }) =>
      confirmFinanceShipment(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  reopen: financeProcedure
    .input(financeShipmentRevisionSchema)
    .mutation(({ ctx, input }) =>
      reopenFinanceShipment(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  mapLine: financeProcedure
    .input(financeShipmentMapLineSchema)
    .mutation(({ ctx, input }) =>
      mapFinanceShipmentLine(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  adjustLineCost: financeProcedure
    .input(financeShipmentAdjustSchema)
    .mutation(({ ctx, input }) =>
      adjustFinanceShipmentLineCost(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  receive: financeProcedure
    .input(financeShipmentReceiveSchema)
    .mutation(({ ctx, input }) =>
      receiveFinanceShipment(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  close: financeProcedure
    .input(financeShipmentCloseSchema)
    .mutation(({ ctx, input }) =>
      closeFinanceShipment(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  detail: financeProcedure
    .input(financeShipmentDetailSchema)
    .query(({ ctx, input }) =>
      getFinanceShipment(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  list: financeProcedure
    .input(financeShipmentsSchema)
    .query(({ ctx, input }) =>
      listFinanceShipments(ctx.db, { ...input, ...ctx.financeActor }),
    ),
})
