import HomePageClient from "@/components/home-page-client";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const modeParam = firstValue(resolvedSearchParams.mode);
  const tabParam = firstValue(resolvedSearchParams.tab);

  const initialMode = modeParam === "admin" ? "ADMIN" : "EMPLOYEE";
  const initialEmployeeTab =
    tabParam === "profile" ? "PROFILE" : tabParam === "history" ? "HISTORY" : "STORE";
  const initialAdminTab =
    tabParam === "catalog"
      ? "CATALOG"
      : tabParam === "orders"
        ? "ORDERS"
        : tabParam === "admins"
          ? "ADMINS"
          : "GRANTS";

  return (
    <HomePageClient
      initialAdminTab={initialAdminTab}
      initialEmployeeTab={initialEmployeeTab}
      initialMode={initialMode}
    />
  );
}
