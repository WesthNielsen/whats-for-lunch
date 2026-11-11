import { request } from "./http.ts";
import { SOURCE_URL, formatMessage, parseMenus } from "./menu.ts";
import { localDate } from "./schedule.ts";

// Prints today's message without sending it to Discord.
const response = await request(SOURCE_URL, {}, "Meyers menu page");
console.log(formatMessage(localDate(new Date()), parseMenus(response.body.toString("utf8")), {
  includeAll: process.argv.includes("--all"),
}));
