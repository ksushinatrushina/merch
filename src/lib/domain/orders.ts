import type { CartLine, MerchItem, OrderPreview, User } from "@/lib/domain/types";

export function buildOrderPreview(params: {
  items: MerchItem[];
  cart: CartLine[];
  customer: User;
}): OrderPreview {
  const { items, cart, customer } = params;

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const lines = cart.map((line) => {
    const item = itemMap.get(line.merchItemId);

    if (!item || !item.isActive) {
      throw new Error("Один из товаров недоступен.");
    }

    if (line.quantity <= 0) {
      throw new Error("Количество должно быть больше нуля.");
    }

    if (item.stock < line.quantity) {
      throw new Error(`Недостаточно остатков для товара "${item.title}".`);
    }

    return {
      merchItemId: item.id,
      title: item.title,
      quantity: line.quantity,
      unitPrice: item.priceCoins,
      lineTotal: item.priceCoins * line.quantity,
    };
  });

  const totalCoins = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  if (customer.coinBalance < totalCoins) {
    throw new Error("Недостаточно коинов для оформления заказа.");
  }

  return {
    totalCoins,
    lines,
  };
}
