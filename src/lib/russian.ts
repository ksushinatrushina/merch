export function pluralizeRu(count: number, one: string, few: string, many: string) {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;

  if (abs > 10 && abs < 20) {
    return many;
  }
  if (last === 1) {
    return one;
  }
  if (last >= 2 && last <= 4) {
    return few;
  }
  return many;
}

export function formatOrders(count: number) {
  return `${count} ${pluralizeRu(count, "заказ", "заказа", "заказов")}`;
}

export function formatEmployees(count: number) {
  return `${count} ${pluralizeRu(count, "сотрудник", "сотрудника", "сотрудников")}`;
}

export function formatMerchiki(count: number) {
  return `${count} ${pluralizeRu(count, "мерчик", "мерчика", "мерчиков")}`;
}
