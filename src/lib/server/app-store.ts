import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createInitialPersistedState } from "@/lib/app-seed";
import type { AppSnapshot, PersistedAppState } from "@/lib/app-types";
import { MONTHLY_GIFT_LIMIT } from "@/lib/domain/coins";
import type { MerchItem } from "@/lib/domain/types";
import { currentUser } from "@/lib/mock-data";

const isVercelRuntime = process.env.VERCEL === "1";
const dataDir = process.env.APP_STATE_DIR
  ? path.resolve(process.env.APP_STATE_DIR)
  : isVercelRuntime
    ? path.join("/tmp", "corporate-merch-store")
    : path.join(process.cwd(), "data");
const statePath = path.join(dataDir, "app-state.json");
const APP_TIMEZONE = "Europe/Luxembourg";
const BIRTHDAY_BONUS = 150;
const WORK_ANNIVERSARY_BONUSES = [
  { months: 3, amount: 650, label: "3 месяца работы" },
  { months: 12, amount: 1000, label: "1 год работы" },
  { months: 24, amount: 1200, label: "2 года работы" },
  { months: 36, amount: 1500, label: "3 года работы" },
] as const;

let writeQueue: Promise<void> = Promise.resolve();

function getSystemNow() {
  return new Date();
}

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: APP_TIMEZONE,
  }).format(date);
}

function formatIsoTimestamp(date: Date) {
  return date.toISOString();
}

function formatMonthDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    day: "2-digit",
    timeZone: APP_TIMEZONE,
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${month}-${day}`;
}

function getYearMonth(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: APP_TIMEZONE,
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? date.getUTCFullYear());
  const month = Number(parts.find((part) => part.type === "month")?.value ?? date.getUTCMonth() + 1);
  return { year, month };
}

function addMonths(dateString: string, months: number) {
  const base = new Date(`${dateString}T00:00:00.000Z`);
  if (!Number.isFinite(base.getTime())) {
    return null;
  }

  const next = new Date(base);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function ensureUserQuota(state: PersistedAppState, userId: string, now: Date) {
  const { year, month } = getYearMonth(now);
  state.quotas ??= {};

  const existingQuota =
    state.quotas[userId] ??
    (state.quota?.userId === userId
      ? state.quota
      : {
          userId,
          year,
          month,
          sentCoins: 0,
        });

  if (existingQuota.year !== year || existingQuota.month !== month) {
    existingQuota.year = year;
    existingQuota.month = month;
    existingQuota.sentCoins = 0;
  }

  state.quotas[userId] = existingQuota;
  return existingQuota;
}

function syncMonthlyGiftQuotas(state: PersistedAppState, now: Date) {
  let changed = false;

  for (const user of state.users) {
    const existingQuota = state.quotas?.[user.id];
    const previous =
      existingQuota && {
        year: existingQuota.year,
        month: existingQuota.month,
        sentCoins: existingQuota.sentCoins,
      };
    const nextQuota = ensureUserQuota(state, user.id, now);
    if (
      !previous ||
      previous.year !== nextQuota.year ||
      previous.month !== nextQuota.month ||
      previous.sentCoins !== nextQuota.sentCoins
    ) {
      changed = true;
    }
  }

  if (state.quota?.userId) {
    state.quota = state.quotas?.[state.quota.userId] ?? state.quota;
  }

  return changed;
}

function mergeUsers(currentUsers: PersistedAppState["users"], initialUsers: PersistedAppState["users"]) {
  const currentById = new Map(currentUsers.map((user) => [user.id, user]));

  const merged = initialUsers.map((user) => {
    const existingUser = currentById.get(user.id);
    return existingUser ? { ...user, ...existingUser } : user;
  });

  for (const user of currentUsers) {
    if (!merged.some((entry) => entry.id === user.id)) {
      merged.push(user);
    }
  }

  return merged;
}

function mergeCatalog(currentCatalog: PersistedAppState["catalog"], initialCatalog: PersistedAppState["catalog"]) {
  const initialById = new Map(initialCatalog.map((item) => [item.id, item]));

  return currentCatalog.map((item) => {
    const initialItem = initialById.get(item.id);
    return initialItem ? { ...initialItem, ...item } : item;
  });
}

function normalizeCompareValue(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*г\.?$/g, "")
    .trim();
}

function extractSourceName(value?: string) {
  return (value ?? "").replace(/^От:\s*/i, "").trim();
}

function sameDateLabel(left?: string, right?: string) {
  return normalizeCompareValue(left) === normalizeCompareValue(right);
}

function findUserIdByName(users: PersistedAppState["users"], name?: string) {
  if (!name) {
    return undefined;
  }
  return users.find((user) => user.name === name)?.id;
}

function inferHistoryEntryUserId(
  entry: PersistedAppState["history"][number],
  state: PersistedAppState,
  initialState: PersistedAppState,
) {
  if (entry.userId) {
    return entry.userId;
  }

  const title = normalizeCompareValue(entry.title);
  const sourceName = extractSourceName(entry.source);
  const normalizedSource = normalizeCompareValue(sourceName);

  if (title.startsWith("покупка:") || title.startsWith("отмена заказа:")) {
    const matchingOrder = state.orders.find((order) => {
      const orderTitle = normalizeCompareValue(order.itemTitle.split(" · ")[0]);
      return title.includes(orderTitle) && sameDateLabel(entry.date, order.date);
    });

    if (matchingOrder) {
      return matchingOrder.customerId ?? findUserIdByName(state.users, matchingOrder.customerName);
    }
  }

  const matchingGrant = state.grantHistory.find(
    (grant) =>
      normalizeCompareValue(grant.reason) === title &&
      grant.amount === entry.amount &&
      sameDateLabel(grant.date, entry.date),
  );

  if (matchingGrant) {
    return findUserIdByName(state.users, matchingGrant.employeeName);
  }

  const matchingGratitude = state.gratitudeFeed.find(
    (post) =>
      normalizeCompareValue(post.reason) === title &&
      post.amount === Math.abs(entry.amount) &&
      sameDateLabel(post.date, entry.date) &&
      (!normalizedSource ||
        normalizeCompareValue(post.senderName ?? post.from) === normalizedSource ||
        normalizeCompareValue(post.receiverName ?? post.to) === normalizedSource),
  );

  if (matchingGratitude) {
    if (entry.amount < 0) {
      return matchingGratitude.senderId ?? findUserIdByName(state.users, matchingGratitude.senderName ?? matchingGratitude.from);
    }
    return matchingGratitude.receiverId ?? findUserIdByName(state.users, matchingGratitude.receiverName ?? matchingGratitude.to);
  }

  if (initialState.history.some((initialEntry) => initialEntry.id === entry.id)) {
    return currentUser.id;
  }

  return undefined;
}

function normalizeState(state: PersistedAppState): PersistedAppState {
  const initialState = createInitialPersistedState();
  const currentUsers = state.users ?? [];
  const users = currentUsers.length > 0 ? mergeUsers(currentUsers, initialState.users) : initialState.users;
  const currentCatalog = state.catalog ?? [];
  const catalog = currentCatalog.length > 0 ? mergeCatalog(currentCatalog, initialState.catalog) : initialState.catalog;
  const history = (state.history ?? initialState.history).map((entry) => ({
    ...entry,
    userId: inferHistoryEntryUserId(entry, { ...initialState, ...state, users, catalog }, initialState),
  }));

  return {
    ...initialState,
    ...state,
    automationStartedAt: state.automationStartedAt,
    quotas: state.quotas ?? (state.quota ? { [state.quota.userId]: state.quota } : initialState.quotas),
    quota: state.quota ?? initialState.quota,
    users,
    catalog,
    history,
    grantHistory: state.grantHistory ?? initialState.grantHistory,
    birthdayGrants: state.birthdayGrants ?? initialState.birthdayGrants,
    automatedGrantKeys: state.automatedGrantKeys ?? initialState.automatedGrantKeys ?? [],
    notifications: state.notifications ?? initialState.notifications,
    orders: state.orders ?? initialState.orders,
    gratitudeFeed: state.gratitudeFeed ?? initialState.gratitudeFeed,
    activity: state.activity ?? initialState.activity,
    wishlists: state.wishlists ?? initialState.wishlists,
  };
}

function ensureAutomationStartedAt(state: PersistedAppState, now: Date) {
  if (state.automationStartedAt) {
    const startedAt = new Date(state.automationStartedAt);
    if (Number.isFinite(startedAt.getTime())) {
      return { startedAt, changed: false };
    }
  }

  state.automationStartedAt = now.toISOString();
  return { startedAt: now, changed: true };
}

function formatBirthdayKey(userId: string, year: number) {
  return `${userId}:${year}`;
}

function formatWorkMilestoneKey(userId: string, months: number) {
  return `work:${userId}:${months}`;
}

function hasGrantedWorkMilestone(grantedKeys: Set<string>, userId: string, months: number) {
  const stableKey = formatWorkMilestoneKey(userId, months);
  if (grantedKeys.has(stableKey)) {
    return true;
  }

  const legacyPrefix = `${stableKey}:`;
  for (const key of grantedKeys) {
    if (key.startsWith(legacyPrefix)) {
      return true;
    }
  }

  return false;
}

function applyAutomatedGrants(state: PersistedAppState, now: Date) {
  const dateLabel = formatDateLabel(now);
  const createdAt = formatIsoTimestamp(now);
  const year = getYearMonth(now).year;
  const grantedKeys = new Set([...(state.birthdayGrants ?? []), ...(state.automatedGrantKeys ?? [])]);
  const automationStartedAt = state.automationStartedAt ? new Date(state.automationStartedAt) : now;
  let changed = false;

  for (const user of state.users) {
    if (user.birthday) {
      const birthdayThisYear = new Date(`${year}-${user.birthday}T00:00:00.000Z`);
      const birthdayGrantKey = formatBirthdayKey(user.id, year);

      if (
        Number.isFinite(birthdayThisYear.getTime()) &&
        birthdayThisYear.getTime() >= automationStartedAt.getTime() &&
        now.getTime() >= birthdayThisYear.getTime() &&
        !grantedKeys.has(birthdayGrantKey)
      ) {
        user.coinBalance += BIRTHDAY_BONUS;
        state.birthdayGrants.push(birthdayGrantKey);
        state.automatedGrantKeys?.push(birthdayGrantKey);
        grantedKeys.add(birthdayGrantKey);

        state.history.unshift({
          id: `birthday-history-${year}-${user.id}`,
          amount: BIRTHDAY_BONUS,
          title: "День рождения",
          source: "Автоматическое начисление",
          counterpartName: "Система",
          date: dateLabel,
          createdAt,
          balanceAfter: user.coinBalance,
          type: "grant",
        });

        state.grantHistory.unshift({
          id: `birthday-grant-${year}-${user.id}`,
          adminName: "Система",
          employeeName: user.name,
          amount: BIRTHDAY_BONUS,
          reason: "Автоматическое начисление ко дню рождения",
          date: dateLabel,
        });

        state.notifications.unshift({
          id: `birthday-notification-${year}-${user.id}`,
          text: `Вам начислено ${BIRTHDAY_BONUS} мерчиков ко дню рождения`,
          unread: true,
        });

        state.activity.unshift(`Система начислила ${BIRTHDAY_BONUS} мерчиков ${user.name} ко дню рождения.`);
        changed = true;
      }
    }

    if (!user.employmentStartDate) {
      continue;
    }

    for (const milestone of WORK_ANNIVERSARY_BONUSES) {
      const milestoneDate = addMonths(user.employmentStartDate, milestone.months);
      if (
        !milestoneDate ||
        milestoneDate.getTime() < automationStartedAt.getTime() ||
        now.getTime() < milestoneDate.getTime()
      ) {
        continue;
      }

      const milestoneKey = formatWorkMilestoneKey(user.id, milestone.months);
      if (hasGrantedWorkMilestone(grantedKeys, user.id, milestone.months)) {
        continue;
      }

      user.coinBalance += milestone.amount;
      state.automatedGrantKeys?.push(milestoneKey);
      grantedKeys.add(milestoneKey);

      state.history.unshift({
        id: `work-history-${milestone.months}-${user.id}`,
        amount: milestone.amount,
        title: milestone.label,
        source: "Автоматическое начисление",
        counterpartName: "Система",
        date: dateLabel,
        createdAt,
        balanceAfter: user.coinBalance,
        type: "grant",
      });

      state.grantHistory.unshift({
        id: `work-grant-${milestone.months}-${user.id}`,
        adminName: "Система",
        employeeName: user.name,
        amount: milestone.amount,
        reason: `Автоматическое начисление за ${milestone.label.toLowerCase()}`,
        date: dateLabel,
      });

      state.notifications.unshift({
        id: `work-notification-${milestone.months}-${user.id}`,
        text: `Вам начислено ${milestone.amount} мерчиков за ${milestone.label.toLowerCase()}`,
        unread: true,
      });

      state.activity.unshift(`Система начислила ${milestone.amount} мерчиков ${user.name} за ${milestone.label.toLowerCase()}.`);
      changed = true;
    }
  }

  return changed;
}

async function ensureStateFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(statePath, "utf8");
  } catch {
    await writeFile(statePath, JSON.stringify(createInitialPersistedState(), null, 2), "utf8");
  }
}

export async function readAppState(): Promise<PersistedAppState> {
  await ensureStateFile();
  const raw = await readFile(statePath, "utf8");
  const state = normalizeState(JSON.parse(raw) as PersistedAppState);
  const now = getSystemNow();
  const { changed: automationChanged } = ensureAutomationStartedAt(state, now);
  const quotaChanged = syncMonthlyGiftQuotas(state, now);

  if (applyAutomatedGrants(state, now) || quotaChanged || automationChanged) {
    await writeAppState(state);
  }

  return state;
}

export async function writeAppState(state: PersistedAppState) {
  await ensureStateFile();
  writeQueue = writeQueue.then(() =>
    writeFile(statePath, JSON.stringify(state, null, 2), "utf8"),
  );
  await writeQueue;
}

export async function updateAppState<T>(
  updater: (state: PersistedAppState) => Promise<T> | T,
): Promise<T> {
  const state = await readAppState();
  const result = await updater(state);
  await writeAppState(state);
  return result;
}

export function buildSnapshot(state: PersistedAppState, userId: string): AppSnapshot {
  const popularityMap = new Map(
    state.catalog.map((item) => {
      const fireCount = Object.values(state.wishlists).reduce((sum, entries) => {
        return sum + (entries.includes(item.id) ? 1 : 0);
      }, 0);

      return [item.id, fireCount];
    }),
  );
  const topPopularity = Math.max(...popularityMap.values(), 0);
  const now = getSystemNow();
  const catalog: MerchItem[] = state.catalog.map((item) => {
    const fireCount = popularityMap.get(item.id) ?? 0;
    const totalStock = item.sizes?.reduce((sum, entry) => sum + entry.stock, 0) ?? item.stock;
    const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;
    const isNew =
      publishedAt !== null &&
      Number.isFinite(publishedAt.getTime()) &&
      now.getTime() - publishedAt.getTime() <= 30 * 24 * 60 * 60 * 1000;

    let badge: MerchItem["badge"];
    if (totalStock <= 0) {
      badge = undefined;
    } else if (item.manualLimited) {
      badge = "Лимитировано";
    } else if (topPopularity >= 10 && fireCount === topPopularity) {
      badge = "Популярно";
    } else if (totalStock < 10) {
      badge = "Лимитировано";
    } else if (isNew) {
      badge = "Новинка";
    } else {
      badge = undefined;
    }

    return {
      ...item,
      stock: totalStock,
      popularity: fireCount,
      badge,
      isNew,
    };
  });

  return {
    users: state.users,
    quota: ensureUserQuota(state, userId, now),
    catalog,
    history: state.history.filter((entry) => entry.userId === userId),
    grantHistory: state.grantHistory,
    notifications: state.notifications,
    orders: state.orders,
    gratitudeFeed: state.gratitudeFeed.map((post) => ({
      ...post,
      myReactions: (Object.entries(post.reactionUsers ?? {}) as Array<[string, string[]]>)
        .filter(([, userIds]) => userIds.includes(userId))
        .map(([reaction]) => reaction) as Array<"thanks" | "celebrate" | "support" | "fire" | "sparkle">,
    })),
    activity: state.activity,
    wishlist: state.wishlists[userId] ?? [],
  };
}

export async function resetAppState() {
  const nextState = createInitialPersistedState();
  await writeAppState(nextState);
  return nextState;
}
