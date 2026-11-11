# WhatsForLunch

A GitHub Actions job that posts today's **Meyers "Det Velkendte - Portionspakket"**
lunch menu from <https://meyers.dk/ugens-menuer> to Discord every weekday at
**07:30 Copenhagen time**.

Halal, vegetarian and vegan hot dishes are hidden by default, matching the
original `WhatsForLunch.ps1` script.

## Schedule

GitHub cron runs in UTC, so [lunch.yml](./.github/workflows/lunch.yml) is
scheduled at both **05:30 UTC** and **06:30 UTC**, Monday–Friday. The job only
sends from the run that maps to 07:30 in `Europe/Copenhagen` that day (05:30 UTC
in summer/CEST, 06:30 UTC in winter/CET); the other run logs a skip. GitHub may
delay scheduled runs during busy periods, so the message can arrive a few
minutes late.

Weekends are skipped. If no menu is published for today (e.g. holidays), the
message says so. Manual runs from the **Actions** tab always send immediately.

## Setup

1. In Discord, create a channel webhook under **Edit Channel → Integrations →
   Webhooks**.
2. In this repository, open **Settings → Secrets and variables → Actions** and
   add the repository secret `DISCORD_WEBHOOK_URL` with the webhook URL.
3. Open **Actions → WhatsForLunch → Run workflow** to verify.

Optionally set `LUNCH_INCLUDE_ALL=true` in the workflow step's `env` to include
the halal, vegetarian and vegan hot dishes.

## Failure behavior

Requests time out after 30 seconds and retry up to three times on network
errors, HTTP 429 or 5xx. If the Meyers page changes format, the run fails
nonzero and attempts to post a failure alert to Discord. Discord mentions are
disabled and link embeds are suppressed.

## Local development

Requires [Bun](https://bun.sh/) 1.4.2 or newer.

```sh
bun install --frozen-lockfile
bun run check
bun run test
bun run preview        # print today's message without sending it
bun run preview --all  # include halal/vegetarian/vegan dishes
```

To send for real, copy [.env.example](./.env.example) to `.env`, set the webhook,
then `bun run build && bun run start`.
