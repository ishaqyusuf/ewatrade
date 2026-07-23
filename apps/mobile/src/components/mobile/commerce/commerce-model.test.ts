import { describe, expect, test } from "bun:test";
import {
  type CommercialOrder,
  buildCommerceCustomers,
  commerceOrderTone,
  commercePaymentTone,
  findCustomerByOrderId,
} from "./commerce-model";

function order(
  input: Partial<CommercialOrder> & Pick<CommercialOrder, "id">,
): CommercialOrder {
  return {
    amountPaidMinor: 0,
    balanceDueMinor: 1_000,
    clientOrderId: `client-${input.id}`,
    createdAt: new Date("2026-07-22T10:00:00.000Z"),
    currencyCode: "NGN",
    customerEmail: "AMINA@example.com",
    customerName: "Amina Bello",
    customerPhone: "+234 803 555 0142",
    discountMinor: 0,
    lines: [],
    notes: null,
    orderNumber: `EO-${input.id}`,
    payments: [],
    paymentStatus: "PENDING",
    serviceChargeMinor: 0,
    status: "CONFIRMED",
    storeId: "store-1",
    subtotalMinor: 1_000,
    taxMinor: 0,
    totalMinor: 1_000,
    ...input,
  };
}

describe("production commerce customer projection", () => {
  test("groups normalized customer identity and merges pending device work", () => {
    const customers = buildCommerceCustomers(
      [
        order({ id: "order-1" }),
        order({
          createdAt: new Date("2026-07-21T10:00:00.000Z"),
          customerEmail: "amina@example.com",
          id: "order-2",
          totalMinor: 2_000,
        }),
      ],
      [
        {
          clientCommandId: "pending-1",
          createdAtClient: new Date("2026-07-22T11:00:00.000Z"),
          customerEmail: "amina@example.com",
          customerName: "Amina Bello",
          lineCount: 2,
        },
      ],
    );

    expect(customers).toHaveLength(1);
    expect(customers[0]?.orders).toHaveLength(2);
    expect(customers[0]?.pendingOrders).toHaveLength(1);
    expect(customers[0]?.currencyTotals).toEqual([
      { currencyCode: "NGN", totalMinor: 3_000 },
    ]);
    expect(findCustomerByOrderId(customers, "order-2")?.name).toBe(
      "Amina Bello",
    );
  });

  test("keeps unlike currencies separate instead of adding them", () => {
    const [customer] = buildCommerceCustomers([
      order({ id: "order-ngn" }),
      order({ currencyCode: "USD", id: "order-usd", totalMinor: 500 }),
    ]);

    expect(customer?.currencyTotals).toEqual([
      { currencyCode: "NGN", totalMinor: 1_000 },
      { currencyCode: "USD", totalMinor: 500 },
    ]);
  });
});

describe("production commerce tones", () => {
  test("maps payment and order states to semantic tones", () => {
    expect(commercePaymentTone("PAID")).toBe("success");
    expect(commercePaymentTone("PARTIALLY_PAID")).toBe("warning");
    expect(commerceOrderTone("COMPLETED")).toBe("success");
    expect(commerceOrderTone("CANCELLED")).toBe("destructive");
  });
});
