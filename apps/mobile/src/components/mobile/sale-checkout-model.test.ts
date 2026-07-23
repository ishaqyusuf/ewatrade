import { describe, expect, it } from "bun:test";

import { saleLineTotalMinor, salePaymentSummary } from "./sale-checkout-model";

describe("sale checkout model", () => {
  it("calculates exact line totals in minor currency units", () => {
    expect(saleLineTotalMinor(750_000, "2")).toBe(1_500_000);
    expect(saleLineTotalMinor(750_000, "0.5")).toBe(375_000);
  });

  it("rejects missing, non-positive, and fractional minor totals", () => {
    expect(saleLineTotalMinor(100, "")).toBeNull();
    expect(saleLineTotalMinor(100, "0")).toBeNull();
    expect(saleLineTotalMinor(1, "0.5")).toBeNull();
  });

  it("derives pending, partial, and paid balances", () => {
    expect(salePaymentSummary(10_000, "")).toMatchObject({
      balanceDueMinor: 10_000,
      paymentState: "pending",
      receivedMinor: 0,
    });
    expect(salePaymentSummary(10_000, "25")).toMatchObject({
      balanceDueMinor: 7_500,
      paymentState: "partially_paid",
      receivedMinor: 2_500,
    });
    expect(salePaymentSummary(10_000, "100")).toMatchObject({
      balanceDueMinor: 0,
      paymentState: "paid",
      receivedMinor: 10_000,
    });
  });

  it("rejects payment above the order total", () => {
    expect(salePaymentSummary(10_000, "100.01").error).toBe(
      "Amount received cannot exceed the order total.",
    );
  });
});
