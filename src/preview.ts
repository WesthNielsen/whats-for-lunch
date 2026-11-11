import { request } from "./http.ts";
import { MENU_NAME, SOURCE_URL, formatMessage, parseMenus, readLanguage } from "./menu.ts";
import { localDate } from "./schedule.ts";

// Prints today's message without sending it to Discord.
const response = await request(SOURCE_URL, {}, "Meyers menu page");
const language = readLanguage(process.env.LUNCH_LANGUAGE);
console.log(formatMessage(
  localDate(new Date()),
  parseMenus(response.body.toString("utf8"), MENU_NAME, language),
  {
    includeAll: process.argv.includes("--all"),
    language,
  },
));
