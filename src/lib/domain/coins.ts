import type { MonthlyGiftQuota, User } from "@/lib/domain/types";

export const MONTHLY_GIFT_LIMIT = 25;

export function assertAdminCanGrantCoins(actor: User) {
  if (actor.role !== "ADMIN") {
    throw new Error("Только администратор может управлять мерчиками.");
  }
}

export function assertCanManageOrders(actor: User) {
  if (!["ADMIN", "ORDER_MANAGER"].includes(actor.role)) {
    throw new Error("Недостаточно прав для управления заказами.");
  }
}

export function assertEnoughCoins(balance: number, amount: number) {
  if (amount <= 0) {
    throw new Error("Сумма должна быть больше нуля.");
  }

  if (balance < amount) {
    throw new Error("Недостаточно мерчиков.");
  }
}

export function assertGiftTransferAllowed(params: {
  sender: User;
  recipient: User;
  amount: number;
  quota: MonthlyGiftQuota;
}) {
  const { sender, recipient, amount, quota } = params;

  if (!["EMPLOYEE", "ADMIN", "ORDER_MANAGER"].includes(sender.role)) {
    throw new Error("Благодарности доступны только сотрудникам и администраторам.");
  }

  if (sender.id === recipient.id) {
    throw new Error("Нельзя отправить коины самому себе.");
  }

  if (amount <= 0) {
    throw new Error("Сумма должна быть больше нуля.");
  }

  const nextTotal = quota.sentCoins + amount;
  if (nextTotal > MONTHLY_GIFT_LIMIT) {
    throw new Error(
      `Превышен лимит благодарностей. В месяц можно отправить максимум ${MONTHLY_GIFT_LIMIT} мерчиков.`,
    );
  }
}

export function remainingGiftCoins(quota: MonthlyGiftQuota) {
  return Math.max(MONTHLY_GIFT_LIMIT - quota.sentCoins, 0);
}
