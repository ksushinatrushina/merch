export type Role = "ADMIN" | "EMPLOYEE" | "ORDER_MANAGER";

export type User = {
  id: string;
  name: string;
  email: string;
  username?: string;
  password?: string;
  role: Role;
  coinBalance: number;
  birthday?: string;
  employmentStartDate?: string;
  jobTitle?: string;
  team?: string;
  location?: string;
  tenure?: string;
};

export type MonthlyGiftQuota = {
  userId: string;
  year: number;
  month: number;
  sentCoins: number;
};

export type MerchSizeStock = {
  size: string;
  stock: number;
};

export type MerchItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  priceCoins: number;
  stock: number;
  isActive: boolean;
  publishedAt?: string;
  imageUrl?: string;
  imageFit?: "contain" | "cover";
  imagePositionX?: number;
  imagePositionY?: number;
  sizes?: MerchSizeStock[];
  category?: string;
  badge?: "Популярно" | "Новинка" | "Лимитировано";
  manualLimited?: boolean;
  popularity?: number;
  isNew?: boolean;
};

export type CartLine = {
  merchItemId: string;
  quantity: number;
};

export type OrderPreview = {
  totalCoins: number;
  lines: Array<{
    merchItemId: string;
    title: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
};
