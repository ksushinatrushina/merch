"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  AdminOrdersPanel,
  CatalogTable,
  GrantCoinsPanel,
  GrantHistoryList,
  ProductEditorModal,
} from "@/components/admin-panel";
import {
  GratitudeFeed,
  Header,
  ProfileCard,
  RecentPurchases,
  SendGratitudePanel,
  StatsPanel,
} from "@/components/employee-dashboard";
import { ShopCatalog } from "@/components/shop-catalog";
import type { ShopSortMode } from "@/components/shop-catalog";
import { HistoryPage as ActivityHistoryPage } from "@/components/history-center";
import { createInitialSnapshot } from "@/lib/app-seed";
import type {
  AppSnapshot,
  CoinHistoryEntry,
  GrantHistoryEntry,
  GratitudePost,
  Notification,
  OrderCard,
  OrderDeliveryMethod,
  OrderStatus,
  ReactionKey,
} from "@/lib/app-types";
import { MONTHLY_GIFT_LIMIT, remainingGiftCoins } from "@/lib/domain/coins";
import type { CartLine, MerchItem, MonthlyGiftQuota, User } from "@/lib/domain/types";
import { currentUser } from "@/lib/mock-data";

type ViewMode = "EMPLOYEE" | "ADMIN";
type StatusTone = "warning" | "success" | "neutral";
type GiftReason = "Помощь в релизе" | "Отличная презентация" | "Поддержка команды";
type EmployeeTab = "PROFILE" | "STORE" | "HISTORY";
type AdminTab = "GRANTS" | "CATALOG" | "ORDERS";

type StatusState = {
  title: string;
  detail: string;
  tone: StatusTone;
};

type ConfirmDialogState = {
  title: string;
  detail: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
};

type CatalogImageDraft = {
  fileName: string;
  imageUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  frameSize: number;
  imageOffsetX: number;
  imageOffsetY: number;
  frameX: number;
  frameY: number;
  zoom: number;
};

type CropDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startPositionX: number;
  startPositionY: number;
  target: "modal-image" | "modal-frame" | "editor";
};

type CatalogEditorDraft = MerchItem;
type CartEntry = CartLine & { size: string };

type AdminAnalytics = {
  label: string;
  value: string;
};

type CheckoutDeliveryState = {
  method: OrderDeliveryMethod;
  address: string;
  postalCode: string;
  phone: string;
};

type HomePageClientProps = {
  initialAdminTab?: AdminTab;
  initialEmployeeTab?: EmployeeTab;
  initialMode?: ViewMode;
};

type PhotoUploadState = {
  detail: string;
  error?: string;
  fileName?: string;
  fileSizeLabel?: string;
  hasTransparency?: boolean;
  phase: "idle" | "loading" | "ready" | "error";
  warning?: string;
  width?: number;
  height?: number;
};

type AuthResponse = {
  user: User;
  snapshot: AppSnapshot;
};

const sessionStorageKey = "merch-session-user-id";
const employeeId = currentUser.id;
const initialSnapshot = createInitialSnapshot();
const initialUsers: User[] = initialSnapshot.users;
const allCategoryLabel = "Все";
const defaultCategories = ["Одежда", "Посуда", "Канцелярия"] as const;
const sortModes: ShopSortMode[] = ["По популярности", "По цене", "Сначала доступные", "Сначала новинки", "По остатку"];
const giftReasons: GiftReason[] = ["Помощь в релизе", "Отличная презентация", "Поддержка команды"];
const orderSteps: OrderStatus[] = ["Создан", "Подтверждён", "Отправлен", "Доставлен"];
const cropStageSize = 360;
const cropFrameSize = 260;
const maxUploadBytes = 10 * 1024 * 1024;
const recommendedImageSide = 1200;
const minimumImageSide = 600;
const supportedUploadTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const defaultCheckoutDelivery: CheckoutDeliveryState = {
  method: "moscow-office",
  address: "",
  postalCode: "",
  phone: "",
};

const itemArt: Record<string, string> = {
  "m-hoodie": "Худи",
  "m-bottle": "Бутылка",
  "m-stickers": "Стикеры",
};

function iconBell() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M6 17h12" />
      <path d="M8 17V11a4 4 0 1 1 8 0v6" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

function iconCoin() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <path d="M9.5 9.5h4a2 2 0 0 1 0 4h-3a2 2 0 0 0 0 4h4" />
      <path d="M12 7.5v9" />
    </svg>
  );
}

