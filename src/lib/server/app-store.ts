import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createInitialPersistedState } from "@/lib/app-seed";
import type { AppSnapshot, PersistedAppState } from "@/lib/app-types";
import type { MerchItem } from "@/lib/domain/types";

const isVercelRuntime = process.env.VERCEL === "1";
const dataDir = process.env.APP_STATE_DIR
  ? path.resolve(process.env.APP_STATE_DIR)
  : isVercelRuntime
    ? path.join("/tmp", "corporate-merch-store")
    : path.join(process.cwd(), "data");
const statePath = path.join(dataDir, "app-state.json");
const SYSTEM_NOW = new Date("2026-03-12T00:00:00.000Z");
const SYSTEM_DATE_LABEL = "12 марта 2026";
const SYSTEM_CREATED_AT = "2026-03-12T09:00:00.000Z";
const BIRTHDAY_BONUS = 50;

let writeQueue: Promise<void> = Promise.resolve();

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

function normalizeState(state: PersistedAppState): PersistedAppState {
  const initialState = createInitialPersistedState();
  const currentUsers = state.users ?? [];
  const users = currentUsers.length > 0 ? mergeUsers(currentUsers, initialState.users) : initialState.users;
  const currentCatalog = state.catalog ?? [];
  const catalog = currentCatalog.length > 0 ? mergeCatalog(currentCatalog, initialState.catalog) : initialState.catalog;

  return {
    ...initialState,
    ...state,
    quota: state.quota ?? initialState.quota,
    users,
    catalog,
    history: state.history ?? initialState.history,
    grantHistory: state.grantHistory ?? initialState.grantHistory,
    birthdayGrants: state.birthdayGrants ?? initialState.birthdayGrants,
    notifications: state.notifications ?? initialState.notifications,
    orders: state.orders ?? initialState.orders,
    gratitudeFeed: state.gratitudeFeed ?? initialState.gratitudeFeed,
    activity: state.activity ?? initialState.activity,
    wishlists: state.wishlists ?? initialState.wishlists,
  };
}

function formatBirthdayKey(userId: string, year: number) {
  return `${userId}:${year}`;
}

function applyBirthdayBonuses(state: PersistedAppState) {
  const year = SYSTEM_NOW.getUTCFullYear();
  const monthDay = `${String(SYSTEM_NOW.getUTCMonth() + 1).padStart(2, "0")}-${String(SYSTEM_NOW.getUTCDate()).padStart(2, "0")}`;
  const grantedKeys = new Set(state.birthdayGrants);
  let changed = false;

  for (const user of state.users) {
    if (user.role !== "EMPLOYEE" || user.birthday !== monthDay) {
      continue;
    }

    const grantKey = formatBirthdayKey(user.id, year);
    if (grantedKeys.has(grantKey)) {
      continue;
    }

    user.coinBalance += BIRTHDAY_BONUS;
    state.birthdayGrants.push(grantKey);
    grantedKeys.add(grantKey);

    state.history.unshift({
      id: `birthday-history-${year}-${user.id}`,
      amount: BIRTHDAY_BONUS,
      title: "День рождения",
      source: "Автоматическое начисление",
      counterpartName: "Система",
      date: SYSTEM_DATE_LABEL,
      createdAt: SYSTEM_CREATED_AT,
      balanceAfter: user.coinBalance,
      type: "grant",
    });

    state.grantHistory.unshift({
      id: `birthday-grant-${year}-${user.id}`,
      adminName: "Система",
      employeeName: user.name,
      amount: BIRTHDAY_BONUS,
      reason: "Автоматическое начисление ко дню рождения",
      date: SYSTEM_DATE_LABEL,
    });

    state.notifications.unshift({
      id: `birthday-notification-${year}-${user.id}`,
      text: `Вам начислено ${BIRTHDAY_BONUS} коинов ко дню рождения`,
      unread: true,
    });

    state.activity.unshift(`Система начислила ${BIRTHDAY_BONUS} коинов ${user.name} ко дню рождения.`);
    changed = true;
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

  if (applyBirthdayBonuses(state)) {
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
  const now = SYSTEM_NOW;
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
    quota: state.quota.userId === userId ? state.quota : { ...state.quota, userId },
    catalog,
    history: state.history,
    grantHistory: state.grantHistory,
    notifications: state.notifications,
    orders: state.orders,
    gratitudeFeed: state.gratitudeFeed.map((post) => ({
      ...post,
      myReactions: (Object.entries(post.reactionUsers ?? {}) as Array<[string, string[]]>)
        .filter(([, userIds]) => userIds.includes(userId))
        .map(([reaction]) => reaction) as Array<"thanks" | "celebrate" | "support" | "fire">,
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
