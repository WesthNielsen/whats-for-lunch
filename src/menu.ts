export const SOURCE_URL = "https://meyers.dk/ugens-menuer";
export const MENU_NAME = "Det Velkendte - Portionspakket";
export const EXCLUDED_SECTIONS = ["Varm ret, halal", "Varm ret, vegetarisk", "Varm ret, vegansk"];

export interface MenuSection {
  label: string;
  dishes: string[];
}

export interface DailyMenu {
  date: string;
  sections: MenuSection[];
}

const FORMAT_CHANGED = "The Meyers data format may have changed. The parser needs updating.";

const sameText = (a: string, b: string) => a.localeCompare(b, "da", { sensitivity: "accent" }) === 0;

export function decodeHtml(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: "\u00a0" };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (entity, code: string) => {
    if (code.startsWith("#")) {
      const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

// Nuxt stores JSON values in a shared table; object properties and array entries are references.
export function parseMenus(html: string, menuName: string = MENU_NAME): DailyMenu[] {
  const payload = /<script\b[^>]*\bid=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/u.exec(html);
  if (!payload?.[1]) {
    throw new Error("The Meyers page no longer contains the expected menu data. The parser needs updating.");
  }
  let data: unknown;
  try {
    data = JSON.parse(payload[1]);
  } catch {
    throw new Error("The Meyers menu data is not valid JSON.");
  }
  if (!Array.isArray(data)) throw new Error(FORMAT_CHANGED);
  const table: unknown[] = data;

  const at = (reference: unknown): unknown => {
    if (typeof reference !== "number" || !Number.isInteger(reference) || reference < 0 || reference >= table.length) {
      throw new Error(FORMAT_CHANGED);
    }
    return table[reference];
  };
  const array = (reference: unknown): unknown[] => {
    const value = at(reference);
    if (!Array.isArray(value)) throw new Error(FORMAT_CHANGED);
    return value;
  };
  const object = (reference: unknown): Record<string, unknown> => {
    const value = at(reference);
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(FORMAT_CHANGED);
    return value as Record<string, unknown>;
  };
  const danish = (reference: unknown): string => {
    const value = at(object(reference).da);
    if (typeof value !== "string") throw new Error("A menu item is missing its Danish text. " + FORMAT_CHANGED);
    return decodeHtml(value);
  };

  const root = object(array(0)[1]);
  const blocks = object(array(root.data)[1]);
  // Block keys differ in casing from the displayed menu name.
  const blockKey = Object.keys(blocks).find((key) => sameText(key, `foodop-menu-block-${menuName}`));
  const blockReference = blockKey === undefined ? undefined : blocks[blockKey];
  if (typeof blockReference !== "number" || blockReference < 0) {
    throw new Error(`The '${menuName}' menu was not found on the Meyers page.`);
  }

  const menus: DailyMenu[] = [];
  for (const supplierReference of array(blockReference)) {
    for (const menuReference of array(object(supplierReference).menus)) {
      const menu = object(menuReference);
      // The block also includes other lunch concepts; match the menu's own name.
      if (!sameText(danish(menu.names), menuName)) continue;
      const date = at(menu.date);
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new Error(FORMAT_CHANGED);
      const sectionReferences = array(menu.menu_sections);
      if (sectionReferences.length === 0) throw new Error(`The menu for ${date} has no sections.`);
      const sections = sectionReferences.map((sectionReference) => {
        const section = object(sectionReference);
        const label = danish(section.names);
        const dishes = array(section.menu_dishes).map((dish) => danish(object(dish).names));
        if (dishes.length === 0) throw new Error(`The '${label}' section has no dishes.`);
        return { label, dishes };
      });
      menus.push({ date, sections });
    }
  }
  if (menus.length === 0) throw new Error(`No published menus were found for '${menuName}'.`);
  return menus;
}

export function formatHeading(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 12));
  const parts = new Intl.DateTimeFormat("da-DK", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase("da") + text.slice(1);
  return `${capitalize(part("weekday"))} ${part("day")}. ${capitalize(part("month"))} ${part("year")}`;
}

export function formatMessage(
  date: string,
  menus: DailyMenu[],
  options: { includeAll?: boolean; menuName?: string } = {},
): string {
  const lines = [`🍽️ **${options.menuName ?? MENU_NAME} — ${formatHeading(date)}**`];
  const daily = menus.filter((menu) => menu.date === date);
  if (daily.length === 0) {
    lines.push("", `No menu published for ${date}.`);
  }
  for (const menu of daily) {
    for (const section of menu.sections) {
      if (!options.includeAll && EXCLUDED_SECTIONS.some((label) => sameText(label, section.label))) continue;
      lines.push("", `**${section.label}**`, ...section.dishes.map((dish) => `- ${dish}`));
    }
  }
  lines.push("", `<${SOURCE_URL}>`);
  return lines.join("\n");
}
