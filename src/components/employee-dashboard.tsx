"use client";

import { useEffect, useMemo, useState } from "react";

import type { GratitudePost, OrderCard } from "@/lib/app-types";
import type { Role, User } from "@/lib/domain/types";

type EmployeeTab = "PROFILE" | "STORE" | "HISTORY";

type HeaderProps = {
  activeTab: EmployeeTab;
  adminHref?: string;
  adminLabel?: string;
  availableCoins: number;
  cartCount?: number;
  gratitudeHref?: string;
  notificationCount: number;
  onAccountClick: () => void;
  onCartClick?: () => void;
  onNotificationsClick: () => void;
  user: User;
};

type ProfileCardProps = {
  user: User;
};

type StatsPanelProps = {
  availableCoins: number;
};

type SendGratitudePanelProps = {
  colleagues: User[];
  selectedRecipientId: string;
  amount: string;
  message: string;
  onRecipientChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  remainingLimit: number;
  gratitudeLimitTotal: number;
};

type GratitudeFeedProps = {
  events: GratitudePost[];
  currentUserId: string;
  users: User[];
  onShowAll: () => void;
};

type RecentPurchasesProps = {
  orders: OrderCard[];
  onCancelOrder?: (orderId: string) => void;
  onShowAll: () => void;
};

function roleLabel(role: Role) {
  if (role === "ADMIN") {
    return "Администратор";
  }
  if (role === "ORDER_MANAGER") {
    return "Менеджер доставки заказов";
  }
  return "Сотрудник";
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function coinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <ellipse cx="12" cy="6" rx="7" ry="3.2" />
      <path d="M5 6v7c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2V6" />
      <path d="M5 10c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2" />
    </svg>
  );
}

function giftIcon() {
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

function bagIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 9V7a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function bellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M6 17h12" />
      <path d="M8 17V11a4 4 0 1 1 8 0v6" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

function mailIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 7h16v10H4z" />
      <path d="M4 8l8 6 8-6" />
    </svg>
  );
}

function clockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function teamIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M16.5 18a4.5 4.5 0 0 0-9 0" />
      <circle cx="12" cy="8" r="3" />
      <path d="M20 18a3.5 3.5 0 0 0-3-3.45" />
      <path d="M7 14.55A3.5 3.5 0 0 0 4 18" />
    </svg>
  );
}

