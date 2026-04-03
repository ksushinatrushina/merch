"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { GrantHistoryEntry, OrderCard, OrderStatus } from "@/lib/app-types";
import type { MerchItem, User } from "@/lib/domain/types";
import { EmployeePicker } from "@/components/employee-picker";
import { formatEmployees, formatMerchiki, formatOrders, pluralizeRu } from "@/lib/russian";

type CatalogEditorDraft = MerchItem;

type GrantCoinsPanelProps = {
  operation: "grant" | "deduct";
  employees: User[];
  selectedEmployeeIds: string[];
  coins: number;
  reason: string;
  importPreview: {
    fileName: string;
    rows: Array<{ amount: number; reason: string; recipient: string }>;
    sample: Array<{ amount: number; reason: string; recipient: string }>;
  } | null;
  importState: {
    detail: string;
    error?: string;
    fileName?: string;
    importedCount?: number;
    phase: "idle" | "processing" | "done" | "error";
    processed?: number;
    total?: number;
  };
  onClearSelection: () => void;
  onOperationChange: (value: "grant" | "deduct") => void;
  onSelectMany: (employeeIds: string[]) => void;
  onToggleEmployee: (employeeId: string) => void;
  onCoinsChange: (value: number) => void;
  onImportTable: (file: File | null) => void;
  onClearImportPreview: () => void;
  onConfirmImport: () => void;
  onDownloadTemplate: () => void;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
};

type GrantHistoryListProps = {
  entries: GrantHistoryEntry[];
  limit?: number;
  onShowAll?: () => void;
};

type GrantHistoryFilter = "Все" | "Ручные" | "Автоматические" | "Сегодня" | "7 дней" | "30 дней";
type GroupedGrantHistoryEntry = {
  amount: number;
  date: string;
  employeeNames: string[];
  ids: string[];
  isAutomatic: boolean;
  reason: string;
  sourceName: string;
};

type CatalogTableProps = {
  items: MerchItem[];
  editingItemId?: string | null;
  bulkState?: {
    detail: string;
    phase: "idle" | "processing" | "done" | "error";
    processed?: number;
    title: string;
    total?: number;
  } | null;
  search: string;
  onSearchChange: (value: string) => void;
  onAdd: () => void;
  onBulkDelete: (itemIds: string[]) => void;
  onBulkVisibilityChange: (itemIds: string[], isActive: boolean) => void;
  onEdit: (item: MerchItem) => void;
  onDuplicate: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onVisibilityChange: (itemId: string, isActive: boolean) => void;
};

type AdminOrdersPanelProps = {
  bulkState?: {
    detail: string;
    phase: "idle" | "processing" | "done" | "error";
    processed?: number;
    title: string;
    total?: number;
  } | null;
  orders: OrderCard[];
  onCancelOrder: (orderId: string) => void;
  onUpdateStatus: (orderIds: string[], status: OrderStatus) => void;
};

