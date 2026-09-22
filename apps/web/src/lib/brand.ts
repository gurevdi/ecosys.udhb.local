export const DEFAULT_BRAND_APP_NAME = "Экосистема";
export const DEFAULT_BRAND_ORG_NAME = "УДХБ";

export const BRAND_SETTING_ORG = "brand_org_name";

export function resolveBrandOrgName(settings?: Record<string, string | undefined | null>) {
  const v = settings?.[BRAND_SETTING_ORG]?.trim();
  return v || DEFAULT_BRAND_ORG_NAME;
}
