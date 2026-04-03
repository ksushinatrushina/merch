import type { MerchItem, MonthlyGiftQuota, User } from "@/lib/domain/types";
import { MONTHLY_GIFT_LIMIT, remainingGiftCoins } from "@/lib/domain/coins";

const teams = [
  "Product",
  "Engineering",
  "Design",
  "Marketing",
  "Sales",
  "Finance",
  "Operations",
  "Support",
  "People",
  "Analytics",
] as const;

const jobTitles = [
  "Product Manager",
  "Frontend Engineer",
  "Backend Engineer",
  "UX Designer",
  "Marketing Manager",
  "Sales Manager",
  "Finance Analyst",
  "Operations Specialist",
  "HR Partner",
  "Data Analyst",
] as const;

const locations = [
  "Luxembourg office",
  "Berlin office",
  "Warsaw office",
  "Remote",
  "Paris office",
  "Prague office",
] as const;

const tenures = ["6 месяцев", "1 год", "1.5 года", "2 года", "3 года", "4 года"] as const;
const referenceEmploymentDate = new Date("2026-04-01T00:00:00.000Z");

function shiftDate(base: Date, months: number) {
  const next = new Date(base);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function employmentStartDateFromTenure(tenure: (typeof tenures)[number]) {
  switch (tenure) {
    case "6 месяцев":
      return formatIsoDate(shiftDate(referenceEmploymentDate, -6));
    case "1 год":
      return formatIsoDate(shiftDate(referenceEmploymentDate, -12));
    case "1.5 года":
      return formatIsoDate(shiftDate(referenceEmploymentDate, -18));
    case "2 года":
      return formatIsoDate(shiftDate(referenceEmploymentDate, -24));
    case "3 года":
      return formatIsoDate(shiftDate(referenceEmploymentDate, -36));
    case "4 года":
      return formatIsoDate(shiftDate(referenceEmploymentDate, -48));
  }
}

const generatedNames = [
  "Алексей Морозов",
  "Ольга Васильева",
  "Сергей Николаев",
  "Наталья Павлова",
  "Максим Федоров",
  "Татьяна Волкова",
  "Артем Семенов",
  "Юлия Крылова",
  "Кирилл Громов",
  "Виктория Лебедева",
  "Павел Зайцев",
  "Алина Воронова",
  "Михаил Белов",
  "Дарья Макарова",
  "Егор Кузьмин",
  "Ксения Полякова",
  "Никита Орехов",
  "Марина Сафронова",
  "Роман Анисимов",
  "Светлана Гусева",
  "Степан Рябов",
  "Екатерина Мельникова",
  "Владислав Алексеев",
  "Полина Щербакова",
  "Глеб Захаров",
  "Вероника Комарова",
  "Илья Тарасов",
  "София Ермакова",
  "Арсений Логинов",
  "Лилия Мартынова",
  "Тимур Осипов",
  "Анастасия Беляева",
  "Константин Дорофеев",
  "Валерия Миронова",
  "Даниил Прохоров",
  "Ева Жданова",
  "Федор Нестеров",
  "Инна Соболева",
  "Руслан Киселев",
  "Маргарита Авдеева",
  "Олег Терентьев",
  "Ника Фролова",
  "Ярослав Демидов",
  "Любовь Лапина",
  "Антон Чернов",
  "Кристина Ушакова",
  "Борис Чистяков",
  "Злата Самойлова",
  "Лев Игнатьев",
  "Алёна Абрамова",
  "Георгий Королев",
  "Милана Боброва",
  "Вадим Шаров",
  "Елизавета Власова",
  "Денис Титов",
  "Ульяна Егорова",
  "Петр Фомин",
  "Оксана Шмелева",
  "Игорь Гаврилов",
  "Таисия Котова",
  "Матвей Сурков",
  "Ирина Панина",
  "Юрий Харитонов",
  "Надежда Селиванова",
  "Всеволод Брагин",
  "Диана Коновалова",
  "Савелий Моисеев",
  "Карина Голубева",
  "Валентин Антонов",
  "Элина Филиппова",
  "Ростислав Данилов",
  "Майя Тихонова",
  "Платон Кудрявцев",
  "Олеся Никифорова",
  "Станислав Барсуков",
  "Ангелина Краснова",
  "Захар Пономарев",
  "Людмила Тимофеева",
  "Григорий Буров",
  "Арина Минаева",
  "Тихон Колесников",
  "Вера Мухина",
  "Марат Кондратьев",
  "Снежана Филатова",
  "Родион Ершов",
  "Яна Калашникова",
  "Викентий Блинов",
  "Эмма Рогова",
  "Адриан Суханов",
  "Лариса Дьякова",
  "Святослав Попов",
  "Нина Казакова",
  "Прохор Быков",
  "Адель Лазарева",
  "Игнат Шестаков",
  "Галина Соколова",
  "Мирон Виноградов",
  "Элина Серова",
] as const;

function translitName(name: string) {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ы: "y",
    э: "e",
    ю: "yu",
    я: "ya",
    ь: "",
    ъ: "",
  };

  return name
    .toLowerCase()
    .split("")
    .map((letter) => map[letter] ?? (/[a-z0-9]/.test(letter) ? letter : letter === " " ? "." : ""))
    .join("");
}

