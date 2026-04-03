"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { MerchItem, MerchSizeStock } from "@/lib/domain/types";
import { formatMerchiki } from "@/lib/russian";

export type ShopCategory = string;
export type ShopSortMode =
  | "По популярности"
  | "По цене"
  | "Сначала доступные"
  | "Сначала новинки"
  | "По остатку";
type ShopCatalogProps = {
  categories: readonly ShopCategory[];
  selectedCategory: ShopCategory | null;
  sortMode: ShopSortMode;
  sortModes: readonly ShopSortMode[];
  searchQuery: string;
  searchSuggestions: string[];
  products: MerchItem[];
  firedItems: string[];
  availableCoins: number;
  loading?: boolean;
  selectedSizes: Record<string, string>;
  quantities: Record<string, number>;
  expandedProductId: string | null;
  onCategoryChange: (category: ShopCategory) => void;
  onSortChange: (sortMode: ShopSortMode) => void;
  onSearchChange: (query: string) => void;
  onToggleFire: (itemId: string) => void;
  onToggleExpand: (itemId: string) => void;
  onAddToCart: (itemId: string, quantity: number, size: string) => void;
  onSelectSize: (itemId: string, size: string) => void;
  onChangeQuantity: (itemId: string, nextQuantity: number, maxStock: number) => void;
};

type MetaChip = {
  label: string;
  tone?: "warning" | "normal";
};

type ProductSelectionState = {
  currentSize: string;
  currentSizeStock: number;
  quantity: number;
};

function badgeLabel(item: MerchItem) {
  return item.badge ?? null;
}

function imagePositionStyle(item: MerchItem) {
  return {
    objectPosition: `${item.imagePositionX ?? 50}% ${item.imagePositionY ?? 50}%`,
  };
}

function resolveProductSelection(
  item: MerchItem,
  selectedSizes: Record<string, string>,
  quantities: Record<string, number>,
): ProductSelectionState {
  const currentSize = selectedSizes[item.id] ?? item.sizes?.[0]?.size ?? "One size";
  const currentSizeStock = item.sizes?.find((entry) => entry.size === currentSize)?.stock ?? item.stock;
  const quantity = Math.min(quantities[item.id] ?? 1, Math.max(currentSizeStock, 1));

  return { currentSize, currentSizeStock, quantity };
}

function compactMeta(item: MerchItem, currentSizeStock: number): MetaChip[] {
  const meta: MetaChip[] = [];

  if (currentSizeStock <= 0) {
    meta.push({ label: "Нет в наличии", tone: "warning" });
  } else if (currentSizeStock <= 5) {
    meta.push({ label: `Осталось ${currentSizeStock}`, tone: "warning" });
  } else {
    meta.push({ label: `Осталось ${currentSizeStock}`, tone: "normal" });
  }

  return meta.slice(0, 1);
}

function showSizeSelector(sizes: MerchSizeStock[] | undefined) {
  if (!sizes || sizes.length === 0) {
    return false;
  }

  return !(sizes.length === 1 && sizes[0]?.size === "One size");
}

function ProductBadge({ label }: { label: string }) {
  const toneClass =
    label === "Популярно"
      ? "popular"
      : label === "Новинка"
        ? "new"
        : label === "Лимитировано"
          ? "limited"
          : "";

  return <span className={toneClass ? `product-badge ${toneClass}` : "product-badge"}>{label}</span>;
}

function FireButton({ active, onClick, prominent }: { active: boolean; onClick: () => void; prominent?: boolean }) {
  const className = [active ? "fire-icon-button active" : "fire-icon-button", prominent ? "prominent" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="fire-button-wrap">
      <button
        aria-label={active ? "Убрать огонёк" : "Поставить огонёк"}
        className={className}
        onClick={onClick}
        type="button"
      >
        <span aria-hidden="true" className="fire-emoji">
          🔥
        </span>
      </button>
      <div className="fire-tooltip" role="tooltip">
        Нажмите, чтобы продвинуть товар в популярные
      </div>
    </div>
  );
}

function QuantityStepper({
  quantity,
  maxStock,
  onChange,
}: {
  quantity: number;
  maxStock: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="quantity-stepper">
      <button disabled={quantity <= 1} onClick={() => onChange(quantity - 1)} type="button">
        -
      </button>
      <span>{quantity}</span>
      <button disabled={quantity >= Math.max(maxStock, 1)} onClick={() => onChange(quantity + 1)} type="button">
        +
      </button>
    </div>
  );
}

function AffordabilityState({ label, tone }: { label: string; tone: "affordable" | "deficit" }) {
  return (
    <div className={tone === "affordable" ? "affordability-state affordable" : "affordability-state deficit"}>
      <strong>{label}</strong>
    </div>
  );
}

