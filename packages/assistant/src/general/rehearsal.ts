import type { RehearsalTurn } from "@ewatrade/ai/rehearsal-model"
import { generalActionSchema } from "./contracts"
type PromptMessage = {
  role: string
  content: string | Array<{ type: string; text?: string }>
}
/** Provider-free development rehearsal; explicit small commands only. */
export function respondGeneralRehearsal(
  prompt: readonly PromptMessage[],
): RehearsalTurn {
  const last = prompt.at(-1)
  if (last?.role === "tool")
    return {
      kind: "text",
      text: "Check the saved records or proposal below. A proposal changes nothing until you press Confirm.",
    }
  const text =
    typeof last?.content === "string"
      ? last.content
      : (last?.content
          .filter((p) => p.type === "text")
          .map((p) => p.text ?? "")
          .join("\n") ?? "")
  const command = text.trim()
  const minor = (value: string) => Math.round(Number(value) * 100)
  if (/^read stock operations$/i.test(command)) return { kind: "tool", toolName: "readStockOperations", input: {} }
  const operationRead = /^read stock operation (\S{1,128})$/i.exec(command)
  if (operationRead?.[1]) return { kind: "tool", toolName: "readStockOperation", input: { operationId: operationRead[1] } }
  const orderAmendment = /^(cancel|amend|replace) order (\{[\s\S]+\})$/i.exec(command)
  if(orderAmendment?.[1] && orderAmendment[2]) {
    try { return {kind:"tool",toolName:"draftAction",input:generalActionSchema.parse({...JSON.parse(orderAmendment[2]),action:orderAmendment[1].toLowerCase()==="cancel"?"order_cancel":orderAmendment[1].toLowerCase()==="amend"?"order_metadata_update":"order_replace"})} }
    catch {return {kind:"text",text:"Supply the exact order, requested changes and a reason. Paid or fulfilled orders need their return or correction workflow."}}
  }
  const closeoutCreate = /^create closeout (\{[\s\S]+\})$/i.exec(command)
  if (closeoutCreate?.[1]) {
    try {
      return { kind: "tool", toolName: "draftAction", input: generalActionSchema.parse({ ...JSON.parse(closeoutCreate[1]), action: "inventory_closeout_create" }) }
    } catch {
      return { kind: "text", text: "Supply the custody identity, exact source declarations and a reason. Zero is valid; saving observations does not finalize stock." }
    }
  }
  const closeoutFinalize = /^finalize closeout (\S{1,128}) because (.{1,500})$/i.exec(command)
  if (closeoutFinalize?.[1] && closeoutFinalize[2]) return { kind: "tool", toolName: "draftAction", input: generalActionSchema.parse({ action: "inventory_closeout_finalize", closeoutId: closeoutFinalize[1], reason: closeoutFinalize[2] }) }
  if (/^read closeouts$/i.test(command)) return { kind: "tool", toolName: "readInventoryCloseouts", input: {} }
  const closeoutRead = /^read closeout (\S{1,128})$/i.exec(command)
  if (closeoutRead?.[1]) return { kind: "tool", toolName: "readInventoryCloseout", input: { closeoutId: closeoutRead[1] } }
  if (/^read transfers$/i.test(command)) return { kind: "tool", toolName: "readStockTransfers", input: {} }
  const transferRead = /^read transfer (\S{1,128})$/i.exec(command)
  if (transferRead?.[1]) return { kind: "tool", toolName: "readStockTransfer", input: { transferId: transferRead[1] } }
  const transferChange = /^(dispatch|receive|cancel) transfer (\{[\s\S]+\})$/i.exec(command)
  if (transferChange?.[1] && transferChange[2]) {
    try {
      return { kind: "tool", toolName: "draftAction", input: generalActionSchema.parse({ ...JSON.parse(transferChange[2]), action: `stock_transfer_${transferChange[1].toLowerCase()}` }) }
    } catch {
      return { kind: "text", text: "Supply the exact transfer or stock source, a quantity for dispatch or receipt, and a reason. Cancellation returns all remaining transit stock." }
    }
  }
  const stockChange = /^(adjust|correct) stock (\{[\s\S]+\})$/i.exec(command)
  if (stockChange?.[1] && stockChange[2]) {
    try {
      return { kind: "tool", toolName: "draftAction", input: generalActionSchema.parse({ ...JSON.parse(stockChange[2]), action: stockChange[1].toLowerCase() === "adjust" ? "stock_adjust" : "stock_correct" }) }
    } catch {
      return { kind: "text", text: "Supply exact stock identities, quantities and a reason. Corrections require the original operation and every movement." }
    }
  }
  const countCreate = /^create count (\{[\s\S]+\})$/i.exec(command)
  if (countCreate?.[1]) {
    try {
      return {
        kind: "tool",
        toolName: "draftAction",
        input: generalActionSchema.parse({
          ...JSON.parse(countCreate[1]),
          action: "stock_count_create",
        }),
      }
    } catch {
      return {
        kind: "text",
        text: "The count is invalid. Supply exact sources, unit observations and a reason. Zero is valid.",
      }
    }
  }
  const countFinalize = /^finalize count (\S{1,128}) because (.{1,500})$/i.exec(
    command,
  )
  if (countFinalize?.[1] && countFinalize[2])
    return {
      kind: "tool",
      toolName: "draftAction",
      input: {
        action: "stock_count_finalize",
        stockCountId: countFinalize[1],
        reason: countFinalize[2],
      },
    }
  const countRead = /^read count (\S{1,128})$/i.exec(command)
  if (countRead?.[1])
    return {
      kind: "tool",
      toolName: "readStockCount",
      input: { stockCountId: countRead[1] },
    }
  const receipt = /^receive stock (\{[\s\S]+\})$/i.exec(command)
  if (receipt?.[1]) {
    try {
      const input = generalActionSchema.parse({
        ...JSON.parse(receipt[1]),
        action: "stock_receive",
      })
      return { kind: "tool", toolName: "draftAction", input }
    } catch {
      return {
        kind: "text",
        text: "The stock receipt is invalid. Supply the exact balance source, unit, positive quantity, source and reason.",
      }
    }
  }
  const unitDraft = /^draft units (\S{1,128}) (\{[\s\S]+\})$/i.exec(command)
  if (unitDraft?.[1] && unitDraft[2]) {
    try {
      const input = generalActionSchema.parse({
        ...JSON.parse(unitDraft[2]),
        action: "product_unit_configuration_draft",
        catalogItemId: unitDraft[1],
      })
      return { kind: "tool", toolName: "draftAction", input }
    } catch {
      return {
        kind: "text",
        text: "The unit draft is invalid. Check the main unit, exact factors and unit keys.",
      }
    }
  }
  const unitPublish = /^publish units (\S{1,128})$/i.exec(command)
  if (unitPublish?.[1])
    return {
      kind: "tool",
      toolName: "draftAction",
      input: {
        action: "product_unit_configuration_publish",
        catalogItemId: unitPublish[1],
      },
    }
  const availability = /^availability (\S{1,128}) (on|off)$/i.exec(command)
  if (availability?.[1] && availability[2])
    return {
      kind: "tool",
      toolName: "draftAction",
      input: {
        action: "product_availability_update",
        offeringId: availability[1],
        isAvailable: availability[2].toLowerCase() === "on",
      },
    }
  const price =
    /^price (\S{1,128}) (\d+(?:\.\d{1,2})?) because (.{1,500})$/i.exec(command)
  if (price?.[1] && price[2] && price[3])
    return {
      kind: "tool",
      toolName: "draftAction",
      input: {
        action: "product_price_update",
        offeringId: price[1],
        priceMinor: minor(price[2]),
        reason: price[3].trim(),
      },
    }
  const editProduct =
    /^update (product|offering) (\S{1,128}) (name|description|category|sku|barcode) (.{1,2000})$/i.exec(
      command,
    )
  if (editProduct?.[1] && editProduct[2] && editProduct[3] && editProduct[4]) {
    const product = editProduct[1].toLowerCase() === "product"
    const field = editProduct[3].toLowerCase()
    const value = editProduct[4].trim()
    if (
      (product
        ? ["name", "description", "category"]
        : ["sku", "barcode"]
      ).includes(field)
    )
      return {
        kind: "tool",
        toolName: "draftAction",
        input: {
          action: product
            ? "product_details_update"
            : "product_identifiers_update",
          [product ? "catalogItemId" : "offeringId"]: editProduct[2],
          [field]:
            field !== "name" && value.toLowerCase() === "none" ? null : value,
        },
      }
  }
  const product =
    /^add product (.{1,160}) at (\d+(?:\.\d{1,2})?) per (.{1,80})$/i.exec(
      command,
    )
  if (product?.[1] && product[2] && product[3])
    return {
      kind: "tool",
      toolName: "draftAction",
      input: {
        action: "product_create",
        name: product[1].trim(),
        canonicalUnitName: product[3].trim(),
        priceMinor: minor(product[2]),
      },
    }
  const itemTotalSale =
    /^sell (\d+(?:\.\d{1,6})?) of (\S{1,128}) for total (\d+(?:\.\d{1,2})?)$/i.exec(
      command,
    )
  if (itemTotalSale?.[1] && itemTotalSale[2] && itemTotalSale[3])
    return {
      kind: "tool",
      toolName: "draftAction",
      input: {
        action: "order_create",
        lines: [
          {
            offeringId: itemTotalSale[2],
            quantity: itemTotalSale[1],
            enteredTotalMinor: minor(itemTotalSale[3]),
          },
        ],
      },
    }
  const sale =
    /^sell (\d+(?:\.\d{1,6})?) of (\S{1,128}) at (\d+(?:\.\d{1,2})?)(?: paid (\d+(?:\.\d{1,2})?) (cash|card|pos|bank_transfer|other))?(?: customer (\S{1,128}))?$/i.exec(
      command,
    )
  if (sale?.[1] && sale[2] && sale[3])
    return {
      kind: "tool",
      toolName: "draftAction",
      input: {
        action: "order_create",
        ...(sale[6] ? { customerId: sale[6] } : {}),
        ...(sale[4] && sale[5]
          ? {
              initialPayment: {
                amountMinor: minor(sale[4]),
                method: sale[5].toLowerCase(),
              },
            }
          : {}),
        lines: [
          {
            offeringId: sale[2],
            quantity: sale[1],
            expectedFixedPriceMinor: minor(sale[3]),
          },
        ],
      },
    }
  const payment =
    /^pay (\S{1,128}) (\d+(?:\.\d{1,2})?) (cash|card|pos|bank_transfer|other)$/i.exec(
      command,
    )
  if (payment?.[1] && payment[2] && payment[3])
    return {
      kind: "tool",
      toolName: "draftAction",
      input: {
        action: "payment_record",
        orderId: payment[1],
        amountMinor: minor(payment[2]),
        method: payment[3].toLowerCase(),
      },
    }
  const totals = /^stock totals(?: item (\S{1,128}))?$/i.exec(command)
  if (totals)
    return {
      kind: "tool",
      toolName: "readInventoryTotals",
      input: totals[1] ? { catalogItemId: totals[1] } : {},
    }
  const balances =
    /^stock balances(?: item (\S{1,128}))?(?: after (\S{1,128}))?$/i.exec(
      command,
    )
  if (balances)
    return {
      kind: "tool",
      toolName: "readInventoryBalances",
      input: {
        ...(balances[1] ? { catalogItemId: balances[1] } : {}),
        ...(balances[2] ? { cursor: balances[2] } : {}),
      },
    }
  const history =
    /^item (orders|activity) (\S{1,100})(?: category (all|catalog|orders|stock))?$/i.exec(
      command,
    )
  if (history?.[1])
    return {
      kind: "tool",
      toolName: "readCatalogHistory",
      input: {
        mode: history[1].toLowerCase(),
        itemId: history[2],
        category: history[3]?.toLowerCase() ?? "all",
      },
    }
  const item = /^read item (\S{1,128})$/i.exec(command)
  if (item?.[1])
    return {
      kind: "tool",
      toolName: "readCatalogItem",
      input: { itemId: item[1] },
    }
  const order = /^read order (\S{1,128})$/i.exec(command)
  if (order?.[1])
    return { kind: "tool", toolName: "readOrder", input: { orderId: order[1] } }
  const orderLookup =
    /^lookup orders (customer|phone|number) (\S{1,128})(?: after (\S{1,128}))?$/i.exec(
      command,
    )
  if (orderLookup?.[1] && orderLookup[2])
    return {
      kind: "tool",
      toolName: "lookupOpenOrders",
      input: {
        [orderLookup[1].toLowerCase() === "customer"
          ? "customerId"
          : orderLookup[1].toLowerCase() === "phone"
            ? "phone"
            : "orderNumber"]: orderLookup[2],
        ...(orderLookup[3] ? { cursor: orderLookup[3] } : {}),
      },
    }
  const catalogPage =
    /^list catalog(?: matching (.{1,160}?))?(?: after (\S{1,128}))?$/i.exec(
      command,
    )
  if (catalogPage)
    return {
      kind: "tool",
      toolName: "readCatalogPage",
      input: {
        ...(catalogPage[1] ? { query: catalogPage[1] } : {}),
        ...(catalogPage[2] ? { cursor: catalogPage[2] } : {}),
      },
    }
  const receivables =
    /^list receivables(?: matching (.{1,160}?))?(?: after (\S{1,128}))?$/i.exec(
      command,
    )
  if (receivables)
    return {
      kind: "tool",
      toolName: "readReceivables",
      input: {
        ...(receivables[1] ? { query: receivables[1] } : {}),
        ...(receivables[2] ? { cursor: receivables[2] } : {}),
      },
    }
  const customerPage =
    /^list customers(?: matching (.{1,160}?))?(?: after (\S{1,128}))?$/i.exec(
      command,
    )
  if (customerPage)
    return {
      kind: "tool",
      toolName: "readCustomers",
      input: {
        ...(customerPage[1] ? { query: customerPage[1] } : {}),
        ...(customerPage[2] ? { cursor: customerPage[2] } : {}),
      },
    }
  if (/^count order contacts$/i.test(command))
    return { kind: "tool", toolName: "readOrderContactCount", input: {} }
  if (/^count stores$/i.test(command))
    return { kind: "tool", toolName: "readStoreCount", input: {} }
  const customerCount = /^count customers(?: matching (.{1,160}))?$/i.exec(
    command,
  )
  if (customerCount)
    return {
      kind: "tool",
      toolName: "readCustomerCount",
      input: customerCount[1] ? { query: customerCount[1] } : {},
    }
  const catalogCount =
    /^count (products|services|items)(?: (active|archived|draft))?(?: named (.{1,160}))?$/i.exec(
      command,
    )
  if (catalogCount?.[1])
    return {
      kind: "tool",
      toolName: "readCatalogCount",
      input: {
        ...(catalogCount[1].toLowerCase() !== "items"
          ? {
              kind:
                catalogCount[1].toLowerCase() === "products"
                  ? "product"
                  : "service",
            }
          : {}),
        ...(catalogCount[2] ? { status: catalogCount[2].toLowerCase() } : {}),
        ...(catalogCount[3] ? { nameContains: catalogCount[3] } : {}),
      },
    }
  const lowStock =
    /^low stock at most (\d+(?:\.\d{1,6})?)(?: after (\S{1,128}))?(?: item (\S{1,128}))?$/i.exec(
      command,
    )
  if (lowStock?.[1])
    return {
      kind: "tool",
      toolName: "readLowStock",
      input: {
        threshold: lowStock[1],
        ...(lowStock[2] ? { afterOfferingId: lowStock[2] } : {}),
        ...(lowStock[3] ? { catalogItemId: lowStock[3] } : {}),
      },
    }
  const orderSummary = /^order summary(?: customer (\S{1,128}))?$/i.exec(
    command,
  )
  if (orderSummary)
    return {
      kind: "tool",
      toolName: "readOrderSummary",
      input: orderSummary[1] ? { customerId: orderSummary[1] } : {},
    }
  const stock = /^read stock (\S{1,128})$/i.exec(command)
  if (stock?.[1])
    return {
      kind: "tool",
      toolName: "readOfferingStock",
      input: { offeringId: stock[1] },
    }
  const datedRead = /^(sales|orders) from (\S+) to (\S+)$/i.exec(command)
  if (datedRead?.[1] && datedRead[2] && datedRead[3]) {
    // Require explicit instants; never infer the merchant's timezone from the host.
    const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
    if (
      instant.test(datedRead[2]) &&
      instant.test(datedRead[3]) &&
      Number.isFinite(Date.parse(datedRead[2])) &&
      Date.parse(datedRead[2]) < Date.parse(datedRead[3])
    )
      return {
        kind: "tool",
        toolName:
          datedRead[1].toLowerCase() === "sales"
            ? "readSalesSummary"
            : "readOrders",
        input: { createdAfter: datedRead[2], createdBefore: datedRead[3] },
      }
  }
  if (/^sales today$/i.test(command)) {
    const start = new Date()
    start.setUTCHours(0, 0, 0, 0)
    return {
      kind: "tool",
      toolName: "readSalesSummary",
      input: {
        createdAfter: start.toISOString(),
        createdBefore: new Date(start.getTime() + 86_400_000).toISOString(),
      },
    }
  }
  const readCustomer = /^read customer (\S{1,128})$/i.exec(command)
  if (readCustomer?.[1])
    return {
      kind: "tool",
      toolName: "readCustomer",
      input: { customerId: readCustomer[1] },
    }
  const updateCustomer =
    /^update customer (\S{1,128}) (name|phone|email) (.{1,160})$/i.exec(command)
  if (updateCustomer?.[1] && updateCustomer[2] && updateCustomer[3]) {
    const value = updateCustomer[3].trim()
    return {
      kind: "tool",
      toolName: "draftAction",
      input: {
        action: "customer_update",
        customerId: updateCustomer[1],
        [updateCustomer[2].toLowerCase()]:
          value.toLowerCase() === "none" ? null : value,
      },
    }
  }
  const customer = /^add customer ([^\n]{1,160})$/i.exec(text.trim())
  if (customer?.[1])
    return {
      kind: "tool",
      toolName: "draftAction",
      input: { action: "customer_create", name: customer[1].trim() },
    }
  const search = /^search (.{2,160})$/i.exec(text.trim())
  if (search?.[1])
    return {
      kind: "tool",
      toolName: "searchRecords",
      input: { query: search[1] },
    }
  return {
    kind: "text",
    text: "This is the Development rehearsal; no live AI provider is called. Try ‘search rice’, ‘add customer Amina’, ‘add product Eggs at 200 per Piece’, ‘read item <itemId>’, ‘sell 2 of <offeringId> at 200’, ‘read order <orderId>’, ‘pay <orderId> 300 cash’, ‘read customer <customerId>’, ‘update customer <customerId> phone 0803… (or none)’ or ‘sales today’.",
  }
}