function buildGeneratedColleagues(): User[] {
  return generatedNames.map((name, index) => {
    const tenure = tenures[index % tenures.length];

    return {
      id: `u-g-${index + 1}`,
      name,
      email: `${translitName(name)}@company.test`,
      username: `user${index + 1}`,
      password: "demo123",
      role: "EMPLOYEE",
      coinBalance: 35 + ((index * 17) % 145),
      birthday: `${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
      employmentStartDate: employmentStartDateFromTenure(tenure),
      jobTitle: jobTitles[index % jobTitles.length],
      team: teams[index % teams.length],
      location: locations[index % locations.length],
      tenure,
    };
  });
}

export const currentUser: User = {
  id: "u-1",
  name: "Анна Смирнова",
  email: "anna@company.test",
  username: "employee",
  password: "employee123",
  role: "EMPLOYEE",
  coinBalance: 140,
  birthday: "03-12",
  employmentStartDate: "2024-04-01",
  jobTitle: "Product Manager",
  team: "Product",
  location: "Luxembourg office",
  tenure: "2 года",
};

export const adminUser: User = {
  id: "u-admin",
  name: "Мария Ковалева",
  email: "maria@company.test",
  username: "admin",
  password: "admin123",
  role: "ADMIN",
  coinBalance: 0,
  birthday: "07-19",
  employmentStartDate: "2022-04-01",
  jobTitle: "People Ops Admin",
  team: "People Ops",
  location: "HQ",
  tenure: "4 года",
};

export const orderManagerUser: User = {
  id: "u-order-manager",
  name: "Олег Логистик",
  email: "delivery@company.test",
  username: "orders",
  password: "orders123",
  role: "ORDER_MANAGER",
  coinBalance: 0,
  birthday: "02-11",
  employmentStartDate: "2025-01-10",
  jobTitle: "Менеджер доставки заказов",
  team: "Operations",
  location: "HQ",
  tenure: "1 год",
};

const baseColleagues: User[] = [
  {
    id: "u-2",
    name: "Иван Петров",
    email: "ivan@company.test",
    username: "ivan",
    password: "demo123",
    role: "EMPLOYEE",
    coinBalance: 85,
    birthday: "05-04",
    employmentStartDate: "2025-04-01",
    jobTitle: "Frontend Engineer",
    team: "Engineering",
    location: "Remote",
    tenure: "1 год",
  },
  {
    id: "u-3",
    name: "Елена Орлова",
    email: "elena@company.test",
    username: "elena",
    password: "demo123",
    role: "EMPLOYEE",
    coinBalance: 120,
    birthday: "09-17",
    employmentStartDate: "2023-04-01",
    jobTitle: "HR Partner",
    team: "People",
    location: "Warsaw office",
    tenure: "3 года",
  },
  {
    id: "u-4",
    name: "Дмитрий Соколов",
    email: "dmitry@company.test",
    username: "dmitry",
    password: "demo123",
    role: "EMPLOYEE",
    coinBalance: 60,
    birthday: "11-22",
    employmentStartDate: "2024-10-01",
    jobTitle: "Sales Lead",
    team: "Sales",
    location: "Berlin office",
    tenure: "1.5 года",
  },
];

const generatedColleagues = buildGeneratedColleagues();
const targetEmployeeCount = 100;
const generatedNeeded = Math.max(targetEmployeeCount - 1 - baseColleagues.length, 0);

export const colleagues: User[] = [
  ...baseColleagues,
  ...generatedColleagues.slice(0, generatedNeeded),
];

export const giftQuota: MonthlyGiftQuota = {
  userId: currentUser.id,
  year: 2026,
  month: 3,
  sentCoins: 10,
};

export const merchItems: MerchItem[] = [];

export const dashboardStats = {
  balance: currentUser.coinBalance,
  monthlyLimit: MONTHLY_GIFT_LIMIT,
  remainingToGift: remainingGiftCoins(giftQuota),
  availableItems: merchItems.filter((item) => item.isActive).length,
};
