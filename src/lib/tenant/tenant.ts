export function formatTenantName(tenant: string) {
  const names: Record<string, string> = {
    daitetsu: "大鉄",
    kintetsu: "近鉄",
    kosei: "湖西",
  };

  return names[tenant.toLowerCase()] ?? tenant;
}
