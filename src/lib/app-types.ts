import type { MerchItem, MonthlyGiftQuota, User } from "@/lib/domain/types";

export type CoinHistoryEntry = {
  id: string;
  userId?: string;
  amount: number;
  title: string;
  source?: string;
  date: string;
  createdAt?: string;
  counterpartName?: string;
  balanceAfter?: number;
  type?: "purchase" | "grant" | "gratitude" | "adjustment";
};

export type Notification = {
  id: string;
  text: string;
  unread: boolean;
};

export type GrantHistoryEntry = {
  id: string;
  adminName: string;
  employeeName: string;
  amount: number;
  reason: string;
  date: string;
};

export type OrderStatus = "Создан" | "Подтверждён" | "Отправлен" | "Доставлен" | "Отменён";

export type OrderDeliveryMethod = "moscow-office" | "samara-office" | "delivery";

export type OrderCard = {
  id: string;
  customerId?: string;
  customerName?: string;
  itemId?: string;
  itemTitle: string;
  quantity?: number;
  size?: string;
  totalCoins?: number;
  status: OrderStatus;
  delivery: string;
  deliveryMethod?: OrderDeliveryMethod;
  deliveryAddress?: string;
  deliveryPostalCode?: string;
  deliveryPhone?: string;
  date: string;
  cancelledBy?: string;
};

export type ReactionKey = "thanks" | "celebrate" | "support" | "fire" | "sparkle";

export type GratitudePost = {
  id: string;
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  from: string;
  receiverId?: string;
  receiverName?: string;
  receiverAvatar?: string;
  to: string;
  amount: number;
  reason: string;
  message: string;
  date: string;
  createdAt?: string;
  isPublic?: boolean;
  reactions: Record<ReactionKey, number>;
  myReactions?: ReactionKey[];
  reactionUsers?: Partial<Record<ReactionKey, string[]>>;
};

export type PersistedAppState = {
  users: User[];
  quotas?: Record<string, MonthlyGiftQuota>;
  quota: MonthlyGiftQuota;
  automationStartedAt?: string;
  catalog: MerchItem[];
  history: CoinHistoryEntry[];
  grantHistory: GrantHistoryEntry[];
  birthdayGrants: string[];
  automatedGrantKeys?: string[];
  notifications: Notification[];
  orders: OrderCard[];
  gratitudeFeed: GratitudePost[];
  activity: string[];
  wishlists: Record<string, string[]>;
};

export type AppSnapshot = {
  users: User[];
  quota: MonthlyGiftQuota;
  catalog: MerchItem[];
  history: CoinHistoryEntry[];
  grantHistory: GrantHistoryEntry[];
  notifications: Notification[];
  orders: OrderCard[];
  gratitudeFeed: GratitudePost[];
  activity: string[];
  wishlist: string[];
};
