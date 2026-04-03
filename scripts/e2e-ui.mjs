import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:3000";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login(page, username, password) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.getByLabel("Логин").fill(username);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForLoadState("networkidle");
}

async function runEmployeeFlow(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await login(page, "employee", "employee123");

  await page.waitForSelector(".employee-tab.active");
  const activeTab = (await page.locator(".employee-tab.active").first().textContent())?.trim();
  assert(activeTab === "Магазин", `Ожидалась стартовая вкладка "Магазин", получено: ${activeTab}`);

  await page.getByRole("link", { name: "Профиль" }).click();
  await page.waitForURL(/tab=profile/);
  await page.locator(".profile-card-v2").getByText("Анна Смирнова", { exact: false }).waitFor();

  await context.close();
  return "employee: ok";
}

async function runAdminFlow(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await login(page, "admin", "admin123");

  await page.getByRole("link", { name: "Админ" }).click();
  await page.waitForURL(/mode=admin&tab=grants/);
  await page.getByRole("heading", { name: "Начислить мерчики" }).waitFor();

  const employeeSearch = page.getByPlaceholder("Поиск по имени, фамилии или email").first();
  await employeeSearch.fill("Мария");
  await wait(400);
  await page.locator(".employee-picker-row", { hasText: "Мария Ковалева" }).first().click();

  await page.getByLabel("Количество мерчиков").fill("600");
  await page.getByLabel("Причина начисления").fill("UI E2E");
  await page.getByRole("button", { name: "Начислить 600 мерчиков" }).click();

  const confirmModal = page.locator(".confirm-modal");
  if (await confirmModal.isVisible().catch(() => false)) {
    await confirmModal.getByRole("button", { name: /Продолжить|Начислить|Подтвердить/ }).click();
  }

  await page.getByText("Мерчики начислены", { exact: false }).waitFor({ timeout: 10000 });

  await page.getByRole("link", { name: "Магазин мерча" }).click();
  await page.waitForURL(/mode=admin&tab=catalog/);
  await page.getByRole("heading", { name: "Каталог" }).waitFor();
  await page.getByRole("button", { name: /\+ Добавить товар/ }).click();
  await page.getByRole("heading", { name: "Создать товар" }).waitFor();
  await page.getByLabel("Название").fill("E2E товар");
  await page.getByLabel("Описание").fill("Товар для E2E-проверки.");
  await page.getByLabel("Цена (мерчики)").fill("120");
  await page.getByPlaceholder("Размер").first().fill("OS");
  await page.getByPlaceholder("Остаток").first().fill("5");
  await page.getByRole("button", { name: "Сохранить товар" }).click();
  await page.getByText("Товар сохранён", { exact: false }).waitFor({ timeout: 10000 });

  await page.getByRole("button", { name: "Сотрудник" }).click();
  await page.getByRole("link", { name: "Магазин" }).click();
  await page.waitForURL(/mode=employee&tab=store/);

  const buyButton = page.getByRole("button", { name: /Купить за/i }).first();
  await buyButton.click();
  const productModal = page.locator(".product-details-modal");
  await productModal.waitFor({ timeout: 10000 });
  await productModal.locator('button:has-text("В корзину")').click();
  await page.getByText("Товар добавлен в корзину", { exact: false }).waitFor({ timeout: 10000 });

  await page.getByText("Корзина", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Заберу в московском офисе" }).click();
  const checkoutButton = page.getByRole("button", { name: /Оформить за/i });
  const checkoutLabel = await checkoutButton.textContent();
  assert(Boolean(checkoutLabel?.trim()), "Не удалось определить сумму оформления в корзине.");
  await checkoutButton.click();
  await page.getByText("Заказ оформлен", { exact: false }).waitFor({ timeout: 10000 });

  await page.getByRole("link", { name: "Админ" }).click();
  await page.waitForURL(/mode=admin&tab=grants/);
  await page.getByRole("link", { name: "Заказы" }).click();
  await page.waitForURL(/mode=admin&tab=orders/);
  await page.getByRole("heading", { name: "Управление заказами" }).waitFor();

  const firstAction = page.getByRole("button", { name: "Подтвердить" }).first();
  await firstAction.click();
  await page.getByRole("button", { name: "Отправить" }).first().waitFor({ timeout: 10000 });

  await context.close();
  return "admin: ok";
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const api = await browser.newContext();
  const resetResponse = await api.request.post(`${BASE_URL}/api/reset`);
  assert(resetResponse.ok(), "Не удалось сбросить состояние через /api/reset.");
  await api.close();

  const results = [];

  try {
    results.push(await runEmployeeFlow(browser));
    results.push(await runAdminFlow(browser));
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
