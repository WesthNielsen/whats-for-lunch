import assert from "node:assert/strict";
import { test } from "node:test";
import { createNotifier, readConfig } from "../src/discord.ts";
import type { Fetch } from "../src/http.ts";
import { decodeHtml, formatHeading, formatMessage, parseMenus, readLanguage } from "../src/menu.ts";
import { isScheduleDue, isWeekend, localDate, utcOffsetHours } from "../src/schedule.ts";

function page(): string {
  const data: unknown[] = [];
  const add = (value: unknown) => data.push(value) - 1;
  const translations: Record<string, string> = {
    "Varm ret, kød": "Hot dish, meat",
    "Frikassé &amp; perleløg": "Fricassee &amp; pearl onions",
    "Varm ret, vegansk": "Hot dish, vegan",
    Linsegryde: "Lentil stew",
    "Dagens salat": "Salad of the day",
    Kålsalat: "Cabbage salad",
    "Grøn salat": "Green salad",
  };
  const text = (da: string) => add({ da: add(da), en: add(translations[da] ?? da) });
  const ref = (value: unknown) => add(value);
  data.push(["ShallowReactive", 1], null);
  const section = (label: string, dishes: string[]) => ref({
    names: text(label),
    menu_dishes: ref(dishes.map((dish) => ref({ names: text(dish) }))),
  });
  const menu = (name: string, date: string, sections: number[]) => ref({
    names: text(name), date: add(date), menu_sections: ref(sections),
  });
  const ours = menu("Det Velkendte - Portionspakket", "2026-11-11", [
    section("Varm ret, kød", ["Frikassé &amp; perleløg"]),
    section("Varm ret, vegansk", ["Linsegryde"]),
    section("Dagens salat", ["Kålsalat", "Grøn salat"]),
  ]);
  const other = menu("Det velkendte", "2026-11-11", [section("Varm ret, kød", ["Wrong"])]);
  const blocks = ref({
    "foodop-menu-block-Almanak": -1,
    "foodop-menu-block-Det velkendte - Portionspakket": ref([ref({ menus: ref([other, ours]) })]),
  });
  data[1] = { data: add(["ShallowReactive", blocks]) };
  return `<html><script type="application/json" id="__NUXT_DATA__">${JSON.stringify(data)}</script></html>`;
}

test("parses the Nuxt payload and matches menu names case-insensitively", () => {
  assert.deepEqual(parseMenus(page()), [{
    date: "2026-11-11",
    sections: [
      { label: "Varm ret, kød", dishes: ["Frikassé & perleløg"] },
      { label: "Varm ret, vegansk", dishes: ["Linsegryde"] },
      { label: "Dagens salat", dishes: ["Kålsalat", "Grøn salat"] },
    ],
  }]);
});

test("reports format changes and missing menus", () => {
  assert.throws(() => parseMenus("<html></html>"), /no longer contains/u);
  assert.throws(() => parseMenus(page(), "Den Grønne"), /was not found/u);
  assert.throws(() => parseMenus(page(), "Almanak"), /was not found/u);
  assert.throws(() => parseMenus('<script id="__NUXT_DATA__">[1]</script>'), /format may have changed/u);
});

test("formats today's menu and hides excluded sections by default", () => {
  const menus = parseMenus(page());
  const message = formatMessage("2026-11-11", menus);
  assert.match(message, /Onsdag 11\. November 2026/u);
  assert.match(message, /\*\*Varm ret, kød\*\*\n- Frikassé & perleløg/u);
  assert.match(message, /- Kålsalat\n- Grøn salat/u);
  assert.doesNotMatch(message, /vegansk/u);
  assert.match(formatMessage("2026-11-11", menus, { includeAll: true }), /Linsegryde/u);
  assert.match(formatMessage("2026-11-12", menus), /No menu published for 2026-11-12/u);
});