export function Header({
  activeTab,
  adminHref,
  adminLabel = "Админ",
  availableCoins,
  cartCount = 0,
  gratitudeHref,
  notificationCount,
  onAccountClick,
  onCartClick,
  onNotificationsClick,
  user,
}: HeaderProps) {
  return (
    <header className="employee-header">
      <div className="employee-header-main">
        <div className="employee-header-title">
          <h1>Корпоративный магазин мерча</h1>
        </div>
        <nav className="employee-header-tabs" aria-label="Навигация сотрудника">
          {[
            { id: "STORE" as const, href: "/?mode=employee&tab=store", label: "Магазин" },
            { id: "PROFILE" as const, href: "/?mode=employee&tab=profile", label: "Профиль" },
            { id: "HISTORY" as const, href: "/?mode=employee&tab=history", label: "История" },
          ].map((tab) => (
            <a
              key={tab.id}
              href={tab.href}
              className={activeTab === tab.id ? "employee-tab active" : "employee-tab"}
            >
              {tab.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="employee-header-side">
        {adminHref ? (
          <a className="header-mode-toggle" href={adminHref}>
            {adminLabel}
          </a>
        ) : null}

        {activeTab === "STORE" ? (
          <div className="header-badge coins compact">
            <span className="header-badge-icon">{coinIcon()}</span>
            <div className="header-badge-copy">
              <strong>{availableCoins}</strong>
              <span>Баланс</span>
            </div>
          </div>
        ) : null}

        {gratitudeHref ? (
          <a
            className="header-notifications gratitude-shortcut"
            href={gratitudeHref}
            aria-label="Открыть благодарности"
            title="Быстрый переход к благодарностям"
          >
            <span className="header-notifications-icon">{giftIcon()}</span>
          </a>
        ) : null}

        {activeTab === "STORE" ? (
          <>
            <button
              aria-label="Открыть корзину"
              className="header-cart"
              onClick={onCartClick}
              title="Корзина"
              type="button"
            >
              <span className="header-cart-icon">{bagIcon()}</span>
              <span className="header-cart-count">{cartCount}</span>
            </button>
          </>
        ) : null}

        <button
          aria-label="Открыть профиль"
          className="header-account"
          onClick={onAccountClick}
          title="Профиль"
          type="button"
        >
          <span className="header-account-avatar">{initials(user.name)}</span>
          <div className="header-account-copy">
            <strong>{user.name}</strong>
            <span>{user.jobTitle ?? roleLabel(user.role)}</span>
          </div>
        </button>

        <button
          aria-label="Открыть уведомления"
          className="header-notifications"
          onClick={onNotificationsClick}
          title="Уведомления"
          type="button"
        >
          <span className="header-notifications-icon">{bellIcon()}</span>
          <span>{notificationCount}</span>
        </button>
      </div>
    </header>
  );
}

export function ProfileCard({ user }: ProfileCardProps) {
  return (
    <article className="dashboard-card profile-card-v2">
      <div className="profile-card-v2-head">
        <span className="profile-card-v2-avatar">{initials(user.name)}</span>
        <div>
          <strong>{user.name}</strong>
          <p>{user.jobTitle ?? roleLabel(user.role)}</p>
        </div>
      </div>

      <div className="profile-card-v2-meta">
        <div>
          <span className="profile-meta-inline">
            <i>{teamIcon()}</i>
            Команда
          </span>
          <strong>{user.team ?? "Не указана"}</strong>
        </div>
        <div>
          <span className="profile-meta-inline">
            <i>{mailIcon()}</i>
            Email
          </span>
          <strong>{user.email}</strong>
        </div>
        <div>
          <span className="profile-meta-inline">
            <i>{clockIcon()}</i>
            Стаж
          </span>
          <strong>{user.tenure ?? "Не указан"}</strong>
        </div>
      </div>
    </article>
  );
}

export function StatsPanel({
  availableCoins,
}: StatsPanelProps) {
  return (
    <article className="dashboard-card stats-panel-v2">
      <div className="stats-panel-v2-grid">
        <div className="stats-panel-v2-item primary">
          <div className="stats-panel-v2-value">
            <i>{coinIcon()}</i>
            <strong>{availableCoins}</strong>
          </div>
          <span>Мой баланс мерчиков</span>
          <small>Можно потратить на товары в Магазине</small>
        </div>
      </div>
    </article>
  );
}

export function SendGratitudePanel({
  colleagues,
  selectedRecipientId,
  amount,
  message,
  onRecipientChange,
  onAmountChange,
  onMessageChange,
  onSubmit,
  remainingLimit,
  gratitudeLimitTotal,
}: SendGratitudePanelProps) {
  const selectedColleague = colleagues.find((colleague) => colleague.id === selectedRecipientId) ?? null;
  const [searchValue, setSearchValue] = useState(selectedColleague?.name ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  const filteredColleagues = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) {
      return colleagues;
    }

    const terms = query.split(/\s+/).filter(Boolean);

    return colleagues.filter((colleague) => {
      const haystack = colleague.name.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [colleagues, searchValue]);

  useEffect(() => {
    if (!isSearching) {
      setSearchValue(selectedColleague?.name ?? "");
    }
  }, [isSearching, selectedColleague?.id, selectedColleague?.name]);

  useEffect(() => {
    setActiveIndex(0);
  }, [searchValue]);

  function selectColleague(colleagueId: string) {
    onRecipientChange(colleagueId);
    setIsSearching(false);
    setIsOpen(false);
  }

  return (
    <article className="dashboard-card gratitude-panel-v2">
      <div className="dashboard-card-head">
        <div>
          <h2>Отправить благодарность</h2>
        </div>
      </div>

      <div className="gratitude-budget-badge">
        <strong>
          {remainingLimit} из {gratitudeLimitTotal}
        </strong>
        <span>Не влияет на Мой баланс мерчиков</span>
      </div>

      <div className="gratitude-panel-v2-controls">
        <label className="compact-field">
          <span>Коллега</span>
          <div className="compact-search-field">
            <input
              autoComplete="off"
              onBlur={() => {
                window.setTimeout(() => {
                  setIsOpen(false);
                  setIsSearching(false);
                  setSearchValue(selectedColleague?.name ?? "");
                }, 120);
              }}
              onChange={(event) => {
                setSearchValue(event.target.value);
                setIsOpen(true);
                setIsSearching(true);
              }}
              onFocus={() => {
                setIsSearching(true);
                setSearchValue("");
              }}
              onKeyDown={(event) => {
                if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                  setIsOpen(true);
                  return;
                }

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((current) => (current + 1) % Math.max(filteredColleagues.length, 1));
                  return;
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex(
                    (current) => (current - 1 + Math.max(filteredColleagues.length, 1)) % Math.max(filteredColleagues.length, 1),
                  );
                  return;
                }

                if (event.key === "Enter" && filteredColleagues[activeIndex]) {
                  event.preventDefault();
                  selectColleague(filteredColleagues[activeIndex].id);
                }

                if (event.key === "Escape") {
                  setIsOpen(false);
                  setIsSearching(false);
                  setSearchValue(selectedColleague?.name ?? "");
                }
              }}
              placeholder="Начните вводить имя коллеги"
              type="text"
              value={searchValue}
            />

            {isOpen && isSearching ? (
              <div className="compact-search-dropdown">
                {filteredColleagues.length > 0 ? (
                  filteredColleagues.map((colleague, index) => (
                    <button
                      className={index === activeIndex ? "compact-search-option active" : "compact-search-option"}
                      key={colleague.id}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectColleague(colleague.id);
                      }}
                      type="button"
                    >
                      {colleague.name}
                    </button>
                  ))
                ) : (
                  <div className="compact-search-empty">Совпадений не найдено</div>
                )}
              </div>
            ) : null}
          </div>
        </label>

        <label className="compact-field">
          <span>Сколько отправить</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Например: 5"
            type="text"
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
          />
        </label>
      </div>

      <label className="compact-field">
        <span>Причина благодарности</span>
        <input
          placeholder="Например: За помощь с релизом"
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
        />
      </label>

      <button className="action-button compact-submit" onClick={onSubmit} type="button">
        Отправить благодарность
      </button>
    </article>
  );
}

export function GratitudeFeed({
  events,
  currentUserId,
  users,
  onShowAll,
}: GratitudeFeedProps) {
  const currentUser = users.find((user) => user.id === currentUserId);
  const currentUserName = currentUser?.name ?? "";
  const latestEvents = events.slice(0, 3);

  return (
    <article className="dashboard-card gratitude-feed-v2">
      <div className="dashboard-card-head">
        <h2>Последние благодарности</h2>
        <button className="link-button muted-link" onClick={onShowAll} type="button">
          Показать все
        </button>
      </div>

      <div className="feed-v2-list">
        {latestEvents.map((event) => {
          const receiver = users.find((user) => user.name === event.to);
          const sender = users.find((user) => user.name === event.from);
          const title =
            receiver?.name === currentUserName
              ? `${event.from} → вам`
              : sender?.name === currentUserName
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
              <div className="feed-v2-coins">+{event.amount} мерчиков</div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export function RecentPurchases({ orders, onCancelOrder, onShowAll }: RecentPurchasesProps) {
  const recentOrders = orders.slice(0, 3);

  return (
    <article className="dashboard-card purchases-v2">
      <div className="dashboard-card-head">
        <h2>Последние покупки</h2>
        <button className="link-button muted-link" onClick={onShowAll} type="button">
          Показать все
        </button>
      </div>

      <div className="purchases-v2-list">
        {recentOrders.map((order) => (
          <div className="purchases-v2-row" key={order.id}>
            <div className="purchases-v2-icon">{bagIcon()}</div>
            <div className="purchases-v2-copy">
              <strong>{order.itemTitle}</strong>
              <span>
                {order.date} • {order.status.toLowerCase()}
              </span>
            </div>
            {order.status === "Создан" && onCancelOrder ? (
              <button className="link-button muted-link" onClick={() => onCancelOrder(order.id)} type="button">
                Отменить
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </article>
  );
}
