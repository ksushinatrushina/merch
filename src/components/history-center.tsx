"use client";

import { useMemo, useState } from "react";

import type { CoinHistoryEntry, GratitudePost, ReactionKey } from "@/lib/app-types";
import type { User } from "@/lib/domain/types";

type HistoryPageProps = {
  coinTransactions: CoinHistoryEntry[];
  gratitudeFeed: GratitudePost[];
  currentUser: User;
  loading?: boolean;
  onReact: (postId: string, reaction: ReactionKey) => void;
};

type CoinHistoryFilter = "Все" | "Покупки" | "Начисления" | "Благодарности";
type CoinHistorySort = "Сначала новые" | "По сумме" | "По типу";
type GratitudeFilter = "Все" | "От меня" | "Мне" | "Публичные";
type TransactionKind = "purchase" | "grant" | "gratitude" | "adjustment";

type NormalizedTransaction = {
  id: string;
  amount: number;
  balanceAfter?: number;
  counterpart?: string;
  counterpartLabel?: string;
  dateLabel: string;
  kind: TransactionKind;
  title: string;
  typeLabel: string;
};

type ReactionSummaryItem = {
  count: number;
  emoji: string;
  key: ReactionKey;
};

const coinHistoryFilters: CoinHistoryFilter[] = ["Все", "Покупки", "Начисления", "Благодарности"];
const coinHistorySortModes: CoinHistorySort[] = ["Сначала новые", "По сумме", "По типу"];
const gratitudeFilters: GratitudeFilter[] = ["Все", "От меня", "Мне", "Публичные"];
const reactionEmojiMap: Record<ReactionKey, string> = {
  thanks: "❤️",
  celebrate: "👏",
  fire: "🔥",
  support: "🤝",
};
const reactionMenuOrder: ReactionKey[] = ["thanks", "celebrate", "fire", "support"];
const transactionTypeOrder: Record<TransactionKind, number> = {
  gratitude: 0,
  purchase: 1,
  grant: 2,
  adjustment: 3,
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function transactionTypeIcon(kind: TransactionKind) {
  if (kind === "purchase") {
    return "🛒";
  }
  if (kind === "grant") {
    return "🎁";
  }
  if (kind === "gratitude") {
    return "💬";
  }
  return "↩";
}

function normalizeCoinTransaction(entry: CoinHistoryEntry): NormalizedTransaction {
  const title = entry.title.trim();
  const lowerTitle = title.toLowerCase();
  const source = entry.source?.trim();
  const normalizedSource = source?.replace(/^От:\s*/i, "").trim();

  let kind: TransactionKind = "adjustment";
  let typeLabel = "Корректировка";
  let counterpartLabel: string | undefined;
  let counterpart = normalizedSource;

  if (lowerTitle.startsWith("покупка:")) {
    kind = "purchase";
    typeLabel = "Покупка";
    counterpart = undefined;
    counterpartLabel = undefined;
  } else if (lowerTitle.includes("подарок коллеге") || lowerTitle.includes("благодар")) {
    kind = "gratitude";
    typeLabel = "Благодарность";
    counterpartLabel = entry.amount < 0 ? "Кому" : normalizedSource ? "От" : undefined;
    counterpart = normalizedSource ?? source;
  } else if (
    lowerTitle.includes("награда") ||
    lowerTitle.includes("бонус") ||
    lowerTitle.includes("начисл") ||
    entry.amount > 0
  ) {
    kind = "grant";
    typeLabel = "Начисление";
    counterpartLabel = normalizedSource ? "От" : undefined;
  }

  if (kind === "adjustment" && source) {
    counterpartLabel = normalizedSource ? "От" : undefined;
  }

  return {
    id: entry.id,
    amount: entry.amount,
    balanceAfter: entry.balanceAfter,
    counterpart,
    counterpartLabel,
    dateLabel: entry.createdAt ?? entry.date,
    kind,
    title,
    typeLabel,
  };
}

function reactionsSummary(post: GratitudePost): ReactionSummaryItem[] {
  return (Object.entries(post.reactions) as Array<[ReactionKey, number]>)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([key, count]) => ({
      count,
      emoji: reactionEmojiMap[key],
      key,
    }));
}