function ProductAffordabilityState({
  availableCoins,
  priceCoins,
  unavailable = false,
}: {
  availableCoins: number;
  priceCoins: number;
  unavailable?: boolean;
}) {
  if (unavailable) {
    return (
      <div className="affordability-state deficit">
        <strong>Нет в наличии</strong>
      </div>
    );
  }

  const missingCoins = Math.max(priceCoins - availableCoins, 0);
  const affordable = missingCoins === 0;

  return (
    <div className={affordable ? "affordability-state affordable" : "affordability-state deficit"}>
      <strong>{affordable ? "Можно купить" : `Нельзя купить${missingCoins > 0 ? ` · не хватает ${missingCoins}` : ""}`}</strong>
    </div>
  );
}

function PurchaseButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="action-button product-button" onClick={onClick} type="button">
      Купить
    </button>
  );
}

function PurchaseOptionsPanel({
  item,
  currentSize,
  currentSizeStock,
  quantity,
  availableCoins,
  onAddToCart,
  onSelectSize,
  onChangeQuantity,
}: {
  item: MerchItem;
  currentSize: string;
  currentSizeStock: number;
  quantity: number;
  availableCoins: number;
  onAddToCart: () => void;
  onSelectSize: (size: string) => void;
  onChangeQuantity: (value: number) => void;
}) {
  const totalPrice = item.priceCoins * quantity;
  const missingCoins = Math.max(totalPrice - availableCoins, 0);
  const unavailable = currentSizeStock <= 0;

  let stockLabel = "Нет в наличии";
  if (currentSizeStock > 0 && currentSizeStock <= 5) {
    stockLabel = `Осталось ${currentSizeStock}`;
  } else if (currentSizeStock > 5) {
    stockLabel = `В наличии ${currentSizeStock}`;
  }

  return (
    <div className="purchase-panel">
      {showSizeSelector(item.sizes) ? (
        <label className="field compact purchase-field">
          <span>Размер</span>
          <select value={currentSize} onChange={(event) => onSelectSize(event.target.value)}>
            {(item.sizes ?? []).map((entry) => (
              <option key={entry.size} value={entry.size}>
                {entry.size}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="purchase-panel-row">
        <div className="purchase-field">
          <span>Количество</span>
          <QuantityStepper maxStock={currentSizeStock} quantity={quantity} onChange={onChangeQuantity} />
        </div>

        <div className="purchase-stock">
          <span>Наличие</span>
          <strong>{stockLabel}</strong>
        </div>
      </div>

      <div className="purchase-inline-summary">
        <span>Итого</span>
        <strong>{totalPrice} мерчиков</strong>
      </div>

      <button
        className="action-button product-buy-button"
        disabled={missingCoins > 0 || unavailable || quantity > currentSizeStock}
        onClick={onAddToCart}
        type="button"
      >
        В корзину
      </button>
    </div>
  );
}

function ProductDetailsModal({
  item,
  isFired,
  availableCoins,
  currentSize,
  currentSizeStock,
  quantity,
  onClose,
  onToggleFire,
  onAddToCart,
  onSelectSize,
  onChangeQuantity,
}: {
  item: MerchItem;
  isFired: boolean;
  availableCoins: number;
  currentSize: string;
  currentSizeStock: number;
  quantity: number;
  onClose: () => void;
  onToggleFire: () => void;
  onAddToCart: () => void;
  onSelectSize: (size: string) => void;
  onChangeQuantity: (value: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const primaryBadge = badgeLabel(item);
  const meta = compactMeta(item, currentSizeStock);
  const affordable = availableCoins >= item.priceCoins;
  const galleryImages = item.imageUrl ? [item.imageUrl] : [];

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      aria-hidden="true"
      className="product-details-backdrop"
      onClick={onClose}
    >
      <section
        aria-label={`Товар ${item.title}`}
        aria-modal="true"
        className="product-details-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button aria-label="Закрыть" className="product-details-close" onClick={onClose} type="button">
          ×
        </button>

        <div className="product-details-grid">
          <div className="product-details-gallery">
            <div className={item.imageFit === "cover" ? "product-image cover product-details-image" : "product-image product-details-image"}>
              {item.imageUrl ? (
                <img alt={item.title} src={item.imageUrl} style={imagePositionStyle(item)} />
              ) : (
                <span>{item.title}</span>
              )}
            </div>

            {galleryImages.length > 0 ? (
              <div className="product-details-thumbs" aria-label="Изображения товара">
                {galleryImages.map((imageUrl, index) => (
                  <div className="product-details-thumb active" key={`${imageUrl}-${index}`}>
                    <img alt={`${item.title} ${index + 1}`} src={imageUrl} style={imagePositionStyle(item)} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="product-details-copy">
            <div className="product-details-head">
              {primaryBadge ? <ProductBadge label={primaryBadge} /> : null}
              <FireButton active={isFired} onClick={onToggleFire} prominent={!affordable} />
            </div>

            <div className="product-copy product-details-title">
              <h3>{item.title}</h3>
              <strong className="price-label">{item.priceCoins} мерчиков</strong>
            </div>

            <ProductAffordabilityState
              availableCoins={availableCoins}
              priceCoins={item.priceCoins}
              unavailable={currentSizeStock <= 0}
            />

            <div className="product-details-description">
              <p>{item.description}</p>
            </div>

            <div className="product-meta-row product-details-meta">
              {meta.map((entry) => (
                <span className={entry.tone === "warning" ? "warning" : ""} key={entry.label}>
                  {entry.label}
                </span>
              ))}
            </div>

            <PurchaseOptionsPanel
              availableCoins={availableCoins}
              currentSize={currentSize}
              currentSizeStock={currentSizeStock}
              item={item}
              quantity={quantity}
              onAddToCart={onAddToCart}
              onChangeQuantity={onChangeQuantity}
              onSelectSize={onSelectSize}
            />
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function ProductCard({
  item,
  isFired,
  availableCoins,
  currentSize,
  currentSizeStock,
  expanded,
  onToggleFire,
  onToggleExpand,
}: {
  item: MerchItem;
  isFired: boolean;
  availableCoins: number;
  currentSize: string;
  currentSizeStock: number;
  expanded: boolean;
  onToggleFire: () => void;
  onToggleExpand: () => void;
}) {
  const primaryBadge = badgeLabel(item);
  const affordable = availableCoins >= item.priceCoins;
  const unavailable = currentSizeStock <= 0;
  const stockLabel = unavailable ? "Нет в наличии" : `Осталось ${currentSizeStock}`;

  return (
    <article className={expanded ? "catalog-item product-card expanded" : "catalog-item product-card"}>
      <div className="product-card-top">
        {primaryBadge ? <ProductBadge label={primaryBadge} /> : <span className="product-badge ghost">Мерч</span>}
        <FireButton active={isFired} onClick={onToggleFire} prominent={!affordable} />
      </div>

      <button
        className={item.imageFit === "cover" ? "product-image cover product-image-button" : "product-image product-image-button"}
        onClick={onToggleExpand}
        type="button"
      >
        {item.imageUrl ? <img alt={item.title} src={item.imageUrl} style={imagePositionStyle(item)} /> : <span>{item.title}</span>}
      </button>

      <div className="product-main">
        <div className="product-copy compact">
          <button className="product-title-button" onClick={onToggleExpand} type="button">
            <span className="product-title-text">{item.title}</span>
          </button>
        </div>

        <div className="product-inline-status">
          <ProductAffordabilityState
            availableCoins={availableCoins}
            priceCoins={item.priceCoins}
            unavailable={unavailable}
          />
        </div>

        {!unavailable ? (
          <div className="product-meta-row">
            <span className={currentSizeStock <= 5 ? "warning" : ""}>{stockLabel}</span>
          </div>
        ) : null}
      </div>

      {!unavailable ? (
        <div className="product-actions compact">
          <button className="action-button product-button" disabled={!affordable} onClick={onToggleExpand} type="button">
            Купить за {formatMerchiki(item.priceCoins)}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function CategoryTabs({
  categories,
  selectedCategory,
  onChange,
}: {
  categories: readonly ShopCategory[];
  selectedCategory: ShopCategory | null;
  onChange: (category: ShopCategory) => void;
}) {
  return (
    <div className="segmented shop-tabs">
      {categories.map((category) => (
        <button
          className={
            selectedCategory === category || (selectedCategory === null && category === "Все")
              ? "mode-button active"
              : "mode-button"
          }
          key={category}
          onClick={() => onChange(category)}
          type="button"
        >
          {category}
        </button>
      ))}
    </div>
  );
}

function SortDropdown({
  sortMode,
  sortModes,
  onChange,
}: {
  sortMode: ShopSortMode;
  sortModes: readonly ShopSortMode[];
  onChange: (sortMode: ShopSortMode) => void;
}) {
  return (
    <label aria-label="Сортировка товаров" className="field compact shop-sort">
      <select value={sortMode} onChange={(event) => onChange(event.target.value as ShopSortMode)}>
        {sortModes.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function SearchField({
  value,
  suggestions,
  onChange,
}: {
  value: string;
  suggestions: string[];
  onChange: (query: string) => void;
}) {
  return (
    <label className="shop-search" aria-label="Поиск товара">
      <span className="shop-search-icon">⌕</span>
      <input
        list="shop-search-suggestions"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Поиск товара"
        type="search"
        value={value}
      />
      <datalist id="shop-search-suggestions">
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </label>
  );
}

function ShopToolbar({
  categories,
  selectedCategory,
  sortMode,
  sortModes,
  searchQuery,
  searchSuggestions,
  onCategoryChange,
  onSortChange,
  onSearchChange,
}: Pick<
  ShopCatalogProps,
  | "categories"
  | "selectedCategory"
  | "sortMode"
  | "sortModes"
  | "searchQuery"
  | "searchSuggestions"
  | "onCategoryChange"
  | "onSortChange"
  | "onSearchChange"
>) {
  return (
    <div className="shop-toolbar">
      <div className="shop-toolbar-row">
        <div className="shop-toolbar-main">
          <CategoryTabs categories={categories} onChange={onCategoryChange} selectedCategory={selectedCategory} />
          <div className="shop-toolbar-subrow">
            <SortDropdown onChange={onSortChange} sortMode={sortMode} sortModes={sortModes} />
          </div>
        </div>
        <div className="shop-toolbar-side">
          <SearchField onChange={onSearchChange} suggestions={searchSuggestions} value={searchQuery} />
        </div>
      </div>
    </div>
  );
}

function ShopGrid({
  products,
  firedItems,
  availableCoins,
  loading,
  selectedSizes,
  quantities,
  expandedProductId,
  onToggleFire,
  onToggleExpand,
  onAddToCart,
  onSelectSize,
  onChangeQuantity,
}: Pick<
  ShopCatalogProps,
  | "products"
  | "firedItems"
  | "availableCoins"
  | "loading"
  | "selectedSizes"
  | "quantities"
  | "expandedProductId"
  | "onToggleFire"
  | "onToggleExpand"
  | "onAddToCart"
  | "onSelectSize"
  | "onChangeQuantity"
>) {
  if (loading) {
    return (
      <div className="catalog-grid shop-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="catalog-item product-card skeleton-card" key={`skeleton-${index}`}>
            <div className="skeleton-line badge" />
            <div className="skeleton-block image" />
            <div className="skeleton-line title" />
            <div className="skeleton-line price" />
            <div className="skeleton-line meta" />
            <div className="skeleton-line button" />
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="shop-empty-state">
        <strong>Ничего не найдено</strong>
        <p>Попробуйте изменить фильтры или сортировку.</p>
      </div>
    );
  }

  return (
    <div className="catalog-grid shop-grid">
      {products.map((item) => {
        const { currentSize, currentSizeStock, quantity } = resolveProductSelection(item, selectedSizes, quantities);

        return (
          <ProductCard
            key={item.id}
            availableCoins={availableCoins}
            currentSize={currentSize}
            currentSizeStock={currentSizeStock}
            expanded={expandedProductId === item.id}
            isFired={firedItems.includes(item.id)}
            item={item}
            onToggleExpand={() => onToggleExpand(item.id)}
            onToggleFire={() => onToggleFire(item.id)}
          />
        );
      })}

      {(() => {
        const expandedItem = products.find((item) => item.id === expandedProductId);
        if (!expandedItem) {
          return null;
        }

        const { currentSize, currentSizeStock, quantity } = resolveProductSelection(
          expandedItem,
          selectedSizes,
          quantities,
        );

        return (
          <ProductDetailsModal
            availableCoins={availableCoins}
            currentSize={currentSize}
            currentSizeStock={currentSizeStock}
            isFired={firedItems.includes(expandedItem.id)}
            item={expandedItem}
            quantity={quantity}
            onAddToCart={() => onAddToCart(expandedItem.id, quantity, currentSize)}
            onChangeQuantity={(value) => onChangeQuantity(expandedItem.id, value, currentSizeStock)}
            onClose={() => onToggleExpand(expandedItem.id)}
            onSelectSize={(size) => onSelectSize(expandedItem.id, size)}
            onToggleFire={() => onToggleFire(expandedItem.id)}
          />
        );
      })()}
    </div>
  );
}

export function ShopCatalog(props: ShopCatalogProps) {
  return (
    <section className="section-gap shop-panel">
      <ShopToolbar
        categories={props.categories}
        onCategoryChange={props.onCategoryChange}
        onSearchChange={props.onSearchChange}
        searchSuggestions={props.searchSuggestions}
        onSortChange={props.onSortChange}
        searchQuery={props.searchQuery}
        selectedCategory={props.selectedCategory}
        sortMode={props.sortMode}
        sortModes={props.sortModes}
      />

      <ShopGrid
        availableCoins={props.availableCoins}
        expandedProductId={props.expandedProductId}
        firedItems={props.firedItems}
        loading={props.loading}
        onAddToCart={props.onAddToCart}
        onChangeQuantity={props.onChangeQuantity}
        onSelectSize={props.onSelectSize}
        onToggleExpand={props.onToggleExpand}
        onToggleFire={props.onToggleFire}
        products={props.products}
        quantities={props.quantities}
        selectedSizes={props.selectedSizes}
      />
    </section>
  );
}
