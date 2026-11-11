import { createNotifier, readConfig } from "./discord.ts";
import type { Notify } from "./discord.ts";
import { request } from "./http.ts";
import { MENU_NAME, SOURCE_URL, formatMessage, parseMenus } from "./menu.ts";
import { isScheduleDue, isWeekend, localDate } from "./schedule.ts";

const now = new Date();
const today = localDate(now);
let notify: Notify | undefined;
try {
  if (!isScheduleDue(process.env.LUNCH_SCHEDULE, now)) {
    console.log(`WhatsForLunch: skipped, schedule '${process.env.LUNCH_SCHEDULE}' is not 07:30 in Copenhagen today`);
  } else if (isWeekend(today)) {
    console.log(`WhatsForLunch: skipped, ${today} is a weekend`);
  } else {
    const config = readConfig();
    notify = createNotifier(config.webhookUrl);
    const response = await request(SOURCE_URL, {}, "Meyers menu page");
    const message = formatMessage(today, parseMenus(response.body.toString("utf8"), MENU_NAME, config.language), {
      includeAll: config.includeAll,
      language: config.language,
    });
    console.log(message);
    await notify(message);
    console.log(`WhatsForLunch: sent menu for ${today}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Unexpected failure";
  console.error(`WhatsForLunch failed: ${message}`);
  if (notify) {
    try {
      await notify(`⚠️ WhatsForLunch could not fetch today's menu.\n${message}\n<${SOURCE_URL}>`.slice(0, 2000));
    } catch (notificationError) {
      console.error("Could not deliver the failure alert:",
        notificationError instanceof Error ? notificationError.message : "Unknown notification error");
    }
  }
  process.exitCode = 1;
}
