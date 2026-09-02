import type { TFunction } from "i18next"
import type { MenuItem } from "@/stores/route"

export function getMenuLabel(item: Pick<MenuItem, "i18nKey" | "title">, t: TFunction): string {
  return item.i18nKey ? t(item.i18nKey, { defaultValue: item.title }) : item.title
}
