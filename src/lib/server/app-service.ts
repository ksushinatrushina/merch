import "server-only";

import { assertAdminCanGrantCoins, assertCanManageOrders, assertGiftTransferAllowed } from "@/lib/domain/coins";
import { buildOrderPreview } from "@/lib/domain/orders";
import type { AppSnapshot, ReactionKey } from "@/lib/app-types";
import type { MerchItem, User } from "@/lib/domain/types";
import { buildSnapshot, readAppState, resetAppState, updateAppState } from "@/lib/server/app-store";
import { currentUser } from "@/lib/mock-data";
import { formatEmployees, formatMerchiki, formatOrders } from "@/lib/russian";

const employeeId = currentUser.id;
const APP_TIMEZONE = "Europe/Luxembourg";

function nowDateLabel() {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: APP_TIMEZONE,
  }).format(new Date());
}

function nowOrderDateLabel() {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: APP_TIMEZONE,
  }).format(new Date());
}

function findUserName(snapshot: AppSnapshot, userId: string) {
  return snapshot.users.find((user) => user.id === userId)?.name ?? "Сотрудник";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function requireAdmin(user: User | undefined) {
  if (!user || user.role !== "ADMIN") {
    throw new Error("Недостаточно прав для этого действия.");
  }
}

function requireOrderManagerAccess(user: User | undefined) {
  if (!user) {
    throw new Error("Недостаточно прав для этого действия.");
  }
  assertCanManageOrders(user);
}

export async function authenticateUser(input: { username: string; password: string }) {
  const state = await readAppState();
  const username = input.username.trim().toLowerCase();
  const password = input.password.trim();
  const user = state.users.find(
    (entry) =>
      (entry.username ?? "").trim().toLowerCase() === username &&
      (entry.password ?? "").trim() === password,
  );

  if (!user) {
    throw new Error("Неверный логин или пароль.");
  }

  return {
    user,
    snapshot: buildSnapshot(state, user.id),
  };
}

export async function getAppSnapshot(userId = employeeId) {
  const state = await readAppState();
  return buildSnapshot(state, userId);
}

export async function searchEmployees(input: { query?: string; limit?: number }): Promise<User[]> {
  const state = await readAppState();
  const normalizedQuery = input.query?.trim().toLowerCase() ?? "";
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);

  const employees = state.users;
  if (!normalizedQuery) {
    return employees.slice(0, limit);
  }

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);

  return employees
    .filter((user) => {
      const haystack = `${user.name} ${user.email}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, limit);
}

export async function resetAppModel(userId = employeeId) {
  const state = await resetAppState();
  return buildSnapshot(state, userId);
}

export async function sendGift(input: {
  senderId: string;
  recipientId: string;
  amount: number;
  reason: string;
}) {
  return updateAppState(async (state) => {
    const sender = state.users.find((user) => user.id === input.senderId);
    const recipient = state.users.find((user) => user.id === input.recipientId);

    if (!sender || !recipient) {
      throw new Error("Не найден отправитель или получатель.");
    }

    assertGiftTransferAllowed({
      sender,
      recipient,
      amount: input.amount,
      quota:
        state.quotas?.[sender.id] ??
        state.quota ??
        {
          userId: sender.id,
          year: new Date().getUTCFullYear(),
          month: new Date().getUTCMonth() + 1,
          sentCoins: 0,
        },
    });

    recipient.coinBalance += input.amount;
    state.quotas ??= {};
    state.quotas[sender.id] = {
      ...(state.quotas[sender.id] ?? state.quota ?? { userId: sender.id, year: 0, month: 0, sentCoins: 0 }),
      userId: sender.id,
      sentCoins:
        (state.quotas[sender.id]?.sentCoins ?? (state.quota?.userId === sender.id ? state.quota.sentCoins : 0)) +
        input.amount,
    };
    state.history.unshift({
      id: `h-${Date.now()}`,
      userId: sender.id,
      amount: -input.amount,
      title: input.reason,
      source: recipient.name,
      counterpartName: recipient.name,
      createdAt: new Date().toISOString(),
      type: "gratitude",
      date: nowDateLabel(),
    });
    state.history.unshift({
      id: `h-incoming-${Date.now()}`,
      userId: recipient.id,
      amount: input.amount,
      title: input.reason,
      source: `От: ${sender.name}`,
      counterpartName: sender.name,
      createdAt: new Date().toISOString(),
      type: "gratitude",
      date: nowDateLabel(),
    });
    if (recipient.id === employeeId) {
      state.notifications.unshift({
        id: `n-incoming-${Date.now()}`,
        text: `Вам начислено ${formatMerchiki(input.amount)} от ${sender.name}. Причина: ${input.reason}`,
        unread: true,
      });
    }
    state.gratitudeFeed.unshift({
      id: `f-${Date.now()}`,
      senderId: sender.id,
      senderName: sender.name,
      from: sender.name,
      receiverId: recipient.id,
      receiverName: recipient.name,
      to: recipient.name,
      amount: input.amount,
      reason: input.reason,
      message: `За ${input.reason.toLowerCase()}.`,
      date: nowDateLabel(),
      reactions: { thanks: 0, celebrate: 0, support: 0, fire: 0, sparkle: 0 },
      reactionUsers: { thanks: [], celebrate: [], support: [], fire: [], sparkle: [] },
    });
    state.activity.unshift(`${sender.name} подарил ${formatMerchiki(input.amount)} коллеге ${recipient.name}.`);

    return buildSnapshot(state, sender.id);
  });
}

export async function createOrder(input: {
  userId: string;
  itemId: string;
  quantity: number;
  size: string;
  delivery: {
    method: "moscow-office" | "samara-office" | "delivery";
    address?: string;
    postalCode?: string;
    phone?: string;
  };
}) {
  return updateAppState(async (state) => {
    const employee = state.users.find((user) => user.id === input.userId);
    const item = state.catalog.find((catalogItem) => catalogItem.id === input.itemId);

    if (!employee || !item) {
      throw new Error("Пользователь или товар не найден.");
    }

    const sizeEntry = item.sizes?.find((entry) => entry.size === input.size);
    if (!sizeEntry) {
      throw new Error("Выберите доступный размер.");
    }

    const deliveryMethod = input.delivery?.method;
    if (!deliveryMethod || !["moscow-office", "samara-office", "delivery"].includes(deliveryMethod)) {
      throw new Error("Выберите способ получения заказа.");
    }

    const deliveryAddress = input.delivery.address?.trim();
    const deliveryPostalCode = input.delivery.postalCode?.trim();
    const deliveryPhone = input.delivery.phone?.trim();

    if (deliveryMethod === "delivery") {
      if (!deliveryAddress || !deliveryPostalCode || !deliveryPhone) {
        throw new Error("Укажите адрес, индекс и телефон для доставки.");
      }
    }

    const preview = buildOrderPreview({
      items: state.catalog.map((catalogItem) =>
        catalogItem.id === item.id ? { ...catalogItem, stock: sizeEntry.stock } : catalogItem,
      ),
      cart: [{ merchItemId: item.id, quantity: input.quantity }],
      customer: employee,
    });

    employee.coinBalance -= preview.totalCoins;
    item.sizes = item.sizes?.map((entry) =>
      entry.size === input.size ? { ...entry, stock: entry.stock - input.quantity } : entry,
    );
    item.stock = item.sizes?.reduce((sum, entry) => sum + entry.stock, 0) ?? item.stock - input.quantity;
    item.popularity = (item.popularity ?? 0) + input.quantity;

    const deliveryLabel =
      deliveryMethod === "moscow-office"
        ? "Самовывоз · Московский офис"
        : deliveryMethod === "samara-office"
          ? "Самовывоз · Самарский офис"
          : `Доставка · ${deliveryPostalCode}, ${deliveryAddress} · ${deliveryPhone}`;

    state.orders.unshift({
      id: `o-${Date.now()}`,
      customerId: employee.id,
      customerName: employee.name,
      itemId: item.id,
      itemTitle: `${item.title} · ${input.size}`,
      quantity: input.quantity,
      size: input.size,
      totalCoins: preview.totalCoins,
      status: "Создан",
      delivery: deliveryLabel,
      deliveryMethod,
      deliveryAddress,
      deliveryPostalCode,
      deliveryPhone,
      date: nowOrderDateLabel(),
    });
    state.history.unshift({
      id: `h-${Date.now()}`,
      userId: employee.id,
      amount: -preview.totalCoins,
      title: `Покупка: ${item.title} ${input.size} x ${input.quantity}`,
      counterpartName: item.title,
      createdAt: new Date().toISOString(),
      type: "purchase",
      date: nowDateLabel(),
    });
    state.notifications.unshift({
      id: `n-${Date.now()}`,
      text: `Ваш заказ оформлен: ${item.title} ${input.size} x ${input.quantity} · ${deliveryLabel}`,
      unread: true,
    });
    state.activity.unshift(
      `${employee.name} оформил заказ на товар "${item.title}" размера ${input.size} в количестве ${input.quantity} (${deliveryLabel}).`,
    );

    return buildSnapshot(state, employee.id);
  });
}

export async function grantCoins(input: {
  actorId: string;
  employeeIds: string[];
  coins: number;
  operation?: "grant" | "deduct";
  reason?: string;
}) {
  return updateAppState(async (state) => {
    const actor = state.users.find((user) => user.id === input.actorId);
    if (!actor) {
      throw new Error("Не найден администратор.");
    }

    assertAdminCanGrantCoins(actor);
    if (input.coins <= 0) {
      throw new Error("Сумма операции должна быть больше нуля.");
    }

    if (input.employeeIds.length === 0) {
      throw new Error("Выберите хотя бы одного получателя.");
    }

    const operation = input.operation ?? "grant";
    const delta = operation === "deduct" ? -input.coins : input.coins;
    const reason = input.reason?.trim() || (operation === "deduct" ? "Списание мерчиков" : "Начисление мерчиков");
    const recipients = state.users.filter((user) => input.employeeIds.includes(user.id));

    if (recipients.length === 0) {
      throw new Error("Не удалось найти выбранных получателей.");
    }

    if (operation === "deduct") {
      const insufficientRecipient = recipients.find((recipient) => recipient.coinBalance < input.coins);
      if (insufficientRecipient) {
        throw new Error(`У пользователя ${insufficientRecipient.name} недостаточно мерчиков для списания.`);
      }
    }

    for (const recipient of recipients) {
      recipient.coinBalance += delta;
      state.notifications.unshift({
        id: `n-${Date.now()}-${recipient.id}`,
        text:
          operation === "deduct"
            ? `С вашего баланса списано ${formatMerchiki(input.coins)}. Причина: ${reason}`
            : `Вам начислено ${formatMerchiki(input.coins)}. Причина: ${reason}`,
        unread: true,
      });
      state.history.unshift({
        id: `h-${Date.now()}-${recipient.id}`,
        userId: recipient.id,
        amount: delta,
        title: reason,
        source: `От: ${actor.name}`,
        counterpartName: actor.name,
        createdAt: new Date().toISOString(),
        type: operation === "grant" ? "grant" : "adjustment",
        date: nowDateLabel(),
      });
      state.grantHistory.unshift({
        id: `g-${Date.now()}-${recipient.id}`,
        adminName: actor.name,
        employeeName: recipient.name,
        amount: delta,
        reason,
        date: nowDateLabel(),
      });
    }

    state.activity.unshift(
      operation === "deduct"
        ? `${actor.name} списал ${formatMerchiki(input.coins)} у ${formatEmployees(recipients.length)}. Причина: ${reason}.`
        : `${actor.name} начислил ${formatMerchiki(input.coins)} ${formatEmployees(recipients.length)}. Причина: ${reason}.`,
    );

    return buildSnapshot(state, actor.id);
  });
}

export async function updateOrderStatuses(input: {
  actorId: string;
  orderIds: string[];
  status: "Создан" | "Подтверждён" | "Отправлен" | "Доставлен" | "Отменён";
}) {
  return updateAppState(async (state) => {
    const actor = state.users.find((user) => user.id === input.actorId);
    requireOrderManagerAccess(actor);

    if (input.orderIds.length === 0) {
      throw new Error("Выберите хотя бы один заказ.");
    }

    const nextStatus = input.status;
    const updatedOrders = state.orders.filter((order) => input.orderIds.includes(order.id));

    if (updatedOrders.length === 0) {
      throw new Error("Не удалось найти выбранные заказы.");
    }

    state.orders = state.orders.map((order) =>
      input.orderIds.includes(order.id) ? { ...order, status: nextStatus } : order,
    );

    state.activity.unshift(
      `${actor?.name ?? "Администратор"} обновил статус ${formatOrders(updatedOrders.length)}: ${nextStatus}.`,
    );

    return buildSnapshot(state, input.actorId);
  });
}

export async function cancelOrder(input: { actorId: string; orderId: string }) {
  return updateAppState(async (state) => {
    const actor = state.users.find((user) => user.id === input.actorId);
    if (!actor) {
      throw new Error("Пользователь не найден.");
    }

    const order = state.orders.find((entry) => entry.id === input.orderId);
    if (!order) {
      throw new Error("Заказ не найден.");
    }

    const canManage = ["ADMIN", "ORDER_MANAGER"].includes(actor.role);
    const canCancelOwnOrder = order.customerId === actor.id;
    if (!canManage && !canCancelOwnOrder) {
      throw new Error("Недостаточно прав для отмены заказа.");
    }

    if (order.status !== "Создан") {
      throw new Error("Отменить можно только заказ со статусом «Создан».");
    }

    const customer = order.customerId ? state.users.find((user) => user.id === order.customerId) : undefined;
    const item = order.itemId ? state.catalog.find((catalogItem) => catalogItem.id === order.itemId) : undefined;
    const refundedCoins =
      order.totalCoins ??
      (item && order.quantity ? item.priceCoins * order.quantity : 0);

    if (customer && refundedCoins > 0) {
      customer.coinBalance += refundedCoins;
      state.history.unshift({
        id: `refund-${Date.now()}-${order.id}`,
        userId: customer.id,
        amount: refundedCoins,
        title: `Отмена заказа: ${order.itemTitle}`,
        source: canManage && actor.id !== customer.id ? `От: ${actor.name}` : "Возврат после отмены заказа",
        counterpartName: canManage && actor.id !== customer.id ? actor.name : undefined,
        createdAt: new Date().toISOString(),
        type: "adjustment",
        date: nowDateLabel(),
      });
      state.notifications.unshift({
        id: `order-cancel-${Date.now()}-${order.id}`,
        text:
          actor.id === customer.id
            ? `Ваш заказ отменён: ${order.itemTitle}. Возврат: ${formatMerchiki(refundedCoins)}.`
            : `${actor.name} отменил ваш заказ: ${order.itemTitle}. Возврат: ${formatMerchiki(refundedCoins)}.`,
        unread: true,
      });
    }

    if (item && order.size && order.quantity) {
      item.sizes = item.sizes?.map((entry) =>
        entry.size === order.size ? { ...entry, stock: entry.stock + order.quantity! } : entry,
      );
      item.stock = item.sizes?.reduce((sum, entry) => sum + entry.stock, 0) ?? item.stock + order.quantity;
    }

    order.status = "Отменён";
    order.cancelledBy = actor.name;

    state.activity.unshift(
      `${actor.name} отменил заказ "${order.itemTitle}"${customer ? ` пользователя ${customer.name}` : ""}.`,
    );

    return buildSnapshot(state, actor.id);
  });
}

export async function updateCatalogField(input: {
  actorId: string;
  itemId: string;
  field:
    | "title"
    | "description"
    | "priceCoins"
    | "stock"
    | "imageFit"
    | "imagePositionX"
    | "imagePositionY";
  value: string;
}) {
  return updateAppState(async (state) => {
    requireAdmin(state.users.find((user) => user.id === input.actorId));
    const item = state.catalog.find((entry) => entry.id === input.itemId);
    if (!item) {
      throw new Error("Товар не найден.");
    }

    if (input.field === "priceCoins" || input.field === "stock") {
      item[input.field] = Math.max(Number(input.value) || 0, 0);
    } else if (input.field === "imageFit") {
      item.imageFit = input.value === "cover" ? "cover" : "contain";
    } else if (input.field === "imagePositionX" || input.field === "imagePositionY") {
      item[input.field] = Math.min(Math.max(Number(input.value) || 0, 0), 100);
    } else {
      item[input.field] = input.value;
    }

    return buildSnapshot(state, input.actorId);
  });
}

export async function updateCatalogSize(input: { actorId: string; itemId: string; size: string; value: number }) {
  return updateAppState(async (state) => {
    requireAdmin(state.users.find((user) => user.id === input.actorId));
    const item = state.catalog.find((entry) => entry.id === input.itemId);
    if (!item?.sizes) {
      throw new Error("Товар не найден.");
    }

    item.sizes = item.sizes.map((entry) =>
      entry.size === input.size ? { ...entry, stock: Math.max(input.value || 0, 0) } : entry,
    );
    item.stock = item.sizes.reduce((sum, entry) => sum + entry.stock, 0);

    return buildSnapshot(state, input.actorId);
  });
}

export async function toggleCatalogItem(input: { actorId: string; itemId: string }) {
  return updateAppState(async (state) => {
    requireAdmin(state.users.find((user) => user.id === input.actorId));
    const item = state.catalog.find((entry) => entry.id === input.itemId);
    if (!item) {
      throw new Error("Товар не найден.");
    }

    item.isActive = !item.isActive;
    state.activity.unshift("Администратор обновил доступность товара в каталоге.");

    return buildSnapshot(state, input.actorId);
  });
}

export async function markAllNotificationsRead(userId = employeeId) {
  return updateAppState(async (state) => {
    state.notifications = state.notifications.map((item) => ({ ...item, unread: false }));
    return buildSnapshot(state, userId);
  });
}

export async function reactToPost(input: { postId: string; reaction: ReactionKey; userId?: string }) {
  return updateAppState(async (state) => {
    const post = state.gratitudeFeed.find((entry) => entry.id === input.postId);
    if (!post) {
      throw new Error("Пост не найден.");
    }
    const userId = input.userId ?? employeeId;
    const reactionUsers = post.reactionUsers ?? { thanks: [], celebrate: [], support: [], fire: [], sparkle: [] };
    const currentUsers = reactionUsers[input.reaction] ?? [];

    if (currentUsers.includes(userId)) {
      return buildSnapshot(state, userId);
    }

    reactionUsers[input.reaction] = [...currentUsers, userId];
    post.reactionUsers = reactionUsers;
    post.reactions[input.reaction] = (post.reactions[input.reaction] ?? 0) + 1;
    return buildSnapshot(state, userId);
  });
}

export async function setWishlist(input: { userId?: string; itemId: string }) {
  return updateAppState(async (state) => {
    const userId = input.userId ?? employeeId;
    const current = state.wishlists[userId] ?? [];
    state.wishlists[userId] = current.includes(input.itemId)
      ? current.filter((id) => id !== input.itemId)
      : [...current, input.itemId];

    return buildSnapshot(state, userId);
  });
}

export async function uploadCatalogImage(input: {
  actorId: string;
  itemId: string;
  imageUrl: string;
  imageFit?: "contain" | "cover";
  imagePositionX?: number;
  imagePositionY?: number;
}) {
  return updateAppState(async (state) => {
    requireAdmin(state.users.find((user) => user.id === input.actorId));
    const item = state.catalog.find((entry) => entry.id === input.itemId);
    if (!item) {
      throw new Error("Товар не найден.");
    }

    item.imageUrl = input.imageUrl;
    item.imageFit = input.imageFit ?? item.imageFit ?? "contain";
    item.imagePositionX = Math.min(Math.max(input.imagePositionX ?? item.imagePositionX ?? 50, 0), 100);
    item.imagePositionY = Math.min(Math.max(input.imagePositionY ?? item.imagePositionY ?? 50, 0), 100);
    return buildSnapshot(state, input.actorId);
  });
}

export async function upsertCatalogItem(input: {
  actorId: string;
  item: MerchItem;
}) {
  return updateAppState(async (state) => {
    requireAdmin(state.users.find((user) => user.id === input.actorId));
    const normalizedItem: MerchItem = {
      ...input.item,
      title: input.item.title.trim() || "Новый товар",
      description: input.item.description.trim() || "Описание появится позже.",
      slug: slugify(input.item.slug || input.item.title || `item-${Date.now()}`),
      publishedAt: input.item.publishedAt ?? new Date().toISOString(),
      priceCoins: Math.max(input.item.priceCoins || 0, 0),
      stock: Math.max(
        input.item.sizes?.reduce((sum, entry) => sum + Math.max(entry.stock || 0, 0), 0) ?? input.item.stock ?? 0,
        0,
      ),
      sizes: (input.item.sizes?.length
        ? input.item.sizes
        : [{ size: "One size", stock: Math.max(input.item.stock || 0, 0) }]
      ).map((entry) => ({
        size: entry.size.trim() || "One size",
        stock: Math.max(entry.stock || 0, 0),
      })),
    };

    const existingIndex = state.catalog.findIndex((entry) => entry.id === normalizedItem.id);
    if (existingIndex >= 0) {
      state.catalog[existingIndex] = normalizedItem;
      state.activity.unshift(`Администратор обновил товар "${normalizedItem.title}".`);
    } else {
      state.catalog.unshift({
        ...normalizedItem,
        id: normalizedItem.id || `m-${Date.now()}`,
      });
      state.activity.unshift(`Администратор добавил товар "${normalizedItem.title}".`);
    }

    return buildSnapshot(state, input.actorId);
  });
}

export async function duplicateCatalogItem(input: { actorId: string; itemId: string }) {
  return updateAppState(async (state) => {
    requireAdmin(state.users.find((user) => user.id === input.actorId));
    const item = state.catalog.find((entry) => entry.id === input.itemId);
    if (!item) {
      throw new Error("Товар не найден.");
    }

    const copy: MerchItem = {
      ...item,
      id: `m-${Date.now()}`,
      slug: `${item.slug}-copy-${Date.now()}`,
      title: `${item.title} (копия)`,
      sizes: item.sizes?.map((entry) => ({ ...entry })),
    };

    state.catalog.unshift(copy);
    state.activity.unshift(`Администратор создал копию товара "${item.title}".`);
    return buildSnapshot(state, input.actorId);
  });
}

export async function deleteCatalogItem(input: { actorId: string; itemId: string }) {
  return updateAppState(async (state) => {
    requireAdmin(state.users.find((user) => user.id === input.actorId));
    const item = state.catalog.find((entry) => entry.id === input.itemId);
    if (!item) {
      throw new Error("Товар не найден.");
    }

    state.catalog = state.catalog.filter((entry) => entry.id !== input.itemId);
    state.activity.unshift(`Администратор удалил товар "${item.title}".`);
    return buildSnapshot(state, input.actorId);
  });
}

export async function setCatalogItemVisibility(input: { actorId: string; itemId: string; isActive: boolean }) {
  return updateAppState(async (state) => {
    requireAdmin(state.users.find((user) => user.id === input.actorId));
    const item = state.catalog.find((entry) => entry.id === input.itemId);
    if (!item) {
      throw new Error("Товар не найден.");
    }

    item.isActive = input.isActive;
    state.activity.unshift(
      `Администратор ${input.isActive ? "вернул в каталог" : "скрыл"} товар "${item.title}".`,
    );
    return buildSnapshot(state, input.actorId);
  });
}

export function getEmployeeNameFromSnapshot(snapshot: AppSnapshot, userId: string) {
  return findUserName(snapshot, userId);
}

export async function setUserRole(input: { actorId: string; targetUserId: string; role: "ADMIN" | "EMPLOYEE" | "ORDER_MANAGER" }) {
  return updateAppState(async (state) => {
    const actor = state.users.find((user) => user.id === input.actorId);
    requireAdmin(actor);
    const adminActor = actor as User;

    const target = state.users.find((user) => user.id === input.targetUserId);
    if (!target) {
      throw new Error("Пользователь не найден.");
    }

    if (adminActor.id === target.id && input.role !== "ADMIN") {
      throw new Error("Нельзя снять права администратора у самого себя.");
    }

    if (target.role === "ADMIN" && input.role === "EMPLOYEE") {
      const adminCount = state.users.filter((user) => user.role === "ADMIN").length;
      if (adminCount <= 1) {
        throw new Error("В системе должен остаться хотя бы один администратор.");
      }
    }

    if (target.role === "ADMIN" && input.role === "ORDER_MANAGER") {
      const adminCount = state.users.filter((user) => user.role === "ADMIN").length;
      if (adminCount <= 1) {
        throw new Error("В системе должен остаться хотя бы один администратор.");
      }
    }

    target.role = input.role;
    state.activity.unshift(
      `${adminActor.name} ${
        input.role === "ADMIN"
          ? "назначил администратором"
          : input.role === "ORDER_MANAGER"
            ? "назначил менеджером доставки заказов"
            : "вернул в сотрудники"
      } пользователя "${target.name}".`,
    );

    return buildSnapshot(state, adminActor.id);
  });
}