test("parses and formats Meyers' English menu text", () => {
  const menus = parseMenus(page(), undefined, "en");
  assert.deepEqual(menus[0]?.sections[0], {
    label: "Hot dish, meat",
    dishes: ["Fricassee & pearl onions"],
  });
  const message = formatMessage("2026-11-11", menus, { language: "en" });
  assert.match(message, /Wednesday 11 November 2026/u);
  assert.match(message, /\*\*Hot dish, meat\*\*\n- Fricassee & pearl onions/u);
  assert.match(message, /\*\*Salad of the day\*\*\n- Cabbage salad\n- Green salad/u);
  assert.doesNotMatch(message, /Lentil stew|Hot dish, vegan/u);
  assert.match(formatMessage("2026-11-11", menus, { includeAll: true, language: "en" }), /Lentil stew/u);
});

test("decodes HTML entities and formats Danish headings", () => {
  assert.equal(decodeHtml("&quot;a&quot; &#230; &#xF8; &unknown;"), "\"a\" æ ø &unknown;");
  assert.equal(formatHeading("2026-03-02"), "Mandag 02. Marts 2026");
  assert.equal(formatHeading("2026-03-02", "en"), "Monday 02 March 2026");
  assert.equal(readLanguage(undefined), "da");
  assert.equal(readLanguage(" en "), "en");
  assert.throws(() => readLanguage("fr"), /LUNCH_LANGUAGE/u);
});

test("only the cron matching 07:30 Copenhagen time is due", () => {
  const winter = new Date("2026-11-11T06:30:00Z");
  const summer = new Date("2026-06-10T05:30:00Z");
  assert.equal(utcOffsetHours(winter), 1);
  assert.equal(utcOffsetHours(summer), 2);
  assert.equal(isScheduleDue("30 6 * * 1-5", winter), true);
  assert.equal(isScheduleDue("30 5 * * 1-5", winter), false);
  assert.equal(isScheduleDue("30 5 * * 1-5", summer), true);
  assert.equal(isScheduleDue("30 6 * * 1-5", summer), false);
  assert.equal(isScheduleDue(undefined, winter), true);
  assert.equal(isScheduleDue("", winter), true);
});

test("uses the Copenhagen date and detects weekends", () => {
  assert.equal(localDate(new Date("2026-11-10T23:30:00Z")), "2026-11-11");
  assert.equal(isWeekend("2026-11-14"), true);
  assert.equal(isWeekend("2026-11-15"), true);
  assert.equal(isWeekend("2026-11-16"), false);
});

test("validates the webhook and reads options", () => {
  assert.throws(() => readConfig({}), /Set DISCORD/u);
  assert.throws(() => readConfig({ DISCORD_WEBHOOK_URL: "https://example.com/api/webhooks/1/x" }), /HTTPS Discord/u);
  const webhook = "https://discord.com/api/webhooks/123/token";
  assert.deepEqual(readConfig({ DISCORD_WEBHOOK_URL: webhook }), {
    webhookUrl: webhook, includeAll: false, language: "da",
  });
  assert.equal(readConfig({ DISCORD_WEBHOOK_URL: webhook, LUNCH_LANGUAGE: "en" }).language, "en");
  assert.equal(readConfig({ DISCORD_WEBHOOK_URL: webhook, LUNCH_INCLUDE_ALL: "true" }).includeAll, true);
});

test("posts to Discord without mentions and retries rate limits", async () => {
  const calls: { url: string; body: unknown }[] = [];
  const statuses = [429, 200];
  const fetcher: Fetch = async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response("{}", { status: statuses.shift() ?? 200, headers: { "retry-after": "0" } });
  };
  await createNotifier("https://discord.com/api/webhooks/123/token", fetcher, async () => {})("Menu");
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, "https://discord.com/api/webhooks/123/token?wait=true");
  assert.deepEqual(calls[0]?.body, { content: "Menu", allowed_mentions: { parse: [] }, flags: 4 });
  await assert.rejects(createNotifier("https://discord.com/api/webhooks/123/token", fetcher)(""), /between 1 and 2000/u);
});
