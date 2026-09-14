import { Cost, Data, MarketingEvent, Purchase, datePart } from "./domain";

// Activity-only allocation, never passed into the global cash ledger.
export function eventUsageCosts(d: Data, event: MarketingEvent): Cost[] {
  return [
    {
      id: `event-goods:${event.id}`,
      workspace_id: event.workspace_id,
      deleted_at: null,
      expense_date: datePart(event.starts_at),
      amount: eventCost(d, event.id).goods,
      title: "사용 물품 원가",
      category: "goods",
      payment_status: "paid",
      notes: null,
      grid_entry: false,
      event_id: event.id,
      channel_id: null,
      content_id: null,
      promotion_id: null,
    },
  ];
}

export const usedQuantity = (
  d: Data,
  purchaseId: string,
  exceptEvent?: string,
) =>
  d.eventItems
    .filter(
      (i) =>
        !i.deleted_at &&
        i.purchase_id === purchaseId &&
        i.event_id !== exceptEvent,
    )
    .reduce((sum, i) => sum + i.quantity, 0);
export const unitCost = (p: Purchase) => p.total_amount / p.quantity;
export function eventCost(d: Data, eventId: string) {
  const goods = d.eventItems
    .filter((i) => !i.deleted_at && i.event_id === eventId)
    .reduce((sum, i) => {
      const p = d.purchases.find((p) => p.id === i.purchase_id);
      return sum + (p ? unitCost(p) * i.quantity : 0);
    }, 0);
  const direct = d.costs
    .filter(
      (c) =>
        !c.deleted_at && c.event_id === eventId && c.payment_status === "paid",
    )
    .reduce((sum, c) => sum + c.amount, 0);
  return { goods, direct, total: goods + direct };
}
// Purchases count once on their payment date. Consumption never creates cash expenses.
export function withPurchaseCosts(d: Data): Data {
  return {
    ...d,
    costs: [
      ...d.costs.filter((c) => !c.purchase_id),
      ...d.purchases
        .filter((p) => !p.deleted_at)
        .map((p) => ({
          id: `purchase:${p.id}`,
          purchase_id: p.id,
          workspace_id: p.workspace_id,
          deleted_at: null,
          expense_date: p.purchased_on,
          category: "goods",
          amount: p.total_amount,
          payment_status: "paid",
          title: p.title,
          notes: p.notes,
          grid_entry: false,
          channel_id: null,
          content_id: null,
          promotion_id: null,
          event_id: null,
        })),
    ],
  };
}