type ProductEditorModalProps = {
  draft: CatalogEditorDraft | null;
  existingCategories: string[];
  isDirty: boolean;
  photoUploadState: {
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
  onEditorPreviewPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onEditorPreviewPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onEditorPreviewPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onClose: () => void;
  onDuplicate: () => void;
  onRemoveImage: () => void;
  onRecropImage: () => void;
  onReplaceImage: () => void;
  onSave: () => void;
  onToggleVisibility: () => void;
  onChange: (patch: Partial<CatalogEditorDraft>) => void;
  onSizeChange: (index: number, field: "size" | "stock", value: string) => void;
  onAddSize: () => void;
  onRemoveSize: (index: number) => void;
  onUploadImage: (file: File | null) => void;
};

type CatalogFilter = "Все" | "Активные" | "Скрытые" | "Нет в наличии" | "Заканчивается";
type CatalogSortKey = "title" | "priceCoins" | "popularity" | "status";

const catalogFilters: CatalogFilter[] = ["Все", "Активные", "Скрытые", "Нет в наличии", "Заканчивается"];
const lowStockThreshold = 5;
const baseCatalogCategories = ["Одежда", "Посуда", "Канцелярия"];
const adminOrderStatusFilters: Array<"Все" | OrderStatus> = ["Все", "Создан", "Подтверждён", "Отправлен", "Доставлен", "Отменён"];
const adminOrderDeliveryFilters = ["Все способы", "Самовывоз", "Доставка"] as const;
const adminOrderSortModes = [
  { value: "date-desc", label: "Сначала новые" },
  { value: "date-asc", label: "Сначала старые" },
  { value: "status", label: "По статусу" },
  { value: "customer", label: "По сотруднику" },
  { value: "delivery", label: "По получению" },
] as const;
type AdminOrderSortMode = (typeof adminOrderSortModes)[number]["value"];
const APP_TIMEZONE = "Europe/Luxembourg";

function getNextOrderStatus(status: OrderStatus): OrderStatus | null {
  if (status === "Создан") {
    return "Подтверждён";
  }
  if (status === "Подтверждён") {
    return "Отправлен";
  }
  if (status === "Отправлен") {
    return "Доставлен";
  }
  return null;
}

function getNextOrderStatusLabel(status: OrderStatus) {
  if (status === "Создан") {
    return "Подтвердить";
  }
  if (status === "Подтверждён") {
    return "Отправить";
  }
  if (status === "Отправлен") {
    return "Отметить доставленным";
  }
  return null;
}

function getOrderActionHint(status: OrderStatus) {
  if (status === "Создан") {
    return "Нужно подтвердить";
  }
  if (status === "Подтверждён") {
    return "Нужно отправить";
  }
  if (status === "Отправлен") {
    return "Нужно завершить";
  }
  if (status === "Отменён") {
    return "Заказ отменён";
  }
  return "Готово";
}

function previousOrderStatus(status: OrderStatus): OrderStatus | null {
  if (status === "Подтверждён") {
    return "Создан";
  }
  if (status === "Отправлен") {
    return "Подтверждён";
  }
  if (status === "Доставлен") {
    return "Отправлен";
  }
  return null;
}

function orderStatusRank(status: OrderStatus) {
  if (status === "Создан") {
    return 0;
  }
  if (status === "Подтверждён") {
    return 1;
  }
  if (status === "Отправлен") {
    return 2;
  }
  if (status === "Доставлен") {
    return 3;
  }
  return 4;
}

function statusClassName(status: "Все" | OrderStatus) {
  if (status === "Создан") {
    return "created";
  }
  if (status === "Подтверждён") {
    return "confirmed";
  }
  if (status === "Отправлен") {
    return "shipped";
  }
  if (status === "Доставлен") {
    return "delivered";
  }
  if (status === "Отменён") {
    return "cancelled";
  }
  return "all";
}

function isDeliveryOrder(order: OrderCard) {
  return order.deliveryMethod === "delivery" || order.delivery.startsWith("Доставка");
}

function getOrderDeliveryLabel(order: OrderCard) {
  if (order.deliveryMethod === "moscow-office") {
    return "Самовывоз · Москва";
  }
  if (order.deliveryMethod === "samara-office") {
    return "Самовывоз · Самара";
  }
  if (order.deliveryMethod === "delivery") {
    return "Доставка";
  }
  return order.delivery || "Получение не указано";
}

export function GrantCoinsPanel(props: GrantCoinsPanelProps) {
  const selectedEmployees = props.employees.filter((employee) =>
    props.selectedEmployeeIds.includes(employee.id),
  );
  const totalCoins = props.coins * selectedEmployees.length;
  const hasSelection = selectedEmployees.length > 0;
  const hasValidAmount = Number.isInteger(props.coins) && props.coins > 0;
  const canSubmit = hasSelection && hasValidAmount;
  const isDeduction = props.operation === "deduct";
  const operationVerb = isDeduction ? "Списать" : "Начислить";
  const operationNoun = isDeduction ? "Списание" : "Начисление";
  const validationMessage = !hasSelection
    ? "Выберите хотя бы одного получателя"
    : !hasValidAmount
      ? "Укажите количество мерчиков"
      : null;
  const showSafeThresholdWarning = props.coins >= 100 || totalCoins >= 500;
  const submitLabel = canSubmit
    ? selectedEmployees.length === 1
      ? `${operationVerb} ${formatMerchiki(props.coins)}`
      : `${operationVerb} ${formatMerchiki(totalCoins)}`
    : `${operationVerb} мерчики`;
  const importProgress =
    props.importState.total && props.importState.total > 0
      ? Math.round(((props.importState.processed ?? 0) / props.importState.total) * 100)
      : 0;

  return (
    <article className="panel admin-panel-block admin-grant-panel">
      <div className="panel-head panel-head-stack">
        <div>
          <h2>Операция с мерчиками</h2>
          <p>Выбери получателей, задай тип операции, сумму и при необходимости добавь причину.</p>
        </div>
      </div>

      <div className="admin-grant-layout">
        <div className="admin-grant-people">
          <EmployeePicker
            employees={props.employees}
            label="Получатели"
            onClearSelection={props.onClearSelection}
            onSelectMany={props.onSelectMany}
            onToggleEmployee={props.onToggleEmployee}
            searchEndpoint="/api/employees/search"
            selectedEmployeeIds={props.selectedEmployeeIds}
          />
        </div>

        <div className="admin-grant-primary">
          <div className="admin-grant-column-label">Тип операции</div>
          <div className="grant-operation-switch" role="tablist" aria-label="Тип операции с мерчиками">
            <button
              aria-selected={props.operation === "grant"}
              className={props.operation === "grant" ? "mode-button active" : "mode-button"}
              onClick={() => props.onOperationChange("grant")}
              type="button"
            >
              Начислить
            </button>
            <button
              aria-selected={props.operation === "deduct"}
              className={props.operation === "deduct" ? "mode-button active danger" : "mode-button danger"}
              onClick={() => props.onOperationChange("deduct")}
              type="button"
            >
              Списать
            </button>
          </div>

          <div className="grant-operation-note">
            {isDeduction
              ? "Списание уменьшает баланс выбранных получателей."
              : "Начисление увеличивает баланс выбранных получателей."}
          </div>

          <label className="field">
            <span>Количество мерчиков</span>
            <input
              min={1}
              inputMode="numeric"
              pattern="[0-9]*"
              type="text"
              value={props.coins === 0 ? "" : String(props.coins)}
              onChange={(event) => props.onCoinsChange(Number((event.target.value || "0").replace(/^0+(?=\d)/, "")))}
            />
          </label>

          <label className="field">
            <span>{isDeduction ? "Причина списания" : "Причина начисления"}</span>
            <input
              placeholder={isDeduction ? "Например: Корректировка баланса" : "Например: Бонус за релиз"}
              value={props.reason}
              onChange={(event) => props.onReasonChange(event.target.value)}
            />
          </label>

          <div className="grant-summary">
            <strong>{operationNoun}</strong>
            {canSubmit ? (
              <p>
                {props.coins} × {selectedEmployees.length} = {formatMerchiki(totalCoins)}
              </p>
            ) : (
              <p>{validationMessage}</p>
            )}
            {selectedEmployees.length > 0 && selectedEmployees.length <= 3 ? (
              <span>{selectedEmployees.map((employee) => employee.name).join(", ")}</span>
            ) : selectedEmployees.length > 3 ? (
              <span>Выбрано: {formatEmployees(selectedEmployees.length)}</span>
            ) : null}
          </div>

          {showSafeThresholdWarning ? (
            <p className="grant-warning">Проверьте сумму операции перед отправкой.</p>
          ) : null}

          <button
            className="action-button admin-submit"
            disabled={!canSubmit}
            onClick={props.onSubmit}
            type="button"
          >
            {submitLabel}
          </button>
        </div>

        <div className="admin-grant-support">
          <div className="admin-grant-column-label">Импорт</div>
          <div className="grant-import-card">
            <div className="grant-import-head">
              <strong>Загрузка через таблицу</strong>
              <span>
                {isDeduction
                  ? "CSV или TSV с колонками: получатель, мерчики, причина списания. В таблице указывайте сумму, которую нужно списать у каждого получателя."
                  : "CSV или TSV с колонками: получатель, мерчики, причина начисления. В таблице указывайте сумму, которую нужно начислить каждому получателю."}
              </span>
            </div>
            <div className="grant-import-actions">
              <label className="action-button secondary compact file-button">
                Загрузить таблицу
                <input
                  accept=".csv,.tsv,text/csv,text/tab-separated-values"
                  hidden
                  onChange={(event) => {
                    props.onImportTable(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
              <button className="link-button" onClick={props.onDownloadTemplate} type="button">
                Скачать шаблон
              </button>
            </div>
            <span className="grant-import-detail">{props.importState.detail}</span>
            <div className="grant-import-template">
              <strong>Пример строки</strong>
              <code>
                {isDeduction
                  ? "anna@company.test, 50, Корректировка баланса"
                  : "anna@company.test, 50, Бонус за релиз"}
              </code>
            </div>
            {props.importPreview ? (
              <div className="grant-import-preview">
                <div className="grant-import-preview-head">
                  <strong>{props.importPreview.fileName}</strong>
                  <span>Найдено строк: {props.importPreview.rows.length}</span>
                </div>
                <div className="grant-import-preview-table" role="table" aria-label="Предпросмотр таблицы начислений">
                  <div className="grant-import-preview-row grant-import-preview-row-head" role="row">
                    <span role="columnheader">Получатель</span>
                    <span role="columnheader">Мерчики</span>
                    <span role="columnheader">Причина</span>
                  </div>
                  {props.importPreview.sample.map((row, index) => (
                    <div className="grant-import-preview-row" key={`${row.recipient}-${index}`} role="row">
                      <span role="cell">{row.recipient}</span>
                      <span role="cell">{row.amount}</span>
                      <span role="cell">{row.reason}</span>
                    </div>
                  ))}
                </div>
                {props.importPreview.rows.length > props.importPreview.sample.length ? (
                  <span className="grant-import-detail">
                    Показаны первые {props.importPreview.sample.length} строк.
                  </span>
                ) : null}
                <div className="grant-import-actions">
                  <button
                    className="action-button secondary compact"
                    disabled={props.importState.phase === "processing"}
                    onClick={props.onConfirmImport}
                    type="button"
                  >
                    Загрузить в систему
                  </button>
                  <button className="link-button" onClick={props.onClearImportPreview} type="button">
                    Очистить
                  </button>
                </div>
              </div>
            ) : null}
            {props.importState.phase === "processing" ? (
              <div className="grant-import-progress">
                <div className="grant-import-progress-bar">
                  <div className="grant-import-progress-fill" style={{ width: `${importProgress}%` }} />
                </div>
                <span>
                  {props.importState.processed ?? 0} / {props.importState.total ?? 0}
                </span>
              </div>
            ) : null}
            {props.importState.error ? <span className="grant-import-error">{props.importState.error}</span> : null}
          </div>

          <div className="grant-side-tip">
            <strong>Как удобнее работать</strong>
            <p>Сначала выберите получателей, затем тип операции и сумму. Для массовых операций можно загрузить таблицу.</p>
          </div>
        </div>
      </div>
    </article>
  );
}

export function GrantHistoryList({ entries, limit, onShowAll }: GrantHistoryListProps) {
  const [filter, setFilter] = useState<GrantHistoryFilter>("Все");
  const [visibleCount, setVisibleCount] = useState(limit ?? 8);
  const filters: GrantHistoryFilter[] = ["Все", "Ручные", "Автоматические", "Сегодня", "7 дней", "30 дней"];
  const filteredEntries = useMemo(() => {
    const nextEntries = entries.filter((entry) => {
      const isAutomatic = entry.adminName === "Система" || entry.reason.toLowerCase().includes("автоматичес");
      const date = parseRussianDateLabel(entry.date);

      if (filter === "Ручные") {
        return !isAutomatic;
      }
      if (filter === "Автоматические") {
        return isAutomatic;
      }
      if (filter === "Сегодня") {
        return isWithinDays(date, 0);
      }
      if (filter === "7 дней") {
        return isWithinDays(date, 7);
      }
      if (filter === "30 дней") {
        return isWithinDays(date, 30);
      }
      return true;
    });

    const groupedEntries: GroupedGrantHistoryEntry[] = [];

    for (const entry of nextEntries) {
      const isAutomatic = entry.adminName === "Система" || entry.reason.toLowerCase().includes("автоматичес");
      const previous = groupedEntries[groupedEntries.length - 1];
      const canMerge =
        previous &&
        previous.sourceName === entry.adminName &&
        previous.amount === entry.amount &&
        previous.reason === entry.reason &&
        previous.date === entry.date &&
        previous.isAutomatic === isAutomatic;

      if (canMerge) {
        previous.employeeNames.push(entry.employeeName);
        previous.ids.push(entry.id);
        continue;
      }

      groupedEntries.push({
        amount: entry.amount,
        date: entry.date,
        employeeNames: [entry.employeeName],
        ids: [entry.id],
        isAutomatic,
        reason: entry.reason,
        sourceName: entry.adminName,
      });
    }

    return groupedEntries;
  }, [entries, filter]);
  const effectiveVisibleCount = limit ?? visibleCount;
  const visibleEntries = filteredEntries.slice(0, effectiveVisibleCount);

  return (
    <article className="panel admin-panel-block">
      <div className="panel-head panel-head-stack">
        <div>
          <h2>Последние операции с мерчиками</h2>
          <p>Ручные и автоматические начисления и списания в одном журнале.</p>
        </div>
        {onShowAll ? (
          <button className="link-button" onClick={onShowAll} type="button">
            Показать все
          </button>
        ) : (
          <span className="badge">
            {filteredEntries.length} {pluralizeRu(filteredEntries.length, "запись", "записи", "записей")}
          </span>
        )}
      </div>
      <div className="grant-history-filters">
        {filters.map((item) => (
          <button
            className={filter === item ? "mode-button active" : "mode-button"}
            key={item}
            onClick={() => {
              setFilter(item);
              setVisibleCount(8);
            }}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>
      {visibleEntries.length > 0 ? (
        <div className="grant-history-list">
          {visibleEntries.map((entry) => {
            const employeeLabel =
              entry.employeeNames.length === 1
                ? entry.employeeNames[0]
                : entry.employeeNames.length === 2
                  ? `${entry.employeeNames[0]}, ${entry.employeeNames[1]}`
                  : `${entry.employeeNames[0]}, ${entry.employeeNames[1]} и ещё ${entry.employeeNames.length - 2}`;

            return (
              <div className="grant-history-row" key={entry.ids.join("-")}>
                <div className="grant-history-copy">
                  <div className="grant-history-topline">
                    <strong>
                      {entry.sourceName} → {employeeLabel}
                    </strong>
                    <span className={entry.isAutomatic ? "grant-type-badge automatic" : "grant-type-badge manual"}>
                      {entry.isAutomatic ? "Автоматическое" : "Ручное"}
                    </span>
                    {entry.employeeNames.length > 1 ? (
                      <span className="grant-group-count">{formatEmployees(entry.employeeNames.length)}</span>
                    ) : null}
                  </div>
                  <p>{entry.reason}</p>
                </div>
                <div className="grant-history-meta">
                  <strong>{entry.amount > 0 ? "+" : "−"}{formatMerchiki(Math.abs(entry.amount))}</strong>
                  <span>{entry.date}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="history-empty-state">
          <strong>Пока нет начислений</strong>
          <p>Здесь появятся последние операции начисления</p>
        </div>
      )}
      {!limit && visibleCount < filteredEntries.length ? (
        <button className="action-button secondary history-more-button" onClick={() => setVisibleCount((count) => count + 8)} type="button">
          Показать ещё
        </button>
      ) : null}
    </article>
  );
}

export function AdminOrdersPanel({ bulkState, orders, onCancelOrder, onUpdateStatus }: AdminOrdersPanelProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"Все" | OrderStatus>("Все");
  const [deliveryFilter, setDeliveryFilter] =
    useState<(typeof adminOrderDeliveryFilters)[number]>("Все способы");
  const [sortMode, setSortMode] = useState<AdminOrderSortMode>("date-desc");
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [detailsOrder, setDetailsOrder] = useState<OrderCard | null>(null);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    const nextOrders = orders.filter((order) => {
      if (statusFilter !== "Все" && order.status !== statusFilter) {
        return false;
      }

      const isDelivery = order.deliveryMethod === "delivery" || order.delivery.startsWith("Доставка");
      if (deliveryFilter === "Самовывоз" && isDelivery) {
        return false;
      }
      if (deliveryFilter === "Доставка" && !isDelivery) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = `${order.id} ${order.customerName ?? ""} ${order.itemTitle} ${order.delivery} ${order.deliveryPhone ?? ""} ${order.deliveryAddress ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });

    nextOrders.sort((left, right) => {
      const leftDate = parseRussianDateLabel(left.date)?.getTime() ?? 0;
      const rightDate = parseRussianDateLabel(right.date)?.getTime() ?? 0;

      if (sortMode === "date-asc") {
        return leftDate - rightDate;
      }
      if (sortMode === "status") {
        return orderStatusRank(left.status) - orderStatusRank(right.status);
      }
      if (sortMode === "customer") {
        return (left.customerName ?? "Сотрудник не указан").localeCompare(
          right.customerName ?? "Сотрудник не указан",
          "ru",
        );
      }
      if (sortMode === "delivery") {
        return getOrderDeliveryLabel(left).localeCompare(getOrderDeliveryLabel(right), "ru");
      }
      return rightDate - leftDate;
    });

    return nextOrders;
  }, [deliveryFilter, orders, search, sortMode, statusFilter]);

  const groupedOrders = useMemo(() => {
    const groups = new Map<string, OrderCard[]>();

    for (const order of filteredOrders) {
      const key = order.date;
      const bucket = groups.get(key) ?? [];
      bucket.push(order);
      groups.set(key, bucket);
    }

    return Array.from(groups.entries()).map(([date, items]) => ({ date, items }));
  }, [filteredOrders]);

  const createdCount = orders.filter((order) => order.status === "Создан").length;
  const confirmedCount = orders.filter((order) => order.status === "Подтверждён").length;
  const shippedCount = orders.filter((order) => order.status === "Отправлен").length;
  const deliveredCount = orders.filter((order) => order.status === "Доставлен").length;
  const allFilteredSelected =
    filteredOrders.length > 0 && filteredOrders.every((order) => selectedOrderIds.includes(order.id));
  const selectedOrders = orders.filter((order) => selectedOrderIds.includes(order.id));
  const bulkConfirmCount = selectedOrders.filter((order) => order.status === "Создан").length;
  const bulkShipCount = selectedOrders.filter((order) => order.status === "Подтверждён").length;
  const bulkDeliverCount = selectedOrders.filter((order) => order.status === "Отправлен").length;

  function toggleOrder(orderId: string) {
    setSelectedOrderIds((current) =>
      current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId],
    );
  }

  function toggleAllFiltered() {
    setSelectedOrderIds((current) =>
      allFilteredSelected
        ? current.filter((id) => !filteredOrders.some((order) => order.id === id))
        : Array.from(new Set([...current, ...filteredOrders.map((order) => order.id)])),
    );
  }

  function runBulkOrderAction(status: OrderStatus) {
    const eligibleIds = selectedOrders.filter((order) => order.status === previousOrderStatus(status)).map((order) => order.id);
    if (eligibleIds.length === 0) {
      return;
    }
    onUpdateStatus(eligibleIds, status);
    setSelectedOrderIds([]);
  }

  return (
    <section className="admin-section section-gap">
      <div className="admin-section-head">
        <div>
          <h2>Управление заказами</h2>
          <p>Рабочий список заказов с получением, статусами и быстрыми действиями.</p>
        </div>
      </div>

      <div className="grid five-up admin-order-summary-grid">
        <article className="panel admin-order-summary-card total">
          <strong>{orders.length}</strong>
          <span>Всего</span>
        </article>
        <article className="panel admin-order-summary-card created">
          <strong>{createdCount}</strong>
          <span>Создано</span>
        </article>
        <article className="panel admin-order-summary-card confirmed">
          <strong>{confirmedCount}</strong>
          <span>Подтверждено</span>
        </article>
        <article className="panel admin-order-summary-card shipped">
          <strong>{shippedCount}</strong>
          <span>Отправлено</span>
        </article>
        <article className="panel admin-order-summary-card delivered">
          <strong>{deliveredCount}</strong>
          <span>Доставлено</span>
        </article>
      </div>

      <article className="panel admin-panel-block">
        <div className="admin-table-tools admin-order-tools">
          <div className="admin-orders-toolbar-sticky">
            <div className="grant-history-filters catalog-filters admin-order-status-tabs">
              {adminOrderStatusFilters.map((item) => (
                <button
                  className={statusFilter === item ? `mode-button active ${statusClassName(item)}` : `mode-button ${statusClassName(item)}`}
                  key={item}
                  onClick={() => setStatusFilter(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="grant-history-filters catalog-filters admin-order-delivery-tabs">
              {adminOrderDeliveryFilters.map((item) => (
                <button
                  className={deliveryFilter === item ? "mode-button active" : "mode-button"}
                  key={item}
                  onClick={() => setDeliveryFilter(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="admin-order-toolbar-row">
              <label className="field compact admin-search">
                <span>Поиск заказа</span>
                <input
                  placeholder="Поиск по сотруднику, товару, адресу, телефону или ID"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>

              <label className="field compact admin-order-sort-field">
                <span>Сортировка</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as AdminOrderSortMode)}>
                  {adminOrderSortModes.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="admin-order-toolbar-meta">
              <span>Найдено: {formatOrders(filteredOrders.length)}</span>
              <div className="admin-order-toolbar-actions">
                <button className="link-button" onClick={toggleAllFiltered} type="button">
                  {allFilteredSelected ? "Снять выбор" : "Выбрать найденные"}
                </button>
                {selectedOrderIds.length > 0 ? (
                  <button className="link-button" onClick={() => setSelectedOrderIds([])} type="button">
                    Очистить выбор
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {selectedOrderIds.length > 0 ? (
          <div className="catalog-bulk-bar admin-order-bulk-bar">
                <strong>Выбрано: {formatOrders(selectedOrderIds.length)}</strong>
            <div className="catalog-bulk-actions">
              {bulkConfirmCount > 0 ? (
                <button className="link-button" onClick={() => runBulkOrderAction("Подтверждён")} type="button">
                  Подтвердить {bulkConfirmCount}
                </button>
              ) : null}
              {bulkShipCount > 0 ? (
                <button className="link-button" onClick={() => runBulkOrderAction("Отправлен")} type="button">
                  Отправить {bulkShipCount}
                </button>
              ) : null}
              {bulkDeliverCount > 0 ? (
                <button className="link-button" onClick={() => runBulkOrderAction("Доставлен")} type="button">
                  Доставить {bulkDeliverCount}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {bulkState && bulkState.phase !== "idle" ? (
          <div className="bulk-progress-card">
            <div className="bulk-progress-head">
              <strong>{bulkState.title}</strong>
              {bulkState.total ? (
                <span>
                  {bulkState.processed ?? 0} / {bulkState.total}
                </span>
              ) : null}
            </div>
            <span className="bulk-progress-detail">{bulkState.detail}</span>
            {bulkState.total ? (
              <div className="grant-import-progress">
                <div className="grant-import-progress-bar">
                  <div
                    className="grant-import-progress-fill"
                    style={{ width: `${Math.round((((bulkState.processed ?? 0) / bulkState.total) || 0) * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="admin-orders-list">
          {groupedOrders.map((group) => (
            <section className="admin-order-group" key={group.date}>
              <div className="admin-order-group-head">
                <strong>{group.date}</strong>
                <span>{formatOrders(group.items.length)}</span>
              </div>
              <div className="admin-order-columns" aria-hidden="true">
                <span />
                <span>Заказ</span>
                <span>Получение</span>
                <span>Статус</span>
                <span>Действие</span>
              </div>
              <div className="admin-order-group-list">
                {group.items.map((order) => {
                  const nextStatus = getNextOrderStatus(order.status);
                  const nextStatusLabel = getNextOrderStatusLabel(order.status);
                  const requiresAction = order.status !== "Доставлен" && order.status !== "Отменён";
                  const isCompleted = order.status === "Доставлен" || order.status === "Отменён";
                  const deliveryBadge = isDeliveryOrder(order)
                    ? "🚚 Доставка"
                    : order.deliveryMethod === "samara-office"
                      ? "📦 Самовывоз · Самара"
                      : "📦 Самовывоз · Москва";

                  return (
                    <article
                      className={isCompleted ? "order-card admin-order-card compact completed" : "order-card admin-order-card compact"}
                      key={order.id}
                      onClick={() => setDetailsOrder(order)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setDetailsOrder(order);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="admin-order-row">
                        <div className="admin-order-select" onClick={(event) => event.stopPropagation()}>
                          <input
                            checked={selectedOrderIds.includes(order.id)}
                            onChange={() => toggleOrder(order.id)}
                            type="checkbox"
                          />
                        </div>

                        <div className="admin-order-primary">
                          <strong>{order.customerName ?? "Сотрудник не указан"}</strong>
                          <span className="admin-order-item-line">{order.itemTitle}</span>
                        </div>

                        <div className="admin-order-meta compact">
                          <span className="admin-order-delivery-badge">{deliveryBadge}</span>
                          <span>{order.date}</span>
                        </div>

                        <div className={isCompleted ? "admin-order-status-wrap completed" : "admin-order-status-wrap"}>
                          <span className={`admin-order-status-badge ${order.status === "Создан" ? "created" : order.status === "Подтверждён" ? "confirmed" : order.status === "Отправлен" ? "shipped" : order.status === "Отменён" ? "cancelled" : "delivered"}`}>
                            ● {order.status}
                          </span>
                          <span className={requiresAction ? "admin-order-requires-action" : "admin-order-requires-action done"}>
                            {getOrderActionHint(order.status)}
                          </span>
                        </div>

                        <div className="admin-order-actions" onClick={(event) => event.stopPropagation()}>
                          {order.status === "Создан" ? (
                            <div className="admin-order-inline-actions">
                              <button
                                className="action-button secondary compact"
                                onClick={() => onUpdateStatus([order.id], "Подтверждён")}
                                type="button"
                              >
                                Подтвердить
                              </button>
                              <button className="link-button muted-link" onClick={() => onCancelOrder(order.id)} type="button">
                                Отменить
                              </button>
                            </div>
                          ) : nextStatus && nextStatusLabel ? (
                            <button
                              className="action-button secondary compact"
                              onClick={() => onUpdateStatus([order.id], nextStatus)}
                              type="button"
                            >
                              {nextStatusLabel}
                            </button>
                          ) : isCompleted ? (
                            <span className={order.status === "Отменён" ? "admin-order-complete-note cancelled" : "admin-order-complete-note"}>
                              {order.status === "Отменён" ? "Заказ отменён" : "Заказ завершён"}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}

          {filteredOrders.length === 0 ? (
            <div className="admin-role-hint">
              <strong>Заказы не найдены</strong>
              <span>Попробуйте изменить фильтры или строку поиска.</span>
            </div>
          ) : null}
        </div>
      </article>

      {detailsOrder && typeof document !== "undefined"
        ? createPortal(
            <div className="info-modal-backdrop" onClick={() => setDetailsOrder(null)} role="presentation">
              <div
                aria-modal="true"
                className="info-modal"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
              >
                <div className="panel-head">
                  <h2>Заказ {detailsOrder.id}</h2>
                  <button className="link-button" onClick={() => setDetailsOrder(null)} type="button">
                    Закрыть
                  </button>
                </div>

                <div className="info-modal-body">
                    <div className="admin-order-details">
                    <div className="admin-order-details-grid">
                      <div>
                        <span>Сотрудник</span>
                        <strong>{detailsOrder.customerName ?? "Сотрудник не указан"}</strong>
                      </div>
                      <div>
                        <span>Товар</span>
                        <strong>{detailsOrder.itemTitle}</strong>
                      </div>
                      <div>
                        <span>Статус</span>
                        <strong>{detailsOrder.status}</strong>
                      </div>
                      <div>
                        <span>Дата</span>
                        <strong>{detailsOrder.date}</strong>
                      </div>
                      <div>
                        <span>Получение</span>
                        <strong>{getOrderDeliveryLabel(detailsOrder)}</strong>
                      </div>
                      {detailsOrder.deliveryMethod === "delivery" ? (
                        <>
                          <div>
                            <span>Адрес</span>
                            <strong>{detailsOrder.deliveryAddress ?? "Не указан"}</strong>
                          </div>
                          <div>
                            <span>Индекс</span>
                            <strong>{detailsOrder.deliveryPostalCode ?? "Не указан"}</strong>
                          </div>
                          <div>
                            <span>Телефон</span>
                            <strong>{detailsOrder.deliveryPhone ?? "Не указан"}</strong>
                          </div>
                        </>
                      ) : null}
                    </div>
                    {detailsOrder.status === "Создан" ? (
                      <div className="admin-order-details-actions">
                        <button
                          className="action-button secondary"
                          onClick={() => {
                            onCancelOrder(detailsOrder.id);
                            setDetailsOrder((current) => (current ? { ...current, status: "Отменён" } : current));
                          }}
                          type="button"
                        >
                          Отменить заказ
                        </button>
                        <button
                          className="action-button"
                          onClick={() => {
                            onUpdateStatus([detailsOrder.id], "Подтверждён");
                            setDetailsOrder((current) => (current ? { ...current, status: "Подтверждён" } : current));
                          }}
                          type="button"
                        >
                          Подтвердить
                        </button>
                      </div>
                    ) : getNextOrderStatus(detailsOrder.status) && getNextOrderStatusLabel(detailsOrder.status) ? (
                      <div className="admin-order-details-actions">
                        <button
                          className="action-button"
                          onClick={() => {
                            const nextStatus = getNextOrderStatus(detailsOrder.status);
                            if (nextStatus) {
                              onUpdateStatus([detailsOrder.id], nextStatus);
                              setDetailsOrder((current) =>
                                current ? { ...current, status: nextStatus } : current,
                              );
                            }
                          }}
                          type="button"
                        >
                          {getNextOrderStatusLabel(detailsOrder.status)}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

const russianMonthMap: Record<string, number> = {
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11,
};

function parseRussianDateLabel(value: string) {
  const normalized = value.trim();
  const isoCandidate = new Date(normalized);
  if (Number.isFinite(isoCandidate.getTime())) {
    return isoCandidate;
  }

  const match = normalized.match(/^(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?(?:\s*г\.?)?$/i);
  if (!match) {
    return null;
  }

  const [, dayValue, monthLabel, yearValue] = match;
  const month = russianMonthMap[monthLabel.toLowerCase()];
  if (typeof month !== "number") {
    return null;
  }

  const year = yearValue ? Number(yearValue) : 2026;
  const day = Number(dayValue);
  const parsed = new Date(Date.UTC(year, month, day));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function getZonedDayStamp(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: APP_TIMEZONE,
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? date.getUTCFullYear());
  const month = Number(parts.find((part) => part.type === "month")?.value ?? date.getUTCMonth() + 1);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? date.getUTCDate());
  return Date.UTC(year, month - 1, day);
}

function isWithinDays(value: Date | null, days: number) {
  if (!value) {
    return false;
  }

  const nowStamp = getZonedDayStamp(new Date());
  const valueStamp = getZonedDayStamp(value);
  const diffDays = Math.floor((nowStamp - valueStamp) / (24 * 60 * 60 * 1000));

  if (diffDays < 0) {
    return false;
  }

  if (days === 0) {
    return diffDays === 0;
  }

  return diffDays <= days;
}

function stockSummary(item: MerchItem) {
  const totalStock = item.sizes?.reduce((sum, entry) => sum + entry.stock, 0) ?? item.stock;
  if (totalStock <= 0) {
    return "Нет в наличии";
  }

  if (!item.sizes?.length) {
    return `${totalStock}`;
  }

  return item.sizes.map((entry) => `${entry.size} · ${entry.stock}`).join(" · ");
}

function totalStock(item: MerchItem) {
  return item.sizes?.reduce((sum, entry) => sum + entry.stock, 0) ?? item.stock;
}

function catalogHealthSignals(item: MerchItem) {
  const health: string[] = [];
  if (!item.imageUrl) {
    health.push("Нет фото");
  }
  if (!item.description.trim()) {
    health.push("Нет описания");
  }
  if (item.priceCoins <= 0) {
    health.push("Цена 0");
  }
  if (totalStock(item) <= 0) {
    health.push("Нет остатка");
  } else if ((item.popularity ?? 0) <= 0) {
    health.push("Нет покупок");
  }
  return health;
}

export function CatalogTable(props: CatalogTableProps) {
  const [filter, setFilter] = useState<CatalogFilter>("Все");
  const [sortKey, setSortKey] = useState<CatalogSortKey>("title");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<
    | { type: "single"; itemId: string }
    | { type: "bulk"; itemIds: string[] }
    | null
  >(null);

  const visibleItems = useMemo(() => {
    const query = props.search.trim().toLowerCase();
    return [...props.items]
      .filter((item) => {
        if (query) {
          const haystack = `${item.title} ${item.description} ${item.category ?? ""}`.toLowerCase();
          if (!haystack.includes(query)) {
            return false;
          }
        }

        const itemStock = totalStock(item);
        if (filter === "Активные") {
          return item.isActive;
        }
        if (filter === "Скрытые") {
          return !item.isActive;
        }
        if (filter === "Нет в наличии") {
          return itemStock === 0;
        }
        if (filter === "Заканчивается") {
          return itemStock > 0 && itemStock <= lowStockThreshold;
        }
        return true;
      })
      .sort((left, right) => {
        if (sortKey === "priceCoins") {
          return right.priceCoins - left.priceCoins;
        }
        if (sortKey === "popularity") {
          return (right.popularity ?? 0) - (left.popularity ?? 0);
        }
        if (sortKey === "status") {
          return Number(right.isActive) - Number(left.isActive);
        }
        return left.title.localeCompare(right.title, "ru");
      });
  }, [filter, props.items, props.search, sortKey]);

  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((item) => selectedItemIds.includes(item.id));

  function toggleSelected(itemId: string) {
    setSelectedItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
    );
  }

  function toggleSelectAllVisible() {
    setSelectedItemIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleItems.some((item) => item.id === id))
        : Array.from(new Set([...current, ...visibleItems.map((item) => item.id)])),
    );
  }

  function handleDelete(itemId: string) {
    setDeleteConfirm({ type: "single", itemId });
  }

  function handleBulkDelete() {
    setDeleteConfirm({ type: "bulk", itemIds: selectedItemIds });
  }

  function confirmDelete() {
    if (!deleteConfirm) {
      return;
    }

    if (deleteConfirm.type === "single") {
      props.onDelete(deleteConfirm.itemId);
    } else {
      props.onBulkDelete(deleteConfirm.itemIds);
      setSelectedItemIds([]);
    }

    setDeleteConfirm(null);
  }

  return (
    <>
      <article className="panel admin-panel-block">
        <div className="panel-head admin-table-head">
          <div>
            <h2>Каталог</h2>
            <p>Управляйте товарами, остатками и публикацией в одном списке.</p>
          </div>
          <div className="admin-table-tools">
            <div className="grant-history-filters catalog-filters">
              {catalogFilters.map((item) => (
                <button
                  className={filter === item ? "mode-button active" : "mode-button"}
                  key={item}
                  onClick={() => setFilter(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
            <label className="field compact admin-search">
              <span>Поиск товара</span>
              <input
                placeholder="🔎 Поиск товара"
                value={props.search}
                onChange={(event) => props.onSearchChange(event.target.value)}
              />
            </label>
            <button className="action-button" onClick={props.onAdd} type="button">
              + Добавить товар
            </button>
          </div>
        </div>

        {selectedItemIds.length > 0 ? (
          <div className="catalog-bulk-bar">
            <strong>Выбрано: {selectedItemIds.length}</strong>
            <div className="catalog-bulk-actions">
              <button className="link-button" onClick={() => props.onBulkVisibilityChange(selectedItemIds, false)} type="button">
                Скрыть
              </button>
              <button className="link-button" onClick={() => props.onBulkVisibilityChange(selectedItemIds, true)} type="button">
                Опубликовать
              </button>
              <button className="link-button muted-link" onClick={handleBulkDelete} type="button">
                Удалить
              </button>
            </div>
          </div>
        ) : null}

        {props.bulkState && props.bulkState.phase !== "idle" ? (
          <div className="bulk-progress-card">
            <div className="bulk-progress-head">
              <strong>{props.bulkState.title}</strong>
              {props.bulkState.total ? (
                <span>
                  {props.bulkState.processed ?? 0} / {props.bulkState.total}
                </span>
              ) : null}
            </div>
            <span className="bulk-progress-detail">{props.bulkState.detail}</span>
            {props.bulkState.total ? (
              <div className="grant-import-progress">
                <div className="grant-import-progress-bar">
                  <div
                    className="grant-import-progress-fill"
                    style={{ width: `${Math.round((((props.bulkState.processed ?? 0) / props.bulkState.total) || 0) * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="catalog-table-wrap">
          <div className="catalog-table-scroll">
            <table className="catalog-table">
            <colgroup>
              <col className="catalog-col-select" />
              <col className="catalog-col-photo" />
              <col className="catalog-col-title" />
              <col className="catalog-col-price" />
              <col className="catalog-col-stock" />
              <col className="catalog-col-purchases" />
              <col className="catalog-col-status" />
              <col className="catalog-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>
                  <input checked={allVisibleSelected} onChange={toggleSelectAllVisible} type="checkbox" />
                </th>
                <th>Фото</th>
                <th>
                  <button className="catalog-sort-button" onClick={() => setSortKey("title")} type="button">
                    Название
                  </button>
                </th>
                <th>
                  <button className="catalog-sort-button" onClick={() => setSortKey("priceCoins")} type="button">
                    Цена
                  </button>
                </th>
                <th>Остаток</th>
                <th>
                  <button className="catalog-sort-button" onClick={() => setSortKey("popularity")} type="button">
                    Покупки
                  </button>
                </th>
                <th>
                  <button className="catalog-sort-button" onClick={() => setSortKey("status")} type="button">
                    Статус
                  </button>
                </th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => {
                const itemStock = totalStock(item);
                const isLowStock = itemStock > 0 && itemStock <= lowStockThreshold;
                const health = catalogHealthSignals(item);

                return (
                <tr
                  className={props.editingItemId === item.id ? "catalog-row editing" : "catalog-row"}
                  key={item.id}
                  onClick={() => props.onEdit(item)}
                >
                  <td onClick={(event) => event.stopPropagation()}>
                    <input
                      checked={selectedItemIds.includes(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      type="checkbox"
                    />
                  </td>
                  <td>
                    <div className={item.imageFit === "cover" ? "catalog-thumb cover" : "catalog-thumb"}>
                      {item.imageUrl ? (
                        <img
                          alt={item.title}
                          src={item.imageUrl}
                          style={{
                            objectPosition: `${item.imagePositionX ?? 50}% ${item.imagePositionY ?? 50}%`,
                          }}
                        />
                      ) : (
                        <span>{item.title.slice(0, 1)}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="catalog-name-cell">
                      <strong>{item.title}</strong>
                      <p>{item.description || "Описание не добавлено"}</p>
                      <div className="catalog-row-meta">
                        {item.category ? <span>{item.category}</span> : null}
                        {health.map((signal) => (
                          <span className="catalog-health-chip" key={signal}>
                            {signal}
                          </span>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td>{item.priceCoins}</td>
                  <td>
                    <span className={itemStock === 0 ? "catalog-stock zero" : isLowStock ? "catalog-stock low" : "catalog-stock"}>
                      {stockSummary(item)}
                    </span>
                  </td>
                  <td>{item.popularity ?? 0}</td>
                  <td>
                    <span className={item.isActive ? "status-toggle active static" : "status-toggle static"}>
                      {item.isActive ? "Активен" : "Скрыт"}
                    </span>
                  </td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <div className="catalog-actions-inline">
                      <button
                        className="link-button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onEdit(item);
                        }}
                        type="button"
                      >
                        Редактировать
                      </button>
                      <button
                        className="link-button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onDuplicate(item.id);
                        }}
                        type="button"
                      >
                        Дублировать
                      </button>
                      <button
                        className="link-button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onVisibilityChange(item.id, !item.isActive);
                        }}
                        type="button"
                      >
                        {item.isActive ? "Скрыть" : "Опубликовать"}
                      </button>
                      <button
                        className="link-button muted-link"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleDelete(item.id);
                        }}
                        type="button"
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
            </table>
          </div>
          {visibleItems.length === 0 ? (
            <div className="catalog-empty-state">
              <strong>Товары не найдены</strong>
              <p>Попробуйте изменить поиск или добавьте новый товар</p>
            </div>
          ) : null}
        </div>
      </article>

      {deleteConfirm ? (
        <div className="info-modal-backdrop" onClick={() => setDeleteConfirm(null)} role="presentation">
          <div
            aria-modal="true"
            className="info-modal catalog-confirm-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Подтверждение удаления"
          >
            <div className="panel-head panel-head-stack">
              <div>
                <h2>{deleteConfirm.type === "single" ? "Удалить товар?" : "Удалить выбранные товары?"}</h2>
                <p>Это действие нельзя отменить.</p>
              </div>
            </div>
            <div className="catalog-confirm-actions">
              <button className="action-button secondary" onClick={() => setDeleteConfirm(null)} type="button">
                Отмена
              </button>
              <button className="action-button" onClick={confirmDelete} type="button">
                Удалить
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </>
  );
}

export function ProductEditorModal(props: ProductEditorModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDropzoneActive, setIsDropzoneActive] = useState(false);
  const draft = props.draft;

  if (!draft) {
    return null;
  }

  const hasImage = Boolean(draft.imageUrl);
  const knownCategories = Array.from(
    new Set(
      [...baseCatalogCategories, ...props.existingCategories].filter(
        (category) => category.trim() && category !== "Все",
      ),
    ),
  );
  const usesCustomCategory = draft.category ? !knownCategories.includes(draft.category) : false;
  const trimmedTitle = draft.title.trim();
  const normalizedSizes = draft.sizes ?? [];
  const duplicateSizes = new Set<string>();
  const seenSizes = new Set<string>();
  for (const entry of normalizedSizes) {
    const key = entry.size.trim().toLowerCase();
    if (!key) {
      continue;
    }
    if (seenSizes.has(key)) {
      duplicateSizes.add(key);
    }
    seenSizes.add(key);
  }
  const hasInvalidSize = normalizedSizes.some((entry) => !entry.size.trim() || !Number.isInteger(entry.stock) || entry.stock < 0);
  const isPriceInvalid = !Number.isFinite(draft.priceCoins) || draft.priceCoins < 0;
  const canSave = Boolean(trimmedTitle) && !isPriceInvalid && !hasInvalidSize && duplicateSizes.size === 0;
  const totalStockValue = totalStock(draft);
  const previewAvailability = totalStockValue <= 0 ? "Нет в наличии" : `В наличии ${totalStockValue}`;
  const isManualLimited = draft.manualLimited ?? false;

  function handleImageFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    props.onUploadImage(event.target.files?.[0] ?? null);
    event.currentTarget.value = "";
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDropzoneActive(false);
    props.onUploadImage(event.dataTransfer.files?.[0] ?? null);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"));
    if (!imageItem) {
      return;
    }
    event.preventDefault();
    const pastedFile = imageItem.getAsFile();
    if (!pastedFile) {
      return;
    }
    props.onUploadImage(new File([pastedFile], pastedFile.name || "pasted-image.png", { type: pastedFile.type }));
  }

  const content = (
    <div className="editor-modal-backdrop" onClick={props.onClose} role="presentation">
      <div
        className="editor-modal editor-centered"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Редактор товара"
      >
        <div className="panel-head">
          <h2>{draft.id ? "Редактировать товар" : "Создать товар"}</h2>
        </div>

        <div className="editor-modal-grid">
          <div className="editor-preview-column">
            <section className="editor-form-section editor-preview-section">
              <div className="editor-section-head">
                <h3>Фото товара</h3>
                <span>Загрузка и предпросмотр</span>
              </div>
              <p className="editor-preview-hint">
                Загрузите фото, при необходимости подгоните кадр и сразу проверьте, как карточка будет выглядеть в магазине.
              </p>
              <input
                accept="image/png,image/jpeg,image/webp"
                className="file-input-hidden"
                onChange={handleImageFileChange}
                ref={fileInputRef}
                id="catalog-image-input"
                type="file"
              />
              {hasImage ? (
                <div
                  className={
                    draft.imageFit === "cover"
                      ? "product-image admin-preview cover draggable"
                      : "product-image admin-preview draggable"
                  }
                  onPointerCancel={props.onEditorPreviewPointerUp}
                  onPointerDown={props.onEditorPreviewPointerDown}
                  onPointerMove={props.onEditorPreviewPointerMove}
                  onPointerUp={props.onEditorPreviewPointerUp}
                >
                  <img
                    alt={draft.title}
                    src={draft.imageUrl}
                    style={{
                      objectPosition: `${draft.imagePositionX ?? 50}% ${draft.imagePositionY ?? 50}%`,
                    }}
                  />
                </div>
              ) : (
                <div
                  aria-label="Загрузить фото товара"
                  className={
                    isDropzoneActive
                      ? "product-image admin-preview editor-image-picker active"
                      : props.photoUploadState.phase === "error"
                        ? "product-image admin-preview editor-image-picker error"
                        : props.photoUploadState.phase === "loading"
                          ? "product-image admin-preview editor-image-picker loading"
                          : "product-image admin-preview editor-image-picker"
                  }
                  onClick={openFilePicker}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDropzoneActive(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      return;
                    }
                    setIsDropzoneActive(false);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDropzoneActive(true);
                  }}
                  onDrop={handleDrop}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openFilePicker();
                    }
                  }}
                  onPaste={handlePaste}
                  role="button"
                  tabIndex={0}
                >
                  <div className="editor-image-picker-copy">
                    <strong>{draft.title || "Товар без фото"}</strong>
                    <span>Нажмите, чтобы загрузить фото</span>
                  </div>
                </div>
              )}
              <div className="editor-upload-inline">
                <div className="editor-upload-inline-copy">
                  {props.photoUploadState.phase === "loading" ? <strong>Загружаем фото...</strong> : null}
                  {props.photoUploadState.phase !== "loading" && hasImage ? <strong>Фото готово</strong> : null}
                  <span>
                    Поддерживаются PNG, JPG, WEBP · Максимум 10 MB · Рекомендуем от 1200 × 1200 px
                  </span>
                </div>
                <div className="editor-upload-actions">
                  <button className="action-button" onClick={openFilePicker} type="button">
                    {hasImage ? "Заменить фото" : "Выбрать файл"}
                  </button>
                  {hasImage ? (
                    <button className="action-button secondary" onClick={props.onRecropImage} type="button">
                      Подогнать кадр
                    </button>
                  ) : null}
                  {hasImage ? (
                    <button className="link-button muted-link" onClick={props.onRemoveImage} type="button">
                      Удалить фото
                    </button>
                  ) : null}
                </div>
                {(props.photoUploadState.fileName || props.photoUploadState.error || props.photoUploadState.warning) ? (
                  <div className="editor-upload-feedback">
                    {props.photoUploadState.fileName ? (
                      <div className="editor-upload-file">
                        <strong>{props.photoUploadState.fileName}</strong>
                        <span>
                          {props.photoUploadState.fileSizeLabel ?? "Файл выбран"}
                          {props.photoUploadState.width && props.photoUploadState.height
                            ? ` · ${props.photoUploadState.width} × ${props.photoUploadState.height}px`
                            : ""}
                        </span>
                      </div>
                    ) : null}
                    {props.photoUploadState.error ? <p className="field-error">{props.photoUploadState.error}</p> : null}
                    {props.photoUploadState.warning ? <p className="editor-helper-text">{props.photoUploadState.warning}</p> : null}
                    {props.photoUploadState.hasTransparency ? (
                      <p className="editor-helper-text">Прозрачные области PNG будут сохранены.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <div className="editor-form-column">
            <section className="editor-form-section">
              <div className="editor-section-head">
                <h3>Основное</h3>
              </div>
              <label className="field">
                <span>Категория</span>
                <select
                  value={usesCustomCategory || !draft.category ? "__custom" : draft.category}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "__custom") {
                      props.onChange({ category: "" });
                      return;
                    }
                    props.onChange({ category: value });
                  }}
                >
                  {knownCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                  <option value="__custom">Своя категория</option>
                </select>
              </label>
              {usesCustomCategory || !draft.category ? (
                <label className="field">
                  <span>Своя категория</span>
                  <input
                    placeholder="Например: Подарки"
                    value={draft.category ?? ""}
                    onChange={(event) => props.onChange({ category: event.target.value })}
                  />
                </label>
              ) : null}
              <label className="field">
                <span>Название</span>
                <input
                  value={draft.title}
                  onChange={(event) => props.onChange({ title: event.target.value })}
                />
                {!trimmedTitle ? <span className="field-error">Укажите название товара</span> : null}
              </label>
              <label className="field">
                <span>Описание</span>
                <input
                  value={draft.description}
                  onChange={(event) => props.onChange({ description: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Цена (мерчики)</span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  type="text"
                  value={String(draft.priceCoins)}
                  onChange={(event) => {
                    const digitsOnly = event.target.value.replace(/[^\d]/g, "");
                    const normalized = digitsOnly.replace(/^0+(?=\d)/, "");
                    props.onChange({ priceCoins: Number(normalized || 0) });
                  }}
                />
                {isPriceInvalid ? <span className="field-error">Цена не может быть отрицательной</span> : null}
              </label>
            </section>

            <section className="editor-form-section">
              <div className="editor-section-head">
                <h3>Размеры и остатки</h3>
                <button className="link-button" onClick={props.onAddSize} type="button">
                  + Размер
                </button>
              </div>
              <div className="editor-variants-table" role="table" aria-label="Размеры и остатки">
                <div className="editor-variants-head" role="row">
                  <span>Размер</span>
                  <span>Остаток</span>
                  <span aria-hidden="true" />
                </div>
                <div className="editor-size-list">
                  {draft.sizes?.map((entry, index) => {
                    const normalizedSizeKey = entry.size.trim().toLowerCase();
                    const isDuplicate = normalizedSizeKey ? duplicateSizes.has(normalizedSizeKey) : false;

                    return (
                      <div className="editor-size-row table" key={index}>
                        <div>
                          <input
                            className="editor-size-input"
                            maxLength={3}
                            placeholder="Размер"
                            value={entry.size}
                            onChange={(event) =>
                              props.onSizeChange(
                                index,
                                "size",
                                event.target.value.replace(/\s+/g, "").toUpperCase().slice(0, 3),
                              )
                            }
                          />
                          {!entry.size.trim() ? <span className="field-error">Укажите размер</span> : null}
                          {isDuplicate ? <span className="field-error">Размер уже существует</span> : null}
                        </div>
                        <div>
                          <input
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="Остаток"
                            type="text"
                            value={String(entry.stock)}
                            onChange={(event) => props.onSizeChange(index, "stock", event.target.value)}
                          />
                        </div>
                        <button className="link-button muted-link" onClick={() => props.onRemoveSize(index)} type="button">
                          Удалить
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="editor-form-section">
              <div className="editor-section-head">
                <h3>Публикация</h3>
              </div>
              <div className="editor-visibility-toggle">
                <button
                  className={draft.isActive ? "mode-button active" : "mode-button"}
                  onClick={() => props.onChange({ isActive: true })}
                  type="button"
                >
                  Активен
                </button>
                <button
                  className={!draft.isActive ? "mode-button active" : "mode-button"}
                  onClick={() => props.onChange({ isActive: false })}
                  type="button"
                >
                  Скрыт
                </button>
              </div>
              <div className="editor-visibility-toggle editor-badge-toggle">
                <button
                  className={
                    isManualLimited
                      ? "action-button secondary compact active-tag-toggle active-tag-toggle-on"
                      : "action-button secondary compact active-tag-toggle active-tag-toggle-off"
                  }
                  onClick={() => props.onChange({ manualLimited: !isManualLimited })}
                  type="button"
                >
                  {isManualLimited ? "Лимитировано: включено" : "Лимитировано: выключено"}
                </button>
                <p className="editor-helper-text">
                  Ручной тег. Показывается на карточке, пока товар есть в наличии.
                </p>
              </div>
            </section>
            {!canSave ? (
              <p className="grant-warning">Проверьте обязательные поля перед сохранением.</p>
            ) : null}
          </div>
        </div>

        <div className="editor-modal-actions sticky">
          <div className="editor-modal-status">
            {props.isDirty ? <span>Есть несохранённые изменения</span> : <span>Изменений нет</span>}
          </div>
          <div className="editor-modal-actions-main">
            {draft.id ? (
              <>
                <button className="action-button secondary" onClick={props.onDuplicate} type="button">
                  Дублировать
                </button>
                <button className="action-button secondary" onClick={props.onToggleVisibility} type="button">
                  {draft.isActive ? "Скрыть товар" : "Опубликовать"}
                </button>
              </>
            ) : null}
            <button className="action-button secondary" onClick={props.onClose} type="button">
              Отмена
            </button>
            <button className="action-button" disabled={!canSave} onClick={props.onSave} type="button">
              Сохранить товар
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(content, document.body);
}