function isCurrentUserSender(post: GratitudePost, currentUser: User) {
  return post.senderId ? post.senderId === currentUser.id : post.from === currentUser.name;
}

function isCurrentUserReceiver(post: GratitudePost, currentUser: User) {
  return post.receiverId ? post.receiverId === currentUser.id : post.to === currentUser.name;
}

function TransactionTypeBadge({ kind, label }: { kind: TransactionKind; label: string }) {
  return (
    <span className={`transaction-type-badge ${kind}`}>
      <span aria-hidden="true">{transactionTypeIcon(kind)}</span>
      {label}
    </span>
  );
}

function CoinHistoryFilters({
  filter,
  sortMode,
  onFilterChange,
  onSortChange,
}: {
  filter: CoinHistoryFilter;
  sortMode: CoinHistorySort;
  onFilterChange: (filter: CoinHistoryFilter) => void;
  onSortChange: (mode: CoinHistorySort) => void;
}) {
  return (
    <div className="coin-history-toolbar">
      <div className="segmented history-filters">
        {coinHistoryFilters.map((item) => (
          <button
            className={filter === item ? "mode-button active" : "mode-button"}
            key={item}
            onClick={() => onFilterChange(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      <label aria-label="Сортировка истории" className="field compact history-sort">
        <select value={sortMode} onChange={(event) => onSortChange(event.target.value as CoinHistorySort)}>
          {coinHistorySortModes.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function CoinTransactionRow({ transaction }: { transaction: NormalizedTransaction }) {
  const amountPrefix = transaction.amount > 0 ? "+" : "";

  return (
    <div className={`coin-transaction-row ${transaction.amount > 0 ? "incoming" : "outgoing"}`}>
      <div className="coin-transaction-amount">
        <strong>
          {amountPrefix}
          {transaction.amount}
        </strong>
      </div>

      <div className="coin-transaction-main">
        <div className="coin-transaction-topline">
          <TransactionTypeBadge kind={transaction.kind} label={transaction.typeLabel} />
          <span className="coin-transaction-date">{transaction.dateLabel}</span>
        </div>
        <strong className="coin-transaction-title">{transaction.title}</strong>
        <div className="coin-transaction-meta">
          {transaction.counterpart && transaction.counterpartLabel ? (
            <span>
              {transaction.counterpartLabel}: {transaction.counterpart}
            </span>
          ) : null}
          {typeof transaction.balanceAfter === "number" ? <span>Баланс: {transaction.balanceAfter}</span> : null}
        </div>
      </div>
    </div>
  );
}

function CoinHistoryPanel({
  transactions,
  loading = false,
}: {
  transactions: CoinHistoryEntry[];
  loading?: boolean;
}) {
  const [filter, setFilter] = useState<CoinHistoryFilter>("Все");
  const [sortMode, setSortMode] = useState<CoinHistorySort>("Сначала новые");
  const [visibleCount, setVisibleCount] = useState<number>(8);

  const filteredTransactions = useMemo(() => {
    const normalized = transactions.map(normalizeCoinTransaction);

    const nextItems = normalized
      .filter((transaction) => {
        if (filter === "Покупки") {
          return transaction.kind === "purchase";
        }
        if (filter === "Начисления") {
          return transaction.kind === "grant" || transaction.kind === "adjustment";
        }
        if (filter === "Благодарности") {
          return transaction.kind === "gratitude";
        }
        return true;
      })
      .sort((left, right) => {
        if (sortMode === "По сумме") {
          return Math.abs(right.amount) - Math.abs(left.amount);
        }
        if (sortMode === "По типу") {
          return transactionTypeOrder[left.kind] - transactionTypeOrder[right.kind];
        }
        return 0;
      });

    return nextItems;
  }, [filter, sortMode, transactions]);

  const visibleTransactions = filteredTransactions.slice(0, visibleCount);

  return (
    <article className="panel coin-history-panel">
      <div className="panel-head panel-head-stack history-panel-head">
        <div>
          <h2>История коинов</h2>
          <p>Покупки, начисления и все изменения баланса в одном списке</p>
        </div>
        <span className="badge">{filteredTransactions.length} операций</span>
      </div>

      <CoinHistoryFilters
        filter={filter}
        onFilterChange={(nextFilter) => {
          setFilter(nextFilter);
          setVisibleCount(8);
        }}
        onSortChange={setSortMode}
        sortMode={sortMode}
      />

      {loading ? (
        <div className="history-skeleton-list">
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="history-skeleton-row" key={`coin-skeleton-${index}`} />
          ))}
        </div>
      ) : visibleTransactions.length > 0 ? (
        <div className="coin-transaction-list">
          {visibleTransactions.map((transaction) => (
            <CoinTransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </div>
      ) : (
        <div className="history-empty-state">
          <strong>Пока нет операций</strong>
          <p>Здесь появятся покупки, начисления и изменения баланса</p>
        </div>
      )}

      {!loading && visibleCount < filteredTransactions.length ? (
        <button className="action-button secondary history-more-button" onClick={() => setVisibleCount((count) => count + 8)} type="button">
          Показать ещё
        </button>
      ) : null}
    </article>
  );
}

function GratitudeFeedFilters({
  filter,
  onChange,
}: {
  filter: GratitudeFilter;
  onChange: (filter: GratitudeFilter) => void;
}) {
  return (
    <div className="segmented history-filters gratitude-filters">
      {gratitudeFilters.map((item) => (
        <button
          className={filter === item ? "mode-button active" : "mode-button"}
          key={item}
          onClick={() => onChange(item)}
          type="button"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function ReactionSummary({
  onReact,
  postId,
  selectedReactions,
  reactions,
}: {
  onReact: (postId: string, reaction: ReactionKey) => void;
  postId: string;
  selectedReactions: ReactionKey[];
  reactions: ReactionSummaryItem[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const availableReactions = reactionMenuOrder.filter((reaction) => !selectedReactions.includes(reaction));

  return (
    <div className="reaction-summary">
      {reactions.map((reaction) => (
        <button
          aria-label={
            selectedReactions.includes(reaction.key)
              ? "Реакция уже добавлена"
              : `Добавить реакцию ${reaction.emoji}`
          }
          className={selectedReactions.includes(reaction.key) ? "reaction-summary-chip selected" : "reaction-summary-chip"}
          key={reaction.key}
          onClick={() => {
            if (selectedReactions.includes(reaction.key)) {
              return;
            }
            onReact(postId, reaction.key);
          }}
          type="button"
        >
          <span aria-hidden="true">{reaction.emoji}</span>
          {reaction.count}
        </button>
      ))}

      {availableReactions.length > 0 ? (
        <div className="reaction-menu-wrap">
          <button
            aria-expanded={menuOpen}
            aria-label="Добавить реакцию"
            className="reaction-add-button"
            onClick={() => setMenuOpen((current) => !current)}
            type="button"
          >
            +
          </button>
          {menuOpen ? (
            <div className="reaction-menu" role="menu">
              {availableReactions.map((reaction) => (
                <button
                  className="reaction-menu-item"
                  key={reaction}
                  onClick={() => {
                    onReact(postId, reaction);
                    setMenuOpen(false);
                  }}
                  type="button"
                >
                  <span aria-hidden="true">{reactionEmojiMap[reaction]}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function GratitudeCard({
  currentUser,
  onReact,
  post,
}: {
  currentUser: User;
  onReact: (postId: string, reaction: ReactionKey) => void;
  post: GratitudePost;
}) {
  const senderName = post.senderName ?? post.from;
  const receiverName = post.receiverName ?? post.to;

  return (
    <div className="gratitude-card">
      <div className="gratitude-card-head">
        <div className="gratitude-card-avatars" aria-hidden="true">
          <span className="mini-avatar">{post.senderAvatar ?? initials(senderName)}</span>
          <span className="mini-avatar alt">{post.receiverAvatar ?? initials(receiverName)}</span>
        </div>
        <div className="gratitude-card-copy">
          <strong>
            {isCurrentUserSender(post, currentUser) ? "Вы" : senderName} → {isCurrentUserReceiver(post, currentUser) ? "вам" : receiverName}
          </strong>
          <span>{post.createdAt ?? post.date}</span>
        </div>
        <div className="gratitude-card-amount">+{post.amount} коинов</div>
      </div>

      <p className="gratitude-card-message">{post.message || post.reason}</p>
      <ReactionSummary
        onReact={onReact}
        postId={post.id}
        reactions={reactionsSummary(post)}
        selectedReactions={post.myReactions ?? []}
      />
    </div>
  );
}

function GratitudeFeedPanel({
  currentUser,
  feed,
  loading = false,
  onReact,
}: {
  currentUser: User;
  feed: GratitudePost[];
  loading?: boolean;
  onReact: (postId: string, reaction: ReactionKey) => void;
}) {
  const [filter, setFilter] = useState<GratitudeFilter>("Все");
  const [visibleCount, setVisibleCount] = useState<number>(6);

  const filteredFeed = useMemo(() => {
    return feed.filter((post) => {
      if (filter === "От меня") {
        return isCurrentUserSender(post, currentUser);
      }
      if (filter === "Мне") {
        return isCurrentUserReceiver(post, currentUser);
      }
      if (filter === "Публичные") {
        return post.isPublic !== false;
      }
      return true;
    });
  }, [currentUser, feed, filter]);

  const visibleFeed = filteredFeed.slice(0, visibleCount);

  return (
    <article className="panel gratitude-feed-panel">
      <div className="panel-head panel-head-stack history-panel-head">
        <div>
          <h2>Лента благодарностей</h2>
          <p>Публичная социальная активность команды</p>
        </div>
        <span className="badge">{filteredFeed.length} записей</span>
      </div>

      <GratitudeFeedFilters
        filter={filter}
        onChange={(nextFilter) => {
          setFilter(nextFilter);
          setVisibleCount(6);
        }}
      />

      {loading ? (
        <div className="history-skeleton-list gratitude-skeleton-list">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="gratitude-skeleton-card" key={`gratitude-skeleton-${index}`} />
          ))}
        </div>
      ) : visibleFeed.length > 0 ? (
        <div className="gratitude-card-list">
          {visibleFeed.map((post) => (
            <GratitudeCard currentUser={currentUser} key={post.id} onReact={onReact} post={post} />
          ))}
        </div>
      ) : (
        <div className="history-empty-state social">
          <strong>Пока нет благодарностей</strong>
          <p>Когда сотрудники будут благодарить друг друга, записи появятся здесь</p>
        </div>
      )}

      {!loading && visibleCount < filteredFeed.length ? (
        <button className="action-button secondary history-more-button" onClick={() => setVisibleCount((count) => count + 6)} type="button">
          Показать ещё
        </button>
      ) : null}
    </article>
  );
}

export function HistoryPage({ coinTransactions, gratitudeFeed, currentUser, loading = false, onReact }: HistoryPageProps) {
  return (
    <section className="history-center section-gap">
      <CoinHistoryPanel loading={loading} transactions={coinTransactions} />
      <GratitudeFeedPanel currentUser={currentUser} feed={gratitudeFeed} loading={loading} onReact={onReact} />
    </section>
  );
}
