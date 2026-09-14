"use client";
import { Data, money, number } from "@/lib/domain";
import { eventCost, unitCost, usedQuantity } from "@/lib/purchases";
export type ItemSelection = { purchase_id: string; quantity: number };
export function EventPurchases({
  data,
  eventId,
  items,
  onChange,
}: {
  data: Data;
  eventId?: string;
  items: ItemSelection[];
  onChange: (items: ItemSelection[]) => void;
}) {
  const goods = items.reduce((sum, i) => {
    const p = data.purchases.find((p) => p.id === i.purchase_id);
    return sum + (p ? unitCost(p) * i.quantity : 0);
  }, 0);
  const direct = eventId ? eventCost(data, eventId).direct : 0;
  return (
    <fieldset className="event-purchases">
      <legend>사용 물품</legend>
      <p className="form-note">
        구매 건별로 실제 사용 수량을 입력하세요. 미사용·반납분은 수량을 줄이면
        됩니다.
      </p>
      <div className="purchase-items">
        {items.map((item, index) => {
          const purchase = data.purchases.find(
            (p) => p.id === item.purchase_id,
          );
          const available = purchase
            ? purchase.quantity - usedQuantity(data, purchase.id, eventId)
            : 0;
          const update = (patch: Partial<ItemSelection>) =>
            onChange(
              items.map((i, n) => (n === index ? { ...i, ...patch } : i)),
            );
          return (
            <div className="purchase-item" key={index}>
              <select
                aria-label={`사용 물품 ${index + 1}`}
                required
                value={item.purchase_id}
                onChange={(e) =>
                  update({ purchase_id: e.target.value, quantity: 1 })
                }
              >
                <option value="">구매 물품 선택</option>
                {data.purchases
                  .filter(
                    (p) =>
                      !p.deleted_at &&
                      !items.some(
                        (i, n) => n !== index && i.purchase_id === p.id,
                      ),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} · {p.purchased_on} · {money(unitCost(p))}/개
                    </option>
                  ))}
              </select>
              <input
                aria-label={`사용 수량 ${index + 1}`}
                type="number"
                required
                min="1"
                step="1"
                max={available}
                value={item.quantity || ""}
                onChange={(e) => update({ quantity: Number(e.target.value) })}
              />
              <span>
                {number(available)}개 중 ·{" "}
                {money(purchase ? unitCost(purchase) * item.quantity : 0)}
              </span>
              <button
                type="button"
                aria-label={`물품 ${index + 1} 제거`}
                onClick={() => onChange(items.filter((_, n) => n !== index))}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        disabled={
          !data.purchases.some(
            (p) =>
              !p.deleted_at &&
              !items.some((i) => i.purchase_id === p.id) &&
              p.quantity > usedQuantity(data, p.id, eventId),
          )
        }
        onClick={() => onChange([...items, { purchase_id: "", quantity: 1 }])}
      >
        ＋ 물품
      </button>
      {!data.purchases.some((p) => !p.deleted_at) && (
        <p className="form-note">
          구매 페이지에서 구매 목록을 먼저 등록하세요.
        </p>
      )}
      <p className="form-note">
        물품 원가 {money(goods)} + 직접 지급 비용 {money(direct)} ={" "}
        <b>이벤트 원가 {money(goods + direct)}</b>
      </p>
      <small>
        이벤트 삭제·취소만으로 사용 수량이 돌아오지는 않습니다. 반납 시 여기서
        제거하세요.
      </small>
    </fieldset>
  );
}