function iconGift() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 10h16v10H4z" />
      <path d="M12 10v10" />
      <path d="M3 7h18v3H3z" />
      <path d="M9 7c-1.7 0-3-1-3-2.5S7.3 2 9 2c2.2 0 3 2.6 3 5" />
      <path d="M15 7c1.7 0 3-1 3-2.5S16.7 2 15 2c-2.2 0-3 2.6-3 5" />
    </svg>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.round(value / 1024)} KB`;
}

function getCropImageMetrics(naturalWidth: number, naturalHeight: number) {
  const scale = Math.max(cropStageSize / naturalWidth, cropStageSize / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return { scale, width, height };
}

function getCropImageMetricsWithZoom(naturalWidth: number, naturalHeight: number, zoom: number) {
  const base = getCropImageMetrics(naturalWidth, naturalHeight);
  return {
    scale: base.scale * zoom,
    width: base.width * zoom,
    height: base.height * zoom,
  };
}

function getInitialCatalogZoom(naturalWidth: number, naturalHeight: number) {
  const base = getCropImageMetrics(naturalWidth, naturalHeight);
  const isSquare = Math.abs(naturalWidth - naturalHeight) <= 2;
  if (isSquare) {
    return cropStageSize / Math.max(base.width, base.height);
  }
  return 1;
}

function getMinimumCatalogZoom(naturalWidth: number, naturalHeight: number) {
  return getInitialCatalogZoom(naturalWidth, naturalHeight);
}

function getInitialCatalogFrameSize(naturalWidth: number, naturalHeight: number) {
  const isSquare = Math.abs(naturalWidth - naturalHeight) <= 2;
  return isSquare ? cropStageSize : cropFrameSize;
}

function iconBag() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 9V7a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function iconSpark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    </svg>
  );
}

function iconMail() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 7h16v10H4z" />
      <path d="M4 8l8 6 8-6" />
    </svg>
  );
}

function iconMapPin() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 21s6-5.5 6-11a6 6 0 1 0-12 0c0 5.5 6 11 6 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function iconClock() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function iconTeam() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M16.5 18a4.5 4.5 0 0 0-9 0" />
      <circle cx="12" cy="8" r="3" />
      <path d="M20 18a3.5 3.5 0 0 0-3-3.45" />
      <path d="M7 14.55A3.5 3.5 0 0 0 4 18" />
    </svg>
  );
}

function createCatalogDraft(item?: MerchItem): CatalogEditorDraft {
  if (item) {
    return {
      ...item,
      sizes: item.sizes?.map((entry) => ({ ...entry })) ?? [{ size: "One size", stock: item.stock }],
    };
  }

  return {
    id: "",
    slug: "",
    title: "",
    description: "",
    priceCoins: 0,
    stock: 0,
    isActive: true,
    manualLimited: false,
    imageFit: "contain",
    imagePositionX: 50,
    imagePositionY: 50,
    sizes: [{ size: "One size", stock: 0 }],
  };
}

function initials(name: string) {
  return name
    .split(" ")
    .map((chunk) => chunk[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function stockForSize(item: MerchItem, size: string) {
  return item.sizes?.find((entry) => entry.size === size)?.stock ?? item.stock;
}

function employeeMeta(name: string) {
  if (name.includes("Анна")) {
    return "Product Manager";
  }
  if (name.includes("Иван")) {
    return "Frontend Engineer";
  }
  if (name.includes("Елена")) {
    return "HR Partner";
  }
  if (name.includes("Дмитрий")) {
    return "Sales Lead";
  }
  return "Team Member";
}

function employeeDepartment(name: string) {
  if (name.includes("Анна")) {
    return "Product";
  }
  if (name.includes("Иван")) {
    return "Engineering";
  }
  if (name.includes("Елена")) {
    return "People";
  }
  if (name.includes("Дмитрий")) {
    return "Sales";
  }
  return "General";
}

function buildDeliveryLabel(delivery: CheckoutDeliveryState) {
  if (delivery.method === "moscow-office") {
    return "Самовывоз · Московский офис";
  }
  if (delivery.method === "samara-office") {
    return "Самовывоз · Самарский офис";
  }
  return `Доставка · ${delivery.postalCode.trim()}, ${delivery.address.trim()} · ${delivery.phone.trim()}`;
}

function normalizeRussianPhoneDigits(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }

  if (digits.startsWith("7") || digits.startsWith("8")) {
    return digits.slice(1, 11);
  }

  return digits.slice(0, 10);
}

function formatRussianPhone(value: string) {
  const digits = normalizeRussianPhoneDigits(value);
  const part1 = digits.slice(0, 3);
  const part2 = digits.slice(3, 6);
  const part3 = digits.slice(6, 8);
  const part4 = digits.slice(8, 10);

  let formatted = "+7";
  if (part1) {
    formatted += ` (${part1}`;
  }
  if (part1.length === 3) {
    formatted += ")";
  }
  if (part2) {
    formatted += ` ${part2}`;
  }
  if (part3) {
    formatted += `-${part3}`;
  }
  if (part4) {
    formatted += `-${part4}`;
  }

  return formatted;
}

function validateCheckoutDelivery(delivery: CheckoutDeliveryState) {
  if (delivery.method !== "delivery") {
    return { isValid: true, message: "", label: buildDeliveryLabel(delivery) };
  }

  if (!delivery.address.trim() || !delivery.postalCode.trim() || !delivery.phone.trim()) {
    return {
      isValid: false,
      message: "Для доставки укажите адрес, индекс и телефон.",
      label: "Доставка",
    };
  }

  if (delivery.postalCode.trim().length !== 6) {
    return {
      isValid: false,
      message: "Укажите индекс из 6 цифр.",
      label: "Доставка",
    };
  }

  if (normalizeRussianPhoneDigits(delivery.phone).length !== 10) {
    return {
      isValid: false,
      message: "Укажите корректный российский номер телефона.",
      label: "Доставка",
    };
  }

  return { isValid: true, message: "", label: buildDeliveryLabel(delivery) };
}

function rarityLabel(badge?: MerchItem["badge"]) {
  if (badge === "Популярно") {
    return "🔥 Популярно";
  }
  if (badge === "Новинка") {
    return "⭐ Новинка";
  }
  if (badge === "Лимитировано") {
    return "🎁 Лимитировано";
  }
  return null;
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload: unknown = await response.json();
  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String(payload.error)
        : "Не удалось выполнить запрос.";
    throw new Error(errorMessage);
  }

  return payload as T;
}

export default function HomePageClient({
  initialAdminTab = "GRANTS",
  initialEmployeeTab = "PROFILE",
  initialMode = "EMPLOYEE",
}: HomePageClientProps) {
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [adminTab, setAdminTab] = useState<AdminTab>(initialAdminTab);
  const [employeeTab, setEmployeeTab] = useState<EmployeeTab>(initialEmployeeTab);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [adminRoleSearch, setAdminRoleSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState<boolean>(false);
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [quota, setQuota] = useState<MonthlyGiftQuota>(initialSnapshot.quota);
  const [catalog, setCatalog] = useState<MerchItem[]>(initialSnapshot.catalog);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>(
    initialUsers.find((user) => user.role === "EMPLOYEE" && user.id !== employeeId)?.id ?? "",
  );
  const [giftAmount, setGiftAmount] = useState<string>("5");
  const [giftReason, setGiftReason] = useState<GiftReason>("Помощь в релизе");
  const [giftMessage, setGiftMessage] = useState<string>("");
  const [grantAmount, setGrantAmount] = useState<number>(20);
  const [grantReason, setGrantReason] = useState<string>("");
  const [selectedGrantEmployeeIds, setSelectedGrantEmployeeIds] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusState>({ title: "", detail: "", tone: "neutral" });
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [toastMessage, setToastMessage] = useState<string>("");
  const [coinBurst, setCoinBurst] = useState<number>(0);
  const [activity, setActivity] = useState<string[]>([
    ...initialSnapshot.activity,
  ]);
  const [history, setHistory] = useState<CoinHistoryEntry[]>(initialSnapshot.history);
  const [grantHistory, setGrantHistory] = useState<GrantHistoryEntry[]>(initialSnapshot.grantHistory);
  const [notifications, setNotifications] = useState<Notification[]>(initialSnapshot.notifications);
  const [firedItems, setFiredItems] = useState<string[]>(initialSnapshot.wishlist);
  const [storeQuantities, setStoreQuantities] = useState<Record<string, number>>({});
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<ShopSortMode>("По популярности");
  const [productSearch, setProductSearch] = useState<string>("");
  const [lockedCatalogOrder, setLockedCatalogOrder] = useState<string[] | null>(null);
  const [cartItems, setCartItems] = useState<CartEntry[]>([]);
  const [cartOpen, setCartOpen] = useState<boolean>(false);
  const [checkoutDelivery, setCheckoutDelivery] = useState<CheckoutDeliveryState>(defaultCheckoutDelivery);
  const [isStoreLoading, setIsStoreLoading] = useState<boolean>(true);
  const [isActivityLoading, setIsActivityLoading] = useState<boolean>(true);
  const [isPurchasing, setIsPurchasing] = useState<boolean>(false);
  const [orders, setOrders] = useState<OrderCard[]>(initialSnapshot.orders);
  const [gratitudeFeed, setGratitudeFeed] = useState<GratitudePost[]>(initialSnapshot.gratitudeFeed);
  const [expandedStoreItemId, setExpandedStoreItemId] = useState<string | null>(null);
  const [catalogImageDraft, setCatalogImageDraft] = useState<CatalogImageDraft | null>(null);
  const [catalogImageBaseline, setCatalogImageBaseline] = useState<CatalogImageDraft | null>(null);
  const [photoUploadState, setPhotoUploadState] = useState<PhotoUploadState>({
    phase: "idle",
    detail: "Загрузите изображение для карточки товара.",
  });
  const [catalogSearch, setCatalogSearch] = useState<string>("");
  const [catalogEditorDraft, setCatalogEditorDraft] = useState<CatalogEditorDraft | null>(null);
  const [catalogEditorBaseline, setCatalogEditorBaseline] = useState<CatalogEditorDraft | null>(null);
  const [profileOverlay, setProfileOverlay] = useState<"orders" | "gratitude" | null>(null);
  const [grantHistoryOverlayOpen, setGrantHistoryOverlayOpen] = useState(false);
  const cropDragRef = useRef<CropDragState | null>(null);
  const isStorePage = initialMode === "EMPLOYEE" && initialEmployeeTab === "STORE";

  const sessionUser = users.find((user) => user.id === sessionUserId) ?? null;
  const viewerUserId = sessionUser?.id ?? employeeId;
  const employee = users.find((user) => user.id === viewerUserId) ?? currentUser;
  const activeUser = sessionUser ?? employee;
  const canAccessAdmin = activeUser.role === "ADMIN";
  const grantRecipients = users;
  const availableGiftCoins = remainingGiftCoins(quota);
  const sentCoins = MONTHLY_GIFT_LIMIT - availableGiftCoins;
  const unreadNotifications = notifications.filter((item) => item.unread).length;
  const daysUntilReset = 20;
  const giftCoinsUsed = quota.sentCoins;
  const latestThanks = gratitudeFeed.filter((item) => item.to === employee.name).slice(0, 4);
  const profileGratitudeEvents = gratitudeFeed
    .filter((item) => item.to === employee.name || item.from === employee.name)
    .slice(0, 4);
  const storeCategories = useMemo(() => {
    const dynamicCategories = catalog
      .map((item) => item.category?.trim())
      .filter((category): category is string => Boolean(category));

    return [allCategoryLabel, ...new Set([...defaultCategories, ...dynamicCategories])];
  }, [catalog]);
  const existingCategories = storeCategories;
  const colleagueOptions = users.filter((user) => user.id !== viewerUserId);
  const manageableUsers = users.filter((user) => {
    const query = adminRoleSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return `${user.name} ${user.email} ${user.username ?? ""} ${user.team ?? ""}`.toLowerCase().includes(query);
  });
  const adminUsers = users.filter((user) => user.role === "ADMIN");
  const visibleItems = useMemo(() => {
    const filtered = catalog
      .filter((item) => item.isActive)
      .filter((item) => !selectedCategory || item.category === selectedCategory)
      .filter((item) => {
        const query = productSearch.trim().toLowerCase();
        if (!query) {
          return true;
        }

        return `${item.title} ${item.description}`.toLowerCase().includes(query);
      });

    return [...filtered].sort((left, right) => {
      if (sortMode === "По популярности" && lockedCatalogOrder) {
        const leftIndex = lockedCatalogOrder.indexOf(left.id);
        const rightIndex = lockedCatalogOrder.indexOf(right.id);

        if (leftIndex >= 0 || rightIndex >= 0) {
          if (leftIndex < 0) {
            return 1;
          }
          if (rightIndex < 0) {
            return -1;
          }

          return leftIndex - rightIndex;
        }
      }

      if (sortMode === "По цене") {
        return left.priceCoins - right.priceCoins;
      }
      if (sortMode === "Сначала новинки") {
        return Number(right.isNew ?? false) - Number(left.isNew ?? false);
      }
      if (sortMode === "По остатку") {
        return right.stock - left.stock;
      }
      if (sortMode === "Сначала доступные") {
        return Number(right.priceCoins <= employee.coinBalance) - Number(left.priceCoins <= employee.coinBalance);
      }
      return (right.popularity ?? 0) - (left.popularity ?? 0);
    });
  }, [catalog, employee.coinBalance, lockedCatalogOrder, productSearch, selectedCategory, sortMode]);

  useEffect(() => {
    setLockedCatalogOrder(null);
  }, [productSearch, selectedCategory, sortMode]);

  const searchSuggestions = useMemo(() => {
    const suggestions = new Set<string>();

    for (const item of catalog) {
      suggestions.add(item.title);
    }

    return [...suggestions].sort((left, right) => left.localeCompare(right, "ru"));
  }, [catalog]);

  const profileStats = useMemo(
    () => ({
      received: history.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0),
      sent: history
        .filter((entry) => entry.amount < 0 && !entry.title.startsWith("Покупка:"))
        .reduce((sum, entry) => sum + Math.abs(entry.amount), 0),
      purchases: orders.length,
      thanks: gratitudeFeed.filter((item) => item.to === employee.name).length + 7,
    }),
    [employee.name, gratitudeFeed, history, orders.length],
  );

  const analytics: AdminAnalytics[] = useMemo(() => {
    const topCatalogItem = [...catalog]
      .sort((left, right) => (right.popularity ?? 0) - (left.popularity ?? 0))
      .find((item) => item.isActive);

    const gratitudeLeaders = Object.entries(
      gratitudeFeed.reduce<Record<string, number>>((accumulator, post) => {
        const receiverName = post.receiverName ?? post.to;
        if (!receiverName) {
          return accumulator;
        }
        accumulator[receiverName] = (accumulator[receiverName] ?? 0) + post.amount;
        return accumulator;
      }, {}),
    ).sort((left, right) => right[1] - left[1]);

    const latestOrderDate = orders[0]?.date ?? null;
    const recentHistoryCount = latestOrderDate
      ? history.filter((entry) => entry.date === latestOrderDate).length
      : history.length;
    const recentGrantCount = latestOrderDate
      ? grantHistory.filter((entry) => entry.date === latestOrderDate).length
      : grantHistory.length;
    const recentFeedCount = latestOrderDate
      ? gratitudeFeed.filter((entry) => entry.date === latestOrderDate).length
      : gratitudeFeed.length;
    const totalActivity = recentHistoryCount + recentGrantCount + recentFeedCount;

    return [
      {
        label: "Самый популярный товар",
        value: topCatalogItem ? `${topCatalogItem.title} · ${topCatalogItem.popularity ?? 0} огоньков` : "Нет данных",
      },
      {
        label: "Топ благодарностей",
        value: gratitudeLeaders[0] ? `${gratitudeLeaders[0][0]} · ${gratitudeLeaders[0][1]} коинов` : "Нет данных",
      },
      {
        label: "Активность сотрудников",
        value: `${totalActivity} событий${latestOrderDate ? ` · ${latestOrderDate}` : ""}`,
      },
    ];
  }, [catalog, gratitudeFeed, grantHistory, history, orders]);

  const filteredAdminCatalog = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) {
      return catalog;
    }

    return catalog.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        (item.category ?? "").toLowerCase().includes(query),
    );
  }, [catalog, catalogSearch]);
  const isCatalogEditorDirty =
    catalogEditorDraft !== null &&
    JSON.stringify(catalogEditorDraft) !== JSON.stringify(catalogEditorBaseline);
  const deliveryValidation = useMemo(() => validateCheckoutDelivery(checkoutDelivery), [checkoutDelivery]);

  const cartView = useMemo(() => {
    const lines = cartItems
      .map((line) => {
        const item = catalog.find((entry) => entry.id === line.merchItemId);
        if (!item) {
          return null;
        }

        return {
          ...line,
          availableStock: stockForSize(item, line.size),
          item,
          total: item.priceCoins * line.quantity,
        };
      })
      .filter(Boolean) as Array<CartEntry & { item: MerchItem; total: number; availableStock: number }>;

    const totalCoins = lines.reduce((sum, line) => sum + line.total, 0);
    const totalItems = lines.reduce((sum, line) => sum + line.quantity, 0);
    const canCheckout =
      lines.length > 0 &&
      totalCoins <= employee.coinBalance &&
      lines.every((line) => line.quantity <= line.availableStock && line.availableStock > 0) &&
      deliveryValidation.isValid;
    return { lines, totalCoins, totalItems, canCheckout };
  }, [cartItems, catalog, deliveryValidation.isValid, employee.coinBalance]);

  function applySnapshot(snapshot: AppSnapshot) {
    setUsers(snapshot.users);
    setQuota(snapshot.quota);
    setCatalog(snapshot.catalog);
    setHistory(snapshot.history);
    setGrantHistory(snapshot.grantHistory);
    setNotifications(snapshot.notifications);
    setOrders(snapshot.orders);
    setGratitudeFeed(snapshot.gratitudeFeed);
    setActivity(snapshot.activity);
    setFiredItems(snapshot.wishlist);
    setIsStoreLoading(false);
    setIsActivityLoading(false);
  }

  useEffect(() => {
    if (!sessionUser) {
      setMode(initialMode);
      return;
    }

    if (sessionUser.role !== "ADMIN" && mode === "ADMIN") {
      setMode("EMPLOYEE");
    }
  }, [initialMode, sessionUser]);

  useEffect(() => {
    setAdminTab(initialAdminTab);
  }, [initialAdminTab]);

  useEffect(() => {
    setEmployeeTab(initialEmployeeTab);
  }, [initialEmployeeTab]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToastMessage(""), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  useEffect(() => {
    if (!status.title) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => setStatus({ title: "", detail: "", tone: "neutral" }),
      2600,
    );
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  useEffect(() => {
    const persistedUserId = window.localStorage.getItem(sessionStorageKey);
    if (persistedUserId) {
      setSessionUserId(persistedUserId);
    }
    setIsSessionReady(true);
  }, []);

  useEffect(() => {
    if (!sessionUserId) {
      setUsers(initialUsers);
      setQuota(initialSnapshot.quota);
      setCatalog(initialSnapshot.catalog);
      setHistory(initialSnapshot.history);
      setGrantHistory(initialSnapshot.grantHistory);
      setNotifications(initialSnapshot.notifications);
      setOrders(initialSnapshot.orders);
      setGratitudeFeed(initialSnapshot.gratitudeFeed);
      setActivity(initialSnapshot.activity);
      setFiredItems(initialSnapshot.wishlist);
      setSelectedGrantEmployeeIds([]);
      setIsStoreLoading(false);
      setIsActivityLoading(false);
      return;
    }

    setIsStoreLoading(true);
    setIsActivityLoading(true);
    void apiRequest<AppSnapshot>(`/api/bootstrap?userId=${encodeURIComponent(sessionUserId)}`)
      .then((snapshot) => {
        applySnapshot(snapshot);
      })
      .catch(() => {
        setIsStoreLoading(false);
        setIsActivityLoading(false);
        setWarningStatus("Не удалось загрузить данные", "Не удалось восстановить сессию.");
      });
  }, [sessionUserId]);

  useEffect(() => {
    const firstColleague = users.find((user) => user.role === "EMPLOYEE" && user.id !== viewerUserId);
    if (!firstColleague) {
      setSelectedRecipientId("");
      return;
    }

    setSelectedRecipientId((current) => {
      if (current && users.some((user) => user.id === current && user.role === "EMPLOYEE" && user.id !== viewerUserId)) {
        return current;
      }
      return firstColleague.id;
    });
  }, [users, viewerUserId]);

  useEffect(() => {
    if (!cartOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCartOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cartOpen]);

  useEffect(() => {
    setCartItems((current) =>
      current
        .map((line) => {
          const item = catalog.find((entry) => entry.id === line.merchItemId);
          if (!item) {
            return null;
          }

          const availableStock = stockForSize(item, line.size);
          if (availableStock <= 0) {
            return null;
          }

          return {
            ...line,
            quantity: Math.min(line.quantity, availableStock),
          };
        })
        .filter(Boolean) as CartEntry[],
    );
  }, [catalog]);

  function showToast(message: string) {
    setToastMessage(message);
  }

  function triggerCoinBurst() {
    setCoinBurst(Date.now());
  }

  function setWarningStatus(title: string, detail: string) {
    setStatus({ title, detail, tone: "warning" });
  }

  function setSuccessStatus(title: string, detail: string) {
    setStatus({ title, detail, tone: "success" });
  }

  async function detectTransparency(image: HTMLImageElement) {
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return false;
      }
      const sampleWidth = Math.min(image.naturalWidth, 64);
      const sampleHeight = Math.min(image.naturalHeight, 64);
      canvas.width = sampleWidth;
      canvas.height = sampleHeight;
      context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
      const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] < 255) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  async function createCatalogImageDraft(fileName: string, imageUrl: string) {
    const image = new window.Image();
    const dimensions = await new Promise<{ height: number; image: HTMLImageElement; width: number }>((resolve, reject) => {
      image.onload = () => {
        resolve({ width: image.naturalWidth, height: image.naturalHeight, image });
      };
      image.onerror = () => reject(new Error("Не удалось прочитать изображение."));
      image.src = imageUrl;
    });
    const initialFrameSize = getInitialCatalogFrameSize(dimensions.width, dimensions.height);
    const initialZoom = getInitialCatalogZoom(dimensions.width, dimensions.height);
    const initialMetrics = getCropImageMetricsWithZoom(dimensions.width, dimensions.height, initialZoom);
    const hasTransparency = await detectTransparency(dimensions.image);
    return {
      draft: {
        fileName,
        imageUrl,
        naturalWidth: dimensions.width,
        naturalHeight: dimensions.height,
        frameSize: initialFrameSize,
        imageOffsetX: (cropStageSize - initialMetrics.width) / 2,
        imageOffsetY: (cropStageSize - initialMetrics.height) / 2,
        frameX: (cropStageSize - initialFrameSize) / 2,
        frameY: (cropStageSize - initialFrameSize) / 2,
        zoom: initialZoom,
      } satisfies CatalogImageDraft,
      metadata: {
        hasTransparency,
        height: dimensions.height,
        width: dimensions.width,
      },
    };
  }

  function resetPhotoUploadState() {
    setPhotoUploadState({
      phase: "idle",
      detail: "Загрузите изображение для карточки товара.",
    });
  }

  function isCatalogImageDraftDirty(draft: CatalogImageDraft | null, baseline: CatalogImageDraft | null) {
    return Boolean(draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline));
  }

  function openCatalogImageDraft(draft: CatalogImageDraft, options?: { preserveStatus?: boolean }) {
    setCatalogImageDraft(draft);
    setCatalogImageBaseline(draft);
    if (!options?.preserveStatus) {
      setPhotoUploadState((current) => ({
        ...current,
        phase: "ready",
        detail: "Изображение готово к кадрированию.",
      }));
    }
  }

  function closeCatalogImageDraft(options?: { force?: boolean }) {
    if (!options?.force && isCatalogImageDraftDirty(catalogImageDraft, catalogImageBaseline)) {
      setConfirmDialog({
        title: "Изменения кадра не будут сохранены",
        detail: "Продолжить без сохранения текущего кадрирования?",
        confirmLabel: "Закрыть без сохранения",
        cancelLabel: "Остаться",
        onConfirm: () => {
          setConfirmDialog(null);
          setCatalogImageDraft(null);
          setCatalogImageBaseline(null);
        },
      });
      return false;
    }
    setCatalogImageDraft(null);
    setCatalogImageBaseline(null);
    return true;
  }

  function updateCatalogImageZoom(nextZoom: number) {
    setCatalogImageDraft((current) => {
      if (!current) {
        return current;
      }
      const clampedZoom = clamp(
        nextZoom,
        getMinimumCatalogZoom(current.naturalWidth, current.naturalHeight),
        2.5,
      );
      const previousMetrics = getCropImageMetricsWithZoom(current.naturalWidth, current.naturalHeight, current.zoom);
      const nextMetrics = getCropImageMetricsWithZoom(current.naturalWidth, current.naturalHeight, clampedZoom);
      const centerX = current.frameX + current.frameSize / 2;
      const centerY = current.frameY + current.frameSize / 2;
      const relativeX = (centerX - current.imageOffsetX) / previousMetrics.width;
      const relativeY = (centerY - current.imageOffsetY) / previousMetrics.height;
      const nextImageOffsetX = clamp(centerX - relativeX * nextMetrics.width, cropStageSize - nextMetrics.width, 0);
      const nextImageOffsetY = clamp(centerY - relativeY * nextMetrics.height, cropStageSize - nextMetrics.height, 0);
      return {
        ...current,
        zoom: clampedZoom,
        imageOffsetX: nextImageOffsetX,
        imageOffsetY: nextImageOffsetY,
      };
    });
  }

  function resetCatalogImagePosition() {
    setCatalogImageDraft((current) => {
      if (!current) {
        return current;
      }
      const metrics = getCropImageMetricsWithZoom(current.naturalWidth, current.naturalHeight, current.zoom);
      return {
        ...current,
        imageOffsetX: (cropStageSize - metrics.width) / 2,
        imageOffsetY: (cropStageSize - metrics.height) / 2,
        frameX: (cropStageSize - current.frameSize) / 2,
        frameY: (cropStageSize - current.frameSize) / 2,
      };
    });
  }

  function triggerCatalogImagePickerAfterCropClose() {
    const closed = closeCatalogImageDraft();
    if (!closed) {
      return;
    }
    window.setTimeout(() => {
      const input = document.getElementById("catalog-image-input") as HTMLInputElement | null;
      input?.click();
    }, 0);
  }

  async function reactToFeed(postId: string, reaction: ReactionKey) {
    try {
      const snapshot = await apiRequest<AppSnapshot>("/api/feed/react", {
        method: "POST",
        body: JSON.stringify({ postId, reaction, userId: viewerUserId }),
      });
      applySnapshot(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось поставить реакцию.";
      setWarningStatus("Не удалось поставить реакцию", message);
    }
  }

  async function handleGiftSubmit() {
    const recipient = users.find((user) => user.id === selectedRecipientId);
    const parsedGiftAmount = Number.parseInt(giftAmount, 10);

    if (!recipient) {
      setWarningStatus("Не удалось отправить коины", "Не найден отправитель или получатель.");
      return;
    }

    if (!Number.isFinite(parsedGiftAmount) || parsedGiftAmount <= 0) {
      setWarningStatus("Не удалось отправить коины", "Введите количество коинов больше нуля.");
      return;
    }

    try {
      const reason = giftMessage.trim() || giftReason;
      const snapshot = await apiRequest<AppSnapshot>("/api/gift", {
        method: "POST",
        body: JSON.stringify({
          senderId: viewerUserId,
          recipientId: selectedRecipientId,
          amount: parsedGiftAmount,
          reason,
        }),
      });
      applySnapshot(snapshot);
      triggerCoinBurst();
      setSuccessStatus("Коины отправлены", `${recipient.name} получил ${parsedGiftAmount} коинов.`);
      showToast(`+${parsedGiftAmount} коинов отправлено`);
      setGiftMessage("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить коины.";
      setWarningStatus("Не удалось отправить коины", message);
    }
  }

  async function handleBuyItem(itemId: string, quantity: number, selectedSize: string) {
    const item = catalog.find((catalogItem) => catalogItem.id === itemId);
    if (!item) {
      setWarningStatus("Товар не найден", "Выбранная позиция больше недоступна.");
      return;
    }

    const sizeEntry = item.sizes?.find((entry) => entry.size === selectedSize);
    if (!sizeEntry) {
      setWarningStatus("Размер не выбран", "Выберите доступный размер перед покупкой.");
      return;
    }

    try {
      const delivery = validateCheckoutDelivery(checkoutDelivery);
      if (!delivery.isValid) {
        setWarningStatus("Проверьте получение заказа", delivery.message);
        return;
      }

      const snapshot = await apiRequest<AppSnapshot>("/api/order", {
        method: "POST",
        body: JSON.stringify({
          userId: viewerUserId,
          itemId,
          quantity,
          size: selectedSize,
          delivery: checkoutDelivery,
        }),
      });
      applySnapshot(snapshot);
      setExpandedStoreItemId(null);
      triggerCoinBurst();
      setSuccessStatus(
        "Заказ оформлен",
        `${item.title} ${selectedSize} x ${quantity} оформлен · ${delivery.label}.`,
      );
      showToast(`Заказ оформлен: ${item.title} ${selectedSize} x ${quantity}`);
    } catch (error) {
      const priceGap = item.priceCoins * quantity - employee.coinBalance;
      const fallback = error instanceof Error ? error.message : "Не удалось оформить заказ.";
      if (priceGap > 0) {
        setWarningStatus("Недостаточно коинов", `Не хватает ${priceGap} коинов`);
      } else {
        setWarningStatus("Не удалось оформить заказ", fallback);
      }
    }
  }

  async function handleFireToggle(itemId: string) {
    const item = catalog.find((catalogItem) => catalogItem.id === itemId);
    if (!item) {
      return;
    }

    const alreadyFired = existsInWishlist(firedItems, itemId);
    setLockedCatalogOrder(visibleItems.map((visibleItem) => visibleItem.id));
    try {
      const snapshot = await apiRequest<AppSnapshot>("/api/wishlist/toggle", {
        method: "POST",
        body: JSON.stringify({ itemId, userId: viewerUserId }),
      });
      applySnapshot(snapshot);
      setSuccessStatus(
        "Популярность обновлена",
        alreadyFired ? "Огонёк убран" : "Огонёк добавлен",
      );
      showToast(alreadyFired ? "Огонёк убран" : "Огонёк добавлен");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось обновить популярность.";
      setWarningStatus("Не удалось обновить огонёк", message);
    }
  }

  function handleAddToCart(itemId: string, quantity: number, selectedSize: string) {
    const item = catalog.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }

    const maxStock = Math.max(stockForSize(item, selectedSize), 1);
    setCartItems((current) => {
      const existingIndex = current.findIndex(
        (line) => line.merchItemId === itemId && line.size === selectedSize,
      );

      if (existingIndex >= 0) {
        return current.map((line, index) =>
          index === existingIndex
            ? { ...line, quantity: Math.min(line.quantity + quantity, maxStock) }
            : line,
        );
      }

      return [...current, { merchItemId: itemId, quantity: Math.min(quantity, maxStock), size: selectedSize }];
    });

    setCartOpen(true);
    showToast("Товар добавлен в корзину");
  }

  function updateCartItemQuantity(itemId: string, size: string, quantity: number) {
    const item = catalog.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }

    const maxStock = Math.max(stockForSize(item, size), 1);
    setCartItems((current) =>
      current.map((line) =>
        line.merchItemId === itemId && line.size === size
          ? { ...line, quantity: Math.min(Math.max(quantity, 1), maxStock) }
          : line,
      ),
    );
  }

  function removeCartItem(itemId: string, size: string) {
    setCartItems((current) =>
      current.filter((line) => !(line.merchItemId === itemId && line.size === size)),
    );
  }

  async function handleCheckoutCart() {
    if (!cartView.canCheckout) {
      return;
    }

    try {
      const delivery = validateCheckoutDelivery(checkoutDelivery);
      if (!delivery.isValid) {
        setWarningStatus("Проверьте получение заказа", delivery.message);
        return;
      }

      setIsPurchasing(true);
      for (const line of cartView.lines) {
        const snapshot = await apiRequest<AppSnapshot>("/api/order", {
          method: "POST",
          body: JSON.stringify({
            userId: viewerUserId,
            itemId: line.merchItemId,
            quantity: line.quantity,
            size: line.size,
            delivery: checkoutDelivery,
          }),
        });
        applySnapshot(snapshot);
      }

      setCartItems([]);
      setCartOpen(false);
      setExpandedStoreItemId(null);
      setSuccessStatus("Заказ оформлен", `Все товары из корзины оформлены · ${delivery.label}.`);
      showToast("Корзина оформлена");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось оформить корзину.";
      setWarningStatus("Не удалось оформить корзину", message);
    } finally {
      setIsPurchasing(false);
    }
  }

  function updateStoreQuantity(itemId: string, value: number, maxStock: number) {
    setStoreQuantities((current) => ({
      ...current,
      [itemId]: Math.min(Math.max(value || 1, 1), Math.max(maxStock, 1)),
    }));
  }

  function updateSelectedSize(itemId: string, size: string) {
    setSelectedSizes((current) => ({ ...current, [itemId]: size }));
    setStoreQuantities((current) => ({ ...current, [itemId]: 1 }));
  }

  async function updateCatalogSizeStock(itemId: string, size: string, value: number) {
    try {
      const snapshot = await apiRequest<AppSnapshot>("/api/catalog/update", {
        method: "POST",
        body: JSON.stringify({ type: "size", actorId: viewerUserId, itemId, size, value }),
      });
      applySnapshot(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось обновить остатки.";
      setWarningStatus("Не удалось обновить остатки", message);
    }
  }

  function toggleGrantEmployee(employeeId: string) {
    setSelectedGrantEmployeeIds((current) =>
      current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId],
    );
  }

  async function handleGrantCoins(options?: { skipThresholdConfirm?: boolean; skipReasonConfirm?: boolean }) {
    try {
      const recipients = users.filter((user) => selectedGrantEmployeeIds.includes(user.id));
      if (recipients.length === 0) {
        throw new Error("Выберите хотя бы одного получателя.");
      }
      if (!Number.isInteger(grantAmount) || grantAmount <= 0) {
        throw new Error("Укажите количество коинов.");
      }
      const totalGrantAmount = grantAmount * recipients.length;
      if ((grantAmount >= 100 || totalGrantAmount >= 500) && !options?.skipThresholdConfirm) {
        setConfirmDialog({
          title: "Проверьте сумму начисления",
          detail: `${grantAmount} × ${recipients.length} = ${totalGrantAmount} коинов. Продолжить?`,
          confirmLabel: "Продолжить",
          cancelLabel: "Отмена",
          onConfirm: () => {
            setConfirmDialog(null);
            void handleGrantCoins({ ...options, skipThresholdConfirm: true });
          },
        });
        return;
      }
      if (!grantReason.trim() && !options?.skipReasonConfirm) {
        setConfirmDialog({
          title: "Причина не указана",
          detail: "Начислить коины без причины?",
          confirmLabel: "Начислить",
          cancelLabel: "Отмена",
          onConfirm: () => {
            setConfirmDialog(null);
            void handleGrantCoins({ ...options, skipThresholdConfirm: true, skipReasonConfirm: true });
          },
        });
        return;
      }
      const snapshot = await apiRequest<AppSnapshot>("/api/admin/grant", {
        method: "POST",
        body: JSON.stringify({
          actorId: viewerUserId,
          employeeIds: selectedGrantEmployeeIds,
          coins: grantAmount,
          reason: grantReason,
        }),
      });
      applySnapshot(snapshot);
      setSelectedGrantEmployeeIds([]);
      setGrantReason("");
      setSuccessStatus(
        "Коины начислены",
        recipients.length === 1
          ? `${recipients[0]?.name} получил ${grantAmount} коинов.`
          : `Начисление выполнено для ${recipients.length} пользователей.`,
      );
      showToast(`Начислено ${grantAmount} коинов`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось начислить коины.";
      setWarningStatus("Не удалось начислить коины", message);
    }
  }

  async function handleAdminOrderStatusUpdate(orderIds: string[], status: OrderStatus) {
    try {
      const snapshot = await apiRequest<AppSnapshot>("/api/admin/orders/status", {
        method: "POST",
        body: JSON.stringify({
          actorId: viewerUserId,
          orderIds,
          status,
        }),
      });
      applySnapshot(snapshot);
      setSuccessStatus(
        "Статус заказов обновлён",
        orderIds.length === 1
          ? `Заказ переведён в статус «${status}».`
          : `Обновлено ${orderIds.length} заказов · статус «${status}».`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось обновить статус заказа.";
      setWarningStatus("Не удалось обновить заказ", message);
    }
  }

  async function updateCatalogItem(
    itemId: string,
    field:
      | "title"
      | "description"
      | "priceCoins"
      | "stock"
      | "imageFit"
      | "imagePositionX"
      | "imagePositionY",
    value: string,
  ) {
    try {
      const snapshot = await apiRequest<AppSnapshot>("/api/catalog/update", {
        method: "POST",
        body: JSON.stringify({ type: "field", actorId: viewerUserId, itemId, field, value }),
      });
      applySnapshot(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось обновить товар.";
      setWarningStatus("Не удалось обновить товар", message);
    }
  }

  async function handleCatalogImageUpload(file: File | null) {
    if (!file) {
      return;
    }

    if (!supportedUploadTypes.has(file.type)) {
      setPhotoUploadState({
        phase: "error",
        detail: "Поддерживаются только PNG, JPG и WEBP.",
        error: "Формат файла не поддерживается",
      });
      return;
    }

    if (file.size > maxUploadBytes) {
      setPhotoUploadState({
        phase: "error",
        detail: "Выберите более лёгкий файл или сожмите изображение.",
        error: "Файл слишком большой. Максимальный размер — 10 MB",
        fileName: file.name,
        fileSizeLabel: formatBytes(file.size),
      });
      return;
    }

    setPhotoUploadState({
      phase: "loading",
      detail: "Подготавливаем кадрирование...",
      fileName: file.name,
      fileSizeLabel: formatBytes(file.size),
    });

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const { draft, metadata } = await createCatalogImageDraft(file.name, String(reader.result ?? ""));
        if (Math.min(metadata.width, metadata.height) < minimumImageSide) {
          setPhotoUploadState({
            phase: "error",
            detail: "Выберите изображение большего размера.",
            error: "Изображение слишком маленькое для качественной карточки",
            fileName: file.name,
            fileSizeLabel: formatBytes(file.size),
            width: metadata.width,
            height: metadata.height,
          });
          return;
        }

        setPhotoUploadState({
          phase: "ready",
          detail: "После настройки кадра сохраните результат в карточку товара.",
          fileName: file.name,
          fileSizeLabel: formatBytes(file.size),
          hasTransparency: file.type === "image/png" ? metadata.hasTransparency : false,
          warning:
            Math.min(metadata.width, metadata.height) < recommendedImageSide
              ? "Изображение меньше рекомендуемого размера. Итоговая карточка может быть чуть менее чёткой."
              : undefined,
          width: metadata.width,
          height: metadata.height,
        });
        openCatalogImageDraft(draft, { preserveStatus: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось подготовить изображение.";
        setPhotoUploadState({
          phase: "error",
          detail: message,
          error: "Не удалось прочитать файл",
          fileName: file.name,
          fileSizeLabel: formatBytes(file.size),
        });
        setWarningStatus("Не удалось открыть кадрирование", message);
      }
    };
    reader.onerror = () => {
      setPhotoUploadState({
        phase: "error",
        detail: "Браузер не смог открыть этот файл.",
        error: "Не удалось прочитать файл",
        fileName: file.name,
        fileSizeLabel: formatBytes(file.size),
      });
    };
    reader.readAsDataURL(file);
  }

  function updateCatalogEditorImagePosition(positionX: number, positionY: number) {
    setCatalogEditorDraft((current) =>
      current
        ? {
            ...current,
            imageFit: "cover",
            imagePositionX: Math.min(Math.max(positionX, 0), 100),
            imagePositionY: Math.min(Math.max(positionY, 0), 100),
          }
        : current,
    );
  }

  function handleCropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!catalogImageDraft) {
      return;
    }

    cropDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPositionX: catalogImageDraft.imageOffsetX,
      startPositionY: catalogImageDraft.imageOffsetY,
      target: "modal-image",
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCropFramePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!catalogImageDraft) {
      return;
    }

    event.stopPropagation();
    cropDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPositionX: catalogImageDraft.frameX,
      startPositionY: catalogImageDraft.frameY,
      target: "modal-frame",
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCropPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = cropDragRef.current;
    if (!catalogImageDraft || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    setCatalogImageDraft((current) => {
      if (!current) {
        return current;
      }

      if (dragState.target === "modal-frame") {
        return {
          ...current,
          frameX: clamp(dragState.startPositionX + deltaX, 0, cropStageSize - current.frameSize),
          frameY: clamp(dragState.startPositionY + deltaY, 0, cropStageSize - current.frameSize),
        };
      }

      const metrics = getCropImageMetricsWithZoom(current.naturalWidth, current.naturalHeight, current.zoom);
      return {
        ...current,
        imageOffsetX: clamp(dragState.startPositionX + deltaX, cropStageSize - metrics.width, 0),
        imageOffsetY: clamp(dragState.startPositionY + deltaY, cropStageSize - metrics.height, 0),
      };
    });
  }

  function handleCropPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (cropDragRef.current?.pointerId === event.pointerId) {
      cropDragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleCropWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    updateCatalogImageZoom((catalogImageDraft?.zoom ?? 1) + (event.deltaY < 0 ? 0.08 : -0.08));
  }

  function handleEditorPreviewPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!catalogEditorDraft?.imageUrl) {
      return;
    }

    cropDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPositionX: catalogEditorDraft.imagePositionX ?? 50,
      startPositionY: catalogEditorDraft.imagePositionY ?? 50,
      target: "editor",
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleEditorPreviewPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !catalogEditorDraft?.imageUrl ||
      !cropDragRef.current ||
      cropDragRef.current.pointerId !== event.pointerId ||
      cropDragRef.current.target !== "editor"
    ) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const deltaX = ((event.clientX - cropDragRef.current.startX) / rect.width) * 100;
    const deltaY = ((event.clientY - cropDragRef.current.startY) / rect.height) * 100;

    updateCatalogEditorImagePosition(
      cropDragRef.current.startPositionX - deltaX,
      cropDragRef.current.startPositionY - deltaY,
    );
  }

  function handleEditorPreviewPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (cropDragRef.current?.pointerId === event.pointerId) {
      cropDragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function applyCatalogImageCrop() {
    if (!catalogImageDraft) {
      return;
    }

    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Не удалось подготовить изображение."));
      image.src = catalogImageDraft.imageUrl;
    });

    const metrics = getCropImageMetricsWithZoom(
      catalogImageDraft.naturalWidth,
      catalogImageDraft.naturalHeight,
      catalogImageDraft.zoom,
    );
    const sourceSize = catalogImageDraft.frameSize / metrics.scale;
    const sourceX = clamp((catalogImageDraft.frameX - catalogImageDraft.imageOffsetX) / metrics.scale, 0, catalogImageDraft.naturalWidth - sourceSize);
    const sourceY = clamp((catalogImageDraft.frameY - catalogImageDraft.imageOffsetY) / metrics.scale, 0, catalogImageDraft.naturalHeight - sourceSize);
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1200;
    const context = canvas.getContext("2d");
    if (!context) {
      setWarningStatus("Не удалось сохранить кадр", "Браузер не поддерживает обработку изображения.");
      return;
    }
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, canvas.width, canvas.height);
    const croppedImageUrl = canvas.toDataURL("image/jpeg", 0.92);

    setCatalogEditorDraft((current) =>
      current
        ? {
            ...current,
            imageUrl: croppedImageUrl,
            imageFit: "cover",
            imagePositionX: 50,
            imagePositionY: 50,
          }
        : current,
    );
    setCatalogImageDraft(null);
    setCatalogImageBaseline(null);
    setPhotoUploadState((current) => ({
      ...current,
      phase: "ready",
      detail: "Фото подготовлено и используется в карточке товара.",
    }));
    setSuccessStatus("Фото товара обновлено", `${catalogImageDraft.fileName} подготовлен для товара.`);
    showToast("Миниатюра сохранена");
  }

  const catalogCropMetrics = catalogImageDraft
    ? getCropImageMetricsWithZoom(catalogImageDraft.naturalWidth, catalogImageDraft.naturalHeight, catalogImageDraft.zoom)
    : null;
  const cropPreviewScale = catalogImageDraft ? 200 / catalogImageDraft.frameSize : 1;

  async function toggleCatalogItem(itemId: string, isActive?: boolean) {
    try {
      const snapshot = await apiRequest<AppSnapshot>("/api/catalog/manage", {
        method: "POST",
        body: JSON.stringify({
          action: "visibility",
          actorId: viewerUserId,
          itemId,
          isActive: isActive ?? !(catalog.find((item) => item.id === itemId)?.isActive ?? true),
        }),
      });
      applySnapshot(snapshot);
      setSuccessStatus("Каталог обновлён", "Доступность товара изменена.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось изменить доступность товара.";
      setWarningStatus("Не удалось изменить доступность товара", message);
    }
  }

  async function markNotificationsRead() {
    try {
      const snapshot = await apiRequest<AppSnapshot>("/api/notifications/read-all", {
        method: "POST",
        body: JSON.stringify({ userId: viewerUserId }),
      });
      applySnapshot(snapshot);
      setNotificationsOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось обновить уведомления.";
      setWarningStatus("Не удалось обновить уведомления", message);
    }
  }

  function openCatalogEditor(item?: MerchItem) {
    const draft = createCatalogDraft(item);
    setCatalogEditorDraft(draft);
    setCatalogEditorBaseline(draft);
    if (draft.imageUrl) {
      setPhotoUploadState({
        phase: "ready",
        detail: "Фото уже используется в карточке. Можно заменить его или заново подогнать кадр.",
      });
    } else {
      resetPhotoUploadState();
    }
    setStatus({
      title: item ? "Редактор товара открыт" : "Создание товара",
      detail: item ? item.title : "Заполни поля нового товара.",
      tone: "neutral",
    });
  }

  function closeCatalogEditor() {
    if (isCatalogEditorDirty) {
      setConfirmDialog({
        title: "Есть несохранённые изменения",
        detail: "Закрыть редактор без сохранения?",
        confirmLabel: "Закрыть",
        cancelLabel: "Отмена",
        onConfirm: () => {
          setConfirmDialog(null);
          setCatalogEditorDraft(null);
          setCatalogEditorBaseline(null);
          closeCatalogImageDraft({ force: true });
          resetPhotoUploadState();
        },
      });
      return;
    }

    setCatalogEditorDraft(null);
    setCatalogEditorBaseline(null);
    closeCatalogImageDraft({ force: true });
    resetPhotoUploadState();
  }

  function updateCatalogEditorDraft(patch: Partial<CatalogEditorDraft>) {
    setCatalogEditorDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function updateCatalogEditorSize(index: number, field: "size" | "stock", value: string) {
    setCatalogEditorDraft((current) => {
      if (!current?.sizes) {
        return current;
      }

      const nextSizes = current.sizes.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              [field]:
                field === "stock"
                  ? Math.max(Number(value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "")) || 0, 0)
                  : value.slice(0, 3),
            }
          : entry,
      );

      return { ...current, sizes: nextSizes };
    });
  }

  function addCatalogEditorSize() {
    setCatalogEditorDraft((current) =>
      current
        ? {
            ...current,
            sizes: [...(current.sizes ?? []), { size: "", stock: 0 }],
          }
        : current,
    );
  }

  function removeCatalogEditorSize(index: number) {
    setCatalogEditorDraft((current) =>
      current
        ? {
            ...current,
            sizes: (current.sizes ?? []).filter((_, entryIndex) => entryIndex !== index),
          }
        : current,
    );
  }

  async function saveCatalogEditorDraft() {
    if (!catalogEditorDraft) {
      return;
    }

    const nextTitle = catalogEditorDraft.title.trim();
    const nextPrice = catalogEditorDraft.priceCoins;
    const nextSizes = (catalogEditorDraft.sizes ?? []).map((entry) => ({
      size: entry.size.trim(),
      stock: Math.max(Number(entry.stock) || 0, 0),
    }));
    const duplicateSizes = new Set<string>();
    const seenSizes = new Set<string>();

    for (const entry of nextSizes) {
      const key = entry.size.toLowerCase();
      if (!key) {
        continue;
      }
      if (seenSizes.has(key)) {
        duplicateSizes.add(key);
      }
      seenSizes.add(key);
    }

    if (!nextTitle) {
      setWarningStatus("Не удалось сохранить товар", "Укажите название товара.");
      return;
    }

    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      setWarningStatus("Не удалось сохранить товар", "Цена не может быть отрицательной.");
      return;
    }

    if (nextSizes.some((entry) => !entry.size || !Number.isInteger(entry.stock) || entry.stock < 0)) {
      setWarningStatus("Не удалось сохранить товар", "Проверьте размеры и остатки.");
      return;
    }

    if (duplicateSizes.size > 0) {
      setWarningStatus("Не удалось сохранить товар", "Размеры не должны повторяться.");
      return;
    }

    try {
      const snapshot = await apiRequest<AppSnapshot>("/api/catalog/manage", {
        method: "POST",
        body: JSON.stringify({
          action: "upsert",
          actorId: viewerUserId,
          item: {
            ...catalogEditorDraft,
            id: catalogEditorDraft.id || `m-${Date.now()}`,
            slug: catalogEditorDraft.slug || catalogEditorDraft.title,
            title: nextTitle,
            priceCoins: nextPrice,
            sizes: nextSizes,
            stock: nextSizes.reduce((sum, entry) => sum + entry.stock, 0),
          },
        }),
      });
      applySnapshot(snapshot);
      setCatalogEditorDraft(null);
      setCatalogEditorBaseline(null);
      setSuccessStatus("Каталог обновлён", "Товар сохранён.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сохранить товар.";
      setWarningStatus("Не удалось сохранить товар", message);
    }
  }

  async function duplicateCatalogItem(itemId: string) {
    try {
      const snapshot = await apiRequest<AppSnapshot>("/api/catalog/manage", {
        method: "POST",
        body: JSON.stringify({ action: "duplicate", actorId: viewerUserId, itemId }),
      });
      applySnapshot(snapshot);
      setSuccessStatus("Каталог обновлён", "Товар продублирован.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось дублировать товар.";
      setWarningStatus("Не удалось дублировать товар", message);
    }
  }

  async function deleteCatalogItem(itemId: string) {
    try {
      const snapshot = await apiRequest<AppSnapshot>("/api/catalog/manage", {
        method: "POST",
        body: JSON.stringify({ action: "delete", actorId: viewerUserId, itemId }),
      });
      applySnapshot(snapshot);
      setSuccessStatus("Каталог обновлён", "Товар удалён.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось удалить товар.";
      setWarningStatus("Не удалось удалить товар", message);
    }
  }

  async function applyBulkCatalogVisibility(itemIds: string[], isActive: boolean) {
    if (itemIds.length === 0) {
      return;
    }

    try {
      let latestSnapshot: AppSnapshot | null = null;
      for (const itemId of itemIds) {
        latestSnapshot = await apiRequest<AppSnapshot>("/api/catalog/manage", {
          method: "POST",
          body: JSON.stringify({ action: "visibility", actorId: viewerUserId, itemId, isActive }),
        });
      }
      if (latestSnapshot) {
        applySnapshot(latestSnapshot);
      }
      setSuccessStatus("Каталог обновлён", isActive ? "Товары опубликованы." : "Товары скрыты.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось обновить каталог.";
      setWarningStatus("Не удалось обновить каталог", message);
    }
  }

  async function applyBulkCatalogDelete(itemIds: string[]) {
    if (itemIds.length === 0) {
      return;
    }

    try {
      let latestSnapshot: AppSnapshot | null = null;
      for (const itemId of itemIds) {
        latestSnapshot = await apiRequest<AppSnapshot>("/api/catalog/manage", {
          method: "POST",
          body: JSON.stringify({ action: "delete", actorId: viewerUserId, itemId }),
        });
      }
      if (latestSnapshot) {
        applySnapshot(latestSnapshot);
      }
      setSuccessStatus("Каталог обновлён", "Выбранные товары удалены.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось удалить товары.";
      setWarningStatus("Не удалось удалить товары", message);
    }
  }

  async function handleLogin() {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setLoginError("Введите логин и пароль.");
      return;
    }

    try {
      setIsAuthenticating(true);
      setLoginError("");
      const auth = await apiRequest<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      window.localStorage.setItem(sessionStorageKey, auth.user.id);
      setSessionUserId(auth.user.id);
      applySnapshot(auth.snapshot);
      setUsers(auth.snapshot.users);
      setMode("EMPLOYEE");
      setProfileMenuOpen(false);
      setNotificationsOpen(false);
      setCartOpen(false);
      setLoginPassword("");
      setSuccessStatus(
        "Вход выполнен",
        auth.user.role === "ADMIN" ? "Вы вошли как администратор." : "Вы вошли как сотрудник.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось войти в систему.";
      setLoginError(message);
    } finally {
      setIsAuthenticating(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(sessionStorageKey);
    setSessionUserId(null);
    setLoginUsername("");
    setLoginPassword("");
    setLoginError("");
    setProfileMenuOpen(false);
    setNotificationsOpen(false);
    setCartOpen(false);
    setMode("EMPLOYEE");
  }

  async function changeUserRole(targetUserId: string, role: "ADMIN" | "EMPLOYEE") {
    try {
      const snapshot = await apiRequest<AppSnapshot>("/api/admin/role", {
        method: "POST",
        body: JSON.stringify({ actorId: viewerUserId, targetUserId, role }),
      });
      applySnapshot(snapshot);
      setSuccessStatus(
        "Права обновлены",
        role === "ADMIN" ? "Пользователь назначен администратором." : "Права администратора сняты.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось изменить права.";
      setWarningStatus("Не удалось изменить права", message);
    }
  }

  if (!isSessionReady) {
    return (
      <main className="auth-shell">
        <div className="auth-card auth-card-loading">
          <strong>Загружаем сессию...</strong>
        </div>
      </main>
    );
  }

  if (!sessionUser) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-copy">
            <span className="badge">Корпоративный мерч</span>
            <h1>Вход в систему</h1>
            <p>Войдите как сотрудник или администратор. Права доступа определяются вашей ролью.</p>
          </div>

          <div className="auth-grid">
            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                void handleLogin();
              }}
            >
              <label className="field">
                <span>Логин</span>
                <input
                  autoComplete="username"
                  placeholder="Введите логин"
                  value={loginUsername}
                  onChange={(event) => setLoginUsername(event.target.value)}
                />
              </label>

              <label className="field">
                <span>Пароль</span>
                <input
                  autoComplete="current-password"
                  placeholder="Введите пароль"
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
              </label>

              {loginError ? <p className="auth-error">{loginError}</p> : null}

              <button className="action-button auth-submit" disabled={isAuthenticating} type="submit">
                {isAuthenticating ? "Входим..." : "Войти"}
              </button>
            </form>

            <div className="auth-demo-list">
              <article className="auth-demo-card">
                <strong>Тестовый сотрудник</strong>
                <p>
                  Логин: <code>employee</code>
                </p>
                <p>
                  Пароль: <code>employee123</code>
                </p>
              </article>
              <article className="auth-demo-card">
                <strong>Тестовый администратор</strong>
                <p>
                  Логин: <code>admin</code>
                </p>
                <p>
                  Пароль: <code>admin123</code>
                </p>
              </article>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={isStorePage ? "page-shell page-shell-store" : "page-shell"}>
      {mode === "EMPLOYEE" || !canAccessAdmin ? (
        <div className="employee-header-wrap">
          <Header
            activeTab={employeeTab}
            adminHref={canAccessAdmin ? "/?mode=admin&tab=grants" : undefined}
            availableCoins={employee.coinBalance}
            cartCount={cartItems.reduce((sum, line) => sum + line.quantity, 0)}
            onAccountClick={() => setProfileMenuOpen((current) => !current)}
            onCartClick={() => setCartOpen((current) => !current)}
            notificationCount={unreadNotifications}
            onNotificationsClick={() => setNotificationsOpen((current) => !current)}
            user={employee}
          />

          {notificationsOpen ? (
            <div className="notifications-popover employee-header-popover">
              <div className="notifications-head">
                <strong>Уведомления</strong>
                <button className="link-button" onClick={markNotificationsRead} type="button">
                  Прочитать все
                </button>
              </div>
              <div className="notifications-list">
                {notifications.length > 0 ? (
                  notifications.slice(0, 6).map((item) => (
                    <div className={item.unread ? "notification-card unread" : "notification-card"} key={item.id}>
                      <span className="notification-dot" />
                      <p>{item.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="notifications-empty">Пока уведомлений нет.</p>
                )}
              </div>
            </div>
          ) : null}

          {profileMenuOpen ? (
            <div className="profile-popover employee-header-account-popover">
              <div className="profile-popover-head">
                <div className="profile-avatar">{initials(activeUser.name)}</div>
                <div>
                  <strong>{activeUser.name}</strong>
                  <p>{activeUser.team ?? "Команда не указана"}</p>
                </div>
              </div>
              <div className="profile-popover-actions">
                {canAccessAdmin ? (
                  <button
                    className="action-button secondary"
                    onClick={() => {
                      setMode("ADMIN");
                      setProfileMenuOpen(false);
                    }}
                    type="button"
                  >
                    Админ
                  </button>
                ) : null}
                <button className="action-button secondary" onClick={handleLogout} type="button">
                  Выйти
                </button>
              </div>
            </div>
          ) : null}

          {cartOpen ? (
            <div className="cart-drawer-layer" onClick={() => setCartOpen(false)}>
              <aside aria-label="Корзина" className="cart-drawer" onClick={(event) => event.stopPropagation()}>
                <div className="cart-drawer-head">
                  <div>
                    <strong>Корзина</strong>
                    <p>{cartView.totalItems > 0 ? `${cartView.totalItems} товаров к оформлению` : "Добавляйте товары из каталога"}</p>
                  </div>
                  <button className="cart-drawer-close" onClick={() => setCartOpen(false)} type="button">
                    ×
                  </button>
                </div>

                <div className="cart-list">
                  {cartView.lines.length > 0 ? (
                    cartView.lines.map((line) => (
                      <article className="cart-row" key={`${line.merchItemId}-${line.size}`}>
                        <div className={line.item.imageFit === "cover" ? "catalog-thumb cover" : "catalog-thumb"}>
                          {line.item.imageUrl ? <img alt={line.item.title} src={line.item.imageUrl} /> : <span>{line.item.title[0]}</span>}
                        </div>
                        <div className="cart-row-main">
                          <div className="cart-row-copy">
                            <strong>{line.item.title}</strong>
                            <p>
                              {line.size} • {line.item.priceCoins} коинов
                            </p>
                          </div>
                          <div className="cart-qty-row">
                            <button
                              disabled={line.quantity <= 1}
                              onClick={() => updateCartItemQuantity(line.merchItemId, line.size, line.quantity - 1)}
                              type="button"
                            >
                              −
                            </button>
                            <span>{line.quantity}</span>
                            <button
                              disabled={line.quantity >= Math.max(line.availableStock, 1)}
                              onClick={() => updateCartItemQuantity(line.merchItemId, line.size, line.quantity + 1)}
                              type="button"
                            >
                              +
                            </button>
                          </div>
                          <div className="cart-row-meta">
                            <span className={line.availableStock <= 5 ? "warning" : ""}>
                              {line.availableStock <= 0
                                ? "Нет в наличии"
                                : line.availableStock <= 5
                                  ? `Осталось ${line.availableStock}`
                                  : `В наличии ${line.availableStock}`}
                            </span>
                            <button
                              className="link-button muted-link"
                              onClick={() => removeCartItem(line.merchItemId, line.size)}
                              type="button"
                            >
                              Убрать
                            </button>
                          </div>
                        </div>
                        <div className="cart-row-side">
                          <strong>{line.total}</strong>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="cart-empty-state">
                      <strong>Корзина пока пуста</strong>
                      <p>Откройте товар и добавьте его в корзину, чтобы оформить позже одним действием.</p>
                      <button className="action-button secondary" onClick={() => setCartOpen(false)} type="button">
                        Продолжить покупки
                      </button>
                    </div>
                  )}
                </div>

                {cartView.lines.length > 0 ? (
                  <div className="cart-footer">
                    <div className="cart-delivery-panel">
                      <div className="cart-delivery-head">
                        <strong>Получение заказа</strong>
                        <span>{deliveryValidation.label}</span>
                      </div>

                      <div className="cart-delivery-options" role="radiogroup" aria-label="Способ получения заказа">
                        <button
                          className={checkoutDelivery.method === "moscow-office" ? "cart-delivery-option active" : "cart-delivery-option"}
                          onClick={() => setCheckoutDelivery((current) => ({ ...current, method: "moscow-office" }))}
                          type="button"
                        >
                          Заберу в московском офисе
                        </button>
                        <button
                          className={checkoutDelivery.method === "samara-office" ? "cart-delivery-option active" : "cart-delivery-option"}
                          onClick={() => setCheckoutDelivery((current) => ({ ...current, method: "samara-office" }))}
                          type="button"
                        >
                          Заберу в самарском офисе
                        </button>
                        <button
                          className={checkoutDelivery.method === "delivery" ? "cart-delivery-option active" : "cart-delivery-option"}
                          onClick={() => setCheckoutDelivery((current) => ({ ...current, method: "delivery" }))}
                          type="button"
                        >
                          Доставка
                        </button>
                      </div>

                      {checkoutDelivery.method === "delivery" ? (
                        <div className="cart-delivery-fields">
                          <label className="field">
                            <span>Адрес доставки</span>
                            <input
                              placeholder="Улица, дом, квартира"
                              value={checkoutDelivery.address}
                              onChange={(event) =>
                                setCheckoutDelivery((current) => ({ ...current, address: event.target.value }))
                              }
                            />
                          </label>
                          <div className="cart-delivery-fields-row">
                            <label className="field">
                              <span>Индекс</span>
                              <input
                                inputMode="numeric"
                                placeholder="Например: 125047"
                                value={checkoutDelivery.postalCode}
                                onChange={(event) =>
                                  setCheckoutDelivery((current) => ({
                                    ...current,
                                    postalCode: event.target.value.replace(/[^\d]/g, "").slice(0, 6),
                                  }))
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Телефон</span>
                              <input
                                inputMode="tel"
                                placeholder="+7 (999) 123-45-67"
                                value={checkoutDelivery.phone}
                                onChange={(event) =>
                                  setCheckoutDelivery((current) => ({
                                    ...current,
                                    phone: formatRussianPhone(event.target.value),
                                  }))
                                }
                              />
                            </label>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="cart-summary-grid">
                      <div>
                        <span>Итого</span>
                        <strong>{cartView.totalCoins} коинов</strong>
                      </div>
                      <div>
                        <span>Баланс</span>
                        <strong>{employee.coinBalance} коинов</strong>
                      </div>
                    </div>

                    {!cartView.canCheckout ? (
                      <div className="cart-checkout-state warning">
                        {!deliveryValidation.isValid
                          ? deliveryValidation.message
                          : cartView.totalCoins > employee.coinBalance
                          ? `Не хватает ${cartView.totalCoins - employee.coinBalance} коинов`
                          : "Проверьте остатки товаров в корзине"}
                      </div>
                    ) : (
                      <div className="cart-checkout-state success">Все готово к оформлению · {deliveryValidation.label}</div>
                    )}

                    <div className="cart-footer-actions">
                      <button
                        className="action-button secondary"
                        onClick={() => setCartOpen(false)}
                        type="button"
                      >
                        ← Вернуться в магазин
                      </button>
                      <button className="action-button" disabled={!cartView.canCheckout || isPurchasing} onClick={handleCheckoutCart} type="button">
                        {isPurchasing ? "Покупаем..." : `Оформить за ${cartView.totalCoins}`}
                      </button>
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="employee-header-wrap">
          <header className="employee-header">
            <div className="employee-header-main">
              <div className="employee-header-title">
                <h1>Корпоративный магазин мерча</h1>
              </div>
              <nav className="employee-header-tabs" aria-label="Навигация администратора">
                <button
                  className={adminTab === "GRANTS" ? "employee-tab active" : "employee-tab"}
                  onClick={() => setAdminTab("GRANTS")}
                  type="button"
                >
                  Начисления
                </button>
                <button
                  className={adminTab === "ORDERS" ? "employee-tab active" : "employee-tab"}
                  onClick={() => setAdminTab("ORDERS")}
                  type="button"
                >
                  Заказы
                </button>
                <button
                  className={adminTab === "CATALOG" ? "employee-tab active" : "employee-tab"}
                  onClick={() => setAdminTab("CATALOG")}
                  type="button"
                >
                  Магазин мерча
                </button>
              </nav>
            </div>

            <div className="employee-header-side">
              <button
                className="header-mode-toggle"
                onClick={() => setMode("EMPLOYEE")}
                type="button"
              >
                Сотрудник
              </button>

              <div className="header-badge coins compact admin-header-badge">
                <span className="header-badge-icon">{iconSpark()}</span>
                <div className="header-badge-copy">
                  <strong>Админ</strong>
                  <span>управление магазином</span>
                </div>
              </div>

              <button className="header-account" onClick={() => setProfileMenuOpen((current) => !current)} type="button">
                <span className="header-account-avatar">{initials(activeUser.name)}</span>
                <div className="header-account-copy">
                  <strong>{activeUser.name}</strong>
                  <span>{activeUser.jobTitle ?? "People Ops Admin"}</span>
                </div>
              </button>

              {profileMenuOpen ? (
                <div className="profile-popover employee-header-account-popover">
                  <div className="profile-popover-head">
                    <div className="profile-avatar">{initials(activeUser.name)}</div>
                    <div>
                      <strong>{activeUser.name}</strong>
                      <p>{activeUser.team ?? "HQ"}</p>
                    </div>
                  </div>
                  <div className="profile-popover-actions">
                    <button
                      className="action-button secondary"
                      onClick={() => {
                        setMode("EMPLOYEE");
                        setProfileMenuOpen(false);
                      }}
                      type="button"
                    >
                      Сотрудник
                    </button>
                    <button className="action-button secondary" onClick={handleLogout} type="button">
                      Выйти
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </header>
        </div>
      )}

      {mode === "EMPLOYEE" || !canAccessAdmin ? (
        <>
          {employeeTab === "PROFILE" ? (
            <section className="employee-dashboard section-gap">
              <div className="profile-left">
                <ProfileCard user={employee} />
                <RecentPurchases orders={orders} onShowAll={() => setProfileOverlay("orders")} />
              </div>

              <div className="profile-right">
                <StatsPanel
                  availableCoins={employee.coinBalance}
                  gratitudeLimitTotal={MONTHLY_GIFT_LIMIT}
                  gratitudeLimitUsed={giftCoinsUsed}
                />
                <div className="profile-action-row">
                  <SendGratitudePanel
                    amount={giftAmount}
                    colleagues={colleagueOptions}
                    message={giftMessage}
                    onAmountChange={(value) => setGiftAmount(value.replace(/[^\d]/g, ""))}
                    onMessageChange={setGiftMessage}
                    onRecipientChange={setSelectedRecipientId}
                    onSubmit={handleGiftSubmit}
                    remainingLimit={availableGiftCoins}
                    selectedRecipientId={selectedRecipientId}
                  />
                  <GratitudeFeed
                    currentUserId={viewerUserId}
                    events={profileGratitudeEvents}
                    onShowAll={() => setProfileOverlay("gratitude")}
                    users={users}
                  />
                </div>
              </div>
            </section>
          ) : null}

          {employeeTab === "STORE" ? (
            <>
              <ShopCatalog
                availableCoins={employee.coinBalance}
                categories={storeCategories}
                expandedProductId={expandedStoreItemId}
                firedItems={firedItems}
                loading={isStoreLoading}
                onAddToCart={handleAddToCart}
                onCategoryChange={(category) =>
                  setSelectedCategory((current) => {
                    if (category === allCategoryLabel) {
                      return null;
                    }

                    return current === category ? null : category;
                  })
                }
                onChangeQuantity={updateStoreQuantity}
                onSearchChange={setProductSearch}
                onSelectSize={updateSelectedSize}
                onSortChange={setSortMode}
                onToggleExpand={(itemId) =>
                  setExpandedStoreItemId((current) => (current === itemId ? null : itemId))
                }
                onToggleFire={handleFireToggle}
                products={visibleItems}
                quantities={storeQuantities}
                searchQuery={productSearch}
                searchSuggestions={searchSuggestions}
                selectedCategory={selectedCategory}
                selectedSizes={selectedSizes}
                sortMode={sortMode}
                sortModes={sortModes}
              />
            </>
          ) : null}

          {employeeTab === "HISTORY" ? (
            <>
              <ActivityHistoryPage
                coinTransactions={history}
                currentUser={employee}
                gratitudeFeed={gratitudeFeed}
                loading={isActivityLoading}
                onReact={reactToFeed}
              />
            </>
          ) : null}
        </>
      ) : (
        <>
          {adminTab === "GRANTS" ? (
            <>
              <section className="admin-section section-gap">
                <div className="admin-section-head">
                  <div>
                    <h2>Начисления</h2>
                    <p>Управление коинами сотрудников и история последних операций.</p>
                  </div>
                </div>
                <div className="grid two-up admin-dashboard-grid">
                  <GrantCoinsPanel
                    coins={grantAmount}
                    employees={grantRecipients}
                    onClearSelection={() => setSelectedGrantEmployeeIds([])}
                    onCoinsChange={setGrantAmount}
                    onReasonChange={setGrantReason}
                    onSelectMany={(employeeIds) =>
                      setSelectedGrantEmployeeIds((current) => Array.from(new Set([...current, ...employeeIds])))
                    }
                    onSubmit={handleGrantCoins}
                    onToggleEmployee={toggleGrantEmployee}
                    reason={grantReason}
                    selectedEmployeeIds={selectedGrantEmployeeIds}
                  />
                  <GrantHistoryList entries={grantHistory} limit={4} onShowAll={() => setGrantHistoryOverlayOpen(true)} />
                </div>

                <section className="grid two-up section-gap admin-secondary-grid">
                  <article className="panel">
                    <div className="panel-head panel-head-stack">
                      <div>
                        <h2>Автоматические начисления</h2>
                        <p>Системные сценарии, которые сейчас реально работают без ручного участия.</p>
                      </div>
                      <span className="badge">Авто</span>
                    </div>
                    <div className="auto-rewards-grid">
                      <div className="auto-reward-card">
                        <strong>🎂 День рождения</strong>
                        <p>+50 коинов</p>
                        <span>Раз в год, в день рождения сотрудника, по дате в профиле.</span>
                      </div>
                    </div>
                  </article>

                  <article className="panel">
                    <div className="panel-head panel-head-stack">
                      <div>
                        <h2>Аналитика</h2>
                        <p>Короткая сводка по активности и состоянию системы мерча.</p>
                      </div>
                      <span className="badge">Сводка</span>
                    </div>
                    <div className="list-stack">
                      {analytics.map((item) => (
                        <div className="analytics-row" key={item.label}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  </article>
                </section>

                <section className="panel section-gap">
                  <div className="panel-head panel-head-stack">
                    <div>
                      <h2>Администраторы системы</h2>
                      <p>Назначайте новых администраторов и управляйте правами доступа.</p>
                    </div>
                    <span className="badge">{adminUsers.length} админов</span>
                  </div>

                  <div className="admin-role-toolbar">
                    <label className="field compact">
                      <span>Поиск пользователя</span>
                      <input
                        placeholder="Поиск по имени, email или логину"
                        value={adminRoleSearch}
                        onChange={(event) => setAdminRoleSearch(event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="admin-role-current">
                    <strong>Текущие администраторы</strong>
                    <div className="admin-role-chip-list">
                      {adminUsers.map((user) => {
                        const isSelf = user.id === viewerUserId;

                        return (
                          <div className="admin-role-chip" key={user.id}>
                            <span className="admin-role-avatar">{initials(user.name)}</span>
                            <div className="admin-role-chip-copy">
                              <strong>{user.name}</strong>
                              <span>{user.email}</span>
                            </div>
                            <button
                              className="link-button"
                              disabled={isSelf}
                              onClick={() => changeUserRole(user.id, "EMPLOYEE")}
                              type="button"
                            >
                              {isSelf ? "Текущий админ" : "Снять права"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {adminRoleSearch.trim() ? (
                    <div className="admin-role-search-results">
                      <div className="admin-role-search-head">
                        <strong>Результаты поиска</strong>
                        <span>{manageableUsers.length} найдено</span>
                      </div>

                      <div className="admin-role-list">
                        {manageableUsers.map((user) => {
                          const isSelf = user.id === viewerUserId;
                          const nextRole = user.role === "ADMIN" ? "EMPLOYEE" : "ADMIN";

                          return (
                            <div className="admin-role-row" key={user.id}>
                              <div className="admin-role-main">
                                <span className="admin-role-avatar">{initials(user.name)}</span>
                                <div>
                                  <strong>{user.name}</strong>
                                  <p>
                                    {user.team ?? "Команда не указана"} · {user.email}
                                  </p>
                                </div>
                              </div>
                              <div className="admin-role-side">
                                <span className={user.role === "ADMIN" ? "grant-type-badge automatic" : "grant-type-badge manual"}>
                                  {user.role === "ADMIN" ? "Администратор" : "Сотрудник"}
                                </span>
                                <button
                                  className="action-button secondary compact"
                                  disabled={isSelf && nextRole === "EMPLOYEE"}
                                  onClick={() => changeUserRole(user.id, nextRole)}
                                  type="button"
                                >
                                  {user.role === "ADMIN" ? (isSelf ? "Текущий админ" : "Снять права") : "Назначить админом"}
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {manageableUsers.length === 0 ? (
                          <div className="admin-role-empty">
                            <strong>Ничего не найдено</strong>
                            <span>Попробуйте изменить запрос</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="admin-role-hint">
                      <strong>Поиск сотрудника</strong>
                      <span>Введите имя или email, чтобы назначить нового администратора.</span>
                    </div>
                  )}
                </section>
              </section>

            </>
          ) : null}

          {adminTab === "CATALOG" ? (
            <section className="admin-section section-gap">
              <div className="admin-section-head">
                <div>
                  <h2>Редактирование магазина мерча</h2>
                  <p>Каталог, публикация товаров, остатки и состояние магазина.</p>
                </div>
              </div>

              <CatalogTable
                onBulkDelete={applyBulkCatalogDelete}
                onBulkVisibilityChange={applyBulkCatalogVisibility}
                editingItemId={catalogEditorDraft?.id ?? null}
                items={filteredAdminCatalog}
                onAdd={() => openCatalogEditor()}
                onDelete={deleteCatalogItem}
                onDuplicate={duplicateCatalogItem}
                onEdit={openCatalogEditor}
                onSearchChange={setCatalogSearch}
                onVisibilityChange={toggleCatalogItem}
                search={catalogSearch}
              />
            </section>
          ) : null}
          {adminTab === "ORDERS" ? (
            <AdminOrdersPanel orders={orders} onUpdateStatus={handleAdminOrderStatusUpdate} />
          ) : null}
        </>
      )}

      {toastMessage ? (
        <div className="toast" role="status" aria-live="polite">
          <span className="toast-icon">{iconCoin()}</span>
          <span>{toastMessage}</span>
        </div>
      ) : null}
      {status.title ? (
        <div className={`floating-status ${status.tone}`} role="status" aria-live="polite">
          <strong>{status.title}</strong>
          {status.detail ? <span>{status.detail}</span> : null}
        </div>
      ) : null}
      {coinBurst ? (
        <div className="coin-burst" key={coinBurst} aria-hidden="true">
          <span>🪙</span>
          <span>🪙</span>
          <span>🪙</span>
        </div>
      ) : null}
      {profileOverlay ? (
        <div className="info-modal-backdrop" onClick={() => setProfileOverlay(null)} role="presentation">
          <div
            aria-modal="true"
            className="info-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="panel-head">
              <h2>
                {profileOverlay === "orders" ? "Все заказы" : "Все благодарности"}
              </h2>
              <button className="link-button" onClick={() => setProfileOverlay(null)} type="button">
                Закрыть
              </button>
            </div>

            <div className="info-modal-body">
              {profileOverlay === "orders" ? (
                <div className="list-stack">
                  {orders.map((order) => (
                    <div className="order-card" key={order.id}>
                      <strong>{order.itemTitle}</strong>
                      <p>
                        Получение: {order.delivery}
                        <br />
                        Дата: {order.date}
                      </p>
                      <div className="order-progress">
                        {orderSteps.map((step) => (
                          <span
                            className={orderSteps.indexOf(step) <= orderSteps.indexOf(order.status) ? "step active" : "step"}
                            key={step}
                          >
                            ● {step}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="feed-v2-list modal-feed-list">
                  {gratitudeFeed.map((event) => {
                    const receiver = users.find((user) => user.name === event.to);
                    const sender = users.find((user) => user.name === event.from);
                    const title =
                      receiver?.name === employee.name
                        ? `${event.from} → вам`
                        : sender?.name === employee.name
                          ? `Вы → ${event.to}`
                          : `${event.from} → ${event.to}`;

                    return (
                      <div className="feed-v2-row" key={event.id}>
                        <span className="feed-v2-avatar">{initials(event.from)}</span>
                        <div className="feed-v2-copy">
                          <strong>{title}</strong>
                          <p>{event.message}</p>
                          <span>{event.date}</span>
                        </div>
                        <div className="feed-v2-coins">+{event.amount} коинов</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {grantHistoryOverlayOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="info-modal-backdrop" onClick={() => setGrantHistoryOverlayOpen(false)} role="presentation">
              <div
                aria-modal="true"
                className="info-modal"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
              >
                <div className="panel-head">
                  <h2>Все начисления</h2>
                  <button className="link-button" onClick={() => setGrantHistoryOverlayOpen(false)} type="button">
                    Закрыть
                  </button>
                </div>

                <div className="info-modal-body">
                  <GrantHistoryList entries={grantHistory} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {confirmDialog && typeof document !== "undefined"
        ? createPortal(
            <div className="info-modal-backdrop" onClick={() => setConfirmDialog(null)} role="presentation">
              <div
                aria-modal="true"
                className="info-modal confirm-modal"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
              >
                <div className="panel-head panel-head-stack">
                  <div>
                    <h2>{confirmDialog.title}</h2>
                    <p>{confirmDialog.detail}</p>
                  </div>
                </div>
                <div className="confirm-modal-actions">
                  <button className="action-button secondary" onClick={() => setConfirmDialog(null)} type="button">
                    {confirmDialog.cancelLabel ?? "Отмена"}
                  </button>
                  <button className="action-button" onClick={confirmDialog.onConfirm} type="button">
                    {confirmDialog.confirmLabel ?? "Подтвердить"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      <ProductEditorModal
        draft={catalogEditorDraft}
        existingCategories={existingCategories}
        isDirty={isCatalogEditorDirty}
        photoUploadState={photoUploadState}
        onEditorPreviewPointerDown={handleEditorPreviewPointerDown}
        onEditorPreviewPointerMove={handleEditorPreviewPointerMove}
        onEditorPreviewPointerUp={handleEditorPreviewPointerUp}
        onAddSize={addCatalogEditorSize}
        onChange={updateCatalogEditorDraft}
        onClose={closeCatalogEditor}
        onDuplicate={() => {
          if (catalogEditorDraft?.id) {
            duplicateCatalogItem(catalogEditorDraft.id);
          }
        }}
        onRemoveImage={() =>
          {
            setCatalogEditorDraft((current) =>
              current
                ? {
                    ...current,
                    imageUrl: undefined,
                    imageFit: "contain",
                    imagePositionX: 50,
                    imagePositionY: 50,
                  }
                : current,
            );
            closeCatalogImageDraft({ force: true });
            resetPhotoUploadState();
          }
        }
        onRecropImage={() => {
          if (!catalogEditorDraft?.imageUrl) {
            return;
          }
          createCatalogImageDraft("current-image", catalogEditorDraft.imageUrl)
            .then(({ draft }) => openCatalogImageDraft(draft, { preserveStatus: true }))
            .catch((error) => {
              const message = error instanceof Error ? error.message : "Не удалось открыть кадрирование.";
              setWarningStatus("Не удалось открыть кадрирование", message);
            });
        }}
        onReplaceImage={() => {
          if (catalogImageDraft) {
            triggerCatalogImagePickerAfterCropClose();
            return;
          }
          const input = document.getElementById("catalog-image-input") as HTMLInputElement | null;
          input?.click();
        }}
        onRemoveSize={removeCatalogEditorSize}
        onSave={saveCatalogEditorDraft}
        onSizeChange={updateCatalogEditorSize}
        onToggleVisibility={() =>
          setCatalogEditorDraft((current) => (current ? { ...current, isActive: !current.isActive } : current))
        }
        onUploadImage={handleCatalogImageUpload}
      />
      {catalogImageDraft && typeof document !== "undefined"
        ? createPortal(
            <div className="crop-modal-backdrop" role="presentation">
              <div className="crop-modal photo-crop-modal" role="dialog" aria-modal="true" aria-label="Кадрирование миниатюры">
                <div className="crop-modal-head">
                  <div>
                    <strong>Шаг 2. Подогнать кадр</strong>
                    <p>Итоговая карточка сохранит только область внутри рамки.</p>
                  </div>
                </div>
                <div className="crop-modal-body">
                  <div
                    className="crop-preview"
                    onWheel={handleCropWheel}
                    onPointerDown={handleCropPointerDown}
                    onPointerMove={handleCropPointerMove}
                    onPointerUp={handleCropPointerUp}
                    onPointerCancel={handleCropPointerUp}
                    role="presentation"
                  >
                    <div className="crop-preview-stage">
                      <img
                        alt="Предпросмотр миниатюры"
                        className="crop-preview-image"
                        src={catalogImageDraft.imageUrl}
                        style={{
                          width: `${catalogCropMetrics?.width ?? cropStageSize}px`,
                          height: `${catalogCropMetrics?.height ?? cropStageSize}px`,
                          left: `${catalogImageDraft.imageOffsetX}px`,
                          top: `${catalogImageDraft.imageOffsetY}px`,
                        }}
                      />
                      <div
                        className={
                          catalogImageDraft.frameSize >= cropStageSize
                            ? "crop-preview-frame full-stage-frame"
                            : "crop-preview-frame"
                        }
                        onPointerDown={
                          catalogImageDraft.frameSize >= cropStageSize ? undefined : handleCropFramePointerDown
                        }
                        onPointerMove={
                          catalogImageDraft.frameSize >= cropStageSize ? undefined : handleCropPointerMove
                        }
                        onPointerUp={
                          catalogImageDraft.frameSize >= cropStageSize ? undefined : handleCropPointerUp
                        }
                        onPointerCancel={
                          catalogImageDraft.frameSize >= cropStageSize ? undefined : handleCropPointerUp
                        }
                        role="presentation"
                        style={{
                          left: `${catalogImageDraft.frameX}px`,
                          top: `${catalogImageDraft.frameY}px`,
                          width: `${catalogImageDraft.frameSize}px`,
                          height: `${catalogImageDraft.frameSize}px`,
                        }}
                      />
                    </div>
                    <div className="crop-zoom-control">
                      <button className="action-button secondary compact" onClick={() => updateCatalogImageZoom((catalogImageDraft.zoom ?? 1) - 0.1)} type="button">
                        -
                      </button>
                      <label className="field compact crop-zoom-field">
                        <span>Масштаб</span>
                        <input
                          aria-label="Масштаб изображения"
                          max={2.5}
                          min={getMinimumCatalogZoom(catalogImageDraft.naturalWidth, catalogImageDraft.naturalHeight)}
                          onChange={(event) => updateCatalogImageZoom(Number(event.target.value))}
                          step={0.05}
                          type="range"
                          value={catalogImageDraft.zoom}
                        />
                      </label>
                      <button className="action-button secondary compact" onClick={() => updateCatalogImageZoom((catalogImageDraft.zoom ?? 1) + 0.1)} type="button">
                        +
                      </button>
                      <span className="crop-zoom-value">{Math.round(catalogImageDraft.zoom * 100)}%</span>
                    </div>
                  </div>
                  <div className="catalog-crop-grid crop-side-panel">
                    <div className="crop-result-panel">
                      <strong>Предпросмотр результата</strong>
                      <div className="crop-result-preview">
                        <img
                          alt="Итоговый кадр"
                          className="crop-preview-image"
                          src={catalogImageDraft.imageUrl}
                          style={{
                            width: `${(catalogCropMetrics?.width ?? cropStageSize) * cropPreviewScale}px`,
                            height: `${(catalogCropMetrics?.height ?? cropStageSize) * cropPreviewScale}px`,
                            left: `${(catalogImageDraft.imageOffsetX - catalogImageDraft.frameX) * cropPreviewScale}px`,
                            top: `${(catalogImageDraft.imageOffsetY - catalogImageDraft.frameY) * cropPreviewScale}px`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="crop-quick-actions">
                      <button className="action-button secondary compact" onClick={resetCatalogImagePosition} type="button">
                        По центру
                      </button>
                      <button
                        className="action-button secondary compact"
                        onClick={async () => {
                          try {
                            const { draft } = await createCatalogImageDraft(catalogImageDraft.fileName, catalogImageDraft.imageUrl);
                            openCatalogImageDraft(draft, { preserveStatus: true });
                          } catch (error) {
                            const message = error instanceof Error ? error.message : "Не удалось сбросить кадрирование.";
                            setWarningStatus("Не удалось сбросить кадрирование", message);
                          }
                        }}
                        type="button"
                      >
                        Сбросить всё
                      </button>
                      <button
                        className="action-button secondary compact"
                        onClick={triggerCatalogImagePickerAfterCropClose}
                        type="button"
                      >
                        Заменить фото
                      </button>
                    </div>
                    <div className="crop-modal-tips compact">
                      <strong>Как пользоваться</strong>
                      <ul className="crop-modal-tip-list">
                        <li>Тяните изображение мышью или пальцем.</li>
                        <li>Колёсиком мыши или ползунком меняйте масштаб.</li>
                        <li>Можно подвигать и саму рамку, если так удобнее.</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="crop-modal-actions">
                  <button className="action-button secondary" onClick={() => closeCatalogImageDraft()} type="button">
                    Отмена
                  </button>
                  <button className="action-button" onClick={applyCatalogImageCrop} type="button">
                    Сохранить
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </main>
  );
}

function existsInWishlist(wishlist: string[], itemId: string) {
  return wishlist.includes(itemId);
}
