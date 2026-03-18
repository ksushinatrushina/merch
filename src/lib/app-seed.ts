import type { AppSnapshot, PersistedAppState } from "@/lib/app-types";
import { adminUser, currentUser, giftQuota, colleagues, merchItems } from "@/lib/mock-data";

export const initialHistory = [
  {
    id: "h1",
    amount: 10,
    title: "За помощь в проекте",
    source: "От: Дмитрий Соколов",
    date: "12 марта 2026",
  },
  {
    id: "h2",
    amount: -45,
    title: "Покупка: Металлическая бутылка",
    date: "12 марта 2026",
  },
  {
    id: "h3",
    amount: 25,
    title: "Награда за Q1 demo day",
    source: "От: Мария Ковалева",
    date: "10 марта 2026",
  },
  {
    id: "h4",
    amount: -5,
    title: "Подарок коллеге",
    source: "Иван Петров",
    date: "8 марта 2026",
  },
] as const;

export const initialNotifications = [
  { id: "n1", text: "Иван Петров отправил вам 5 коинов", unread: true },
  { id: "n2", text: "Ваш заказ оформлен: Металлическая бутылка", unread: true },
  { id: "n3", text: "Ваш заказ доставлен в офис", unread: true },
] as const;

export const initialGrantHistory = [
  {
    id: "g1",
    adminName: "Мария Ковалева",
    employeeName: "Анна Смирнова",
    amount: 20,
    reason: "Бонус за релиз",
    date: "12 марта 2026",
  },
  {
    id: "g2",
    adminName: "Мария Ковалева",
    employeeName: "Иван Петров",
    amount: 15,
    reason: "Бонус за помощь команде",
    date: "11 марта 2026",
  },
] as const;

export const initialOrders = [
  {
    id: "o1",
    customerName: "Анна Смирнова",
    itemTitle: "Металлическая бутылка",
    status: "Подтверждён",
    delivery: "Office delivery",
    date: "14 марта",
  },
  {
    id: "o2",
    customerName: "Анна Смирнова",
    itemTitle: "Стикерпак",
    status: "Доставлен",
    delivery: "Office delivery",
    date: "11 марта",
  },
] as const;

export const initialFeed = [
  {
    id: "f1",
    senderId: "u-3",
    senderName: "Елена Орлова",
    from: "Елена Орлова",
    receiverId: "u-2",
    receiverName: "Иван Петров",
    to: "Иван Петров",
    amount: 10,
    reason: "За помощь с релизом",
    message: "За помощь с подготовкой демо для клиента.",
    date: "12 марта 2026",
    reactions: { thanks: 8, celebrate: 2, support: 3, fire: 1 },
    reactionUsers: {
      thanks: ["u-1"],
      celebrate: [],
      support: [],
      fire: [],
    },
  },
  {
    id: "f2",
    senderId: "u-1",
    senderName: "Анна Смирнова",
    from: "Анна Смирнова",
    receiverId: "u-4",
    receiverName: "Дмитрий Соколов",
    to: "Дмитрий Соколов",
    amount: 5,
    reason: "За поддержку команды",
    message: "Быстро подключился и спас синк с командой.",
    date: "11 марта 2026",
    reactions: { thanks: 4, celebrate: 1, support: 5, fire: 2 },
    reactionUsers: {
      thanks: [],
      celebrate: [],
      support: ["u-1"],
      fire: [],
    },
  },
] as const;

export const initialActivity = [
  "Администратор подготовил каталог мерча на март 2026.",
  "Анне доступно 140 коинов и 15 коинов на подарки коллегам.",
] as const;

export function createInitialPersistedState(): PersistedAppState {
  return {
    users: [currentUser, ...colleagues, adminUser],
    quota: { ...giftQuota },
    catalog: merchItems.map((item) => ({
      ...item,
      sizes: item.sizes?.map((entry) => ({ ...entry })),
    })),
    history: initialHistory.map((entry) => ({ ...entry })),
    grantHistory: initialGrantHistory.map((entry) => ({ ...entry })),
    birthdayGrants: [],
    notifications: initialNotifications.map((entry) => ({ ...entry })),
    orders: initialOrders.map((entry) => ({ ...entry })),
    gratitudeFeed: initialFeed.map((entry) => ({
      ...entry,
      reactions: { ...entry.reactions },
      reactionUsers: Object.fromEntries(
        Object.entries(entry.reactionUsers ?? {}).map(([key, value]) => [key, [...value]]),
      ),
    })),
    activity: [...initialActivity],
    wishlists: { [currentUser.id]: [] },
  };
}

export function createInitialSnapshot(): AppSnapshot {
  const state = createInitialPersistedState();
  return {
    ...state,
    wishlist: state.wishlists[currentUser.id] ?? [],
  };
}
