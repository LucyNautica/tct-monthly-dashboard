# TCT dashboard: how the weekly update works

Every Monday at 11:00 UTC, a GitHub Action rebuilds `index.html` from the live sources and publishes it. Nobody touches the file by hand any more.

1. It reads the **KPI sheet**, the **2026 pricing sheet** and the **2027 pricing summary** from Google Sheets.
2. It reads all upcoming trips and bookings from the **WeTravel API**.
3. It runs safety checks. If any fail, nothing is published and a GitHub issue labelled `dashboard-alert` is opened. GitHub emails you about it.
4. It saves a snapshot of trip numbers, so next week's "Change in Last Week" table has something to compare against.
5. It commits the new `index.html`. Vercel deploys it, and the Action checks that the live site serves the new build.

You can also run it any time: GitHub → Actions → *Weekly dashboard update* → *Run workflow*.

## One-time setup

### 1. WeTravel API key (you)
1. In WeTravel, go to **Business Settings → Integrations → Partner API Integration** and click **Generate API Key**. It is shown once, so copy it straight away. The API is part of the WeTravel Pro plan.
2. In GitHub, open the repo, then **Settings → Secrets and variables → Actions → New repository secret**.
   Name: `WETRAVEL_API_KEY`. Value: the key.

### 2. Google Sheets access (you, about 10 minutes)
1. Go to https://console.cloud.google.com/, create a project (for example "tct-dashboard"), and enable the **Google Sheets API**.
2. Go to **IAM & Admin → Service Accounts → Create service account**. No roles are needed.
3. Open the new account, go to **Keys → Add key → JSON**, and download the file.
4. Share these three sheets with the service account's email (it ends in `iam.gserviceaccount.com`) as **Viewer**:
   - KPI sheet: https://docs.google.com/spreadsheets/d/16aw82rXVB1cGP1RUFew4CRduDjrSmnYhoHz1oaDsLyQ/
   - 2026 Tour Pricing: https://docs.google.com/spreadsheets/d/1ihALIUyhSFsMCfY2CYqLkb-nzRa3WUujDoJ0Z8PjeFE/
   - 2027 Tour Pricing: https://docs.google.com/spreadsheets/d/1DBoMvcKsmACfvYVTTowfrOPrSC4lzQVsl1ARRm0te_k/
5. Add a GitHub secret named `GOOGLE_SERVICE_ACCOUNT_JSON`. The value is the whole contents of the JSON file. Then delete the downloaded file.

### 3. First run
Run the workflow by hand once. The first live run should be checked against a manual WeTravel bookings export, because WeTravel's API was built from its documentation and has not yet been tested with real data.

### 4. Lock the data down (Lucy, then you)
Right now the repo is public, so every number on the dashboard can be read on GitHub without the password.

**Lucy:** in the repo, go to **Settings → General → Danger Zone → Change visibility → Private**. Then go to **Settings → Collaborators** and give Edgar the **Admin** role. (Or transfer the repo to Edgar via **Settings → Transfer**.) Making it private also switches off the GitHub Pages copy at lucynautica.github.io. Tom should use the Vercel link only.

**Lucy:** stop uploading `index.html` by hand. The Action now owns that file and overwrites it every week.

**You (once you have Vercel access):** the branch `server-password-gate` holds a real server-side password. To switch it on:
1. Pick a new password. The old one's hash has been public, so treat it as exposed.
2. Get its hash: `printf '%s' 'the-new-password' | shasum -a 256` (use the first 64 characters).
3. In Vercel, go to **Project → Settings → Environment Variables (Production)** and add:
   - `DASHBOARD_PASSWORD_HASH` = that hash
   - `SESSION_SECRET` = a long random string, from `openssl rand -hex 32`
4. Merge the branch into `main`. If the variables are missing, the site shows "locked", never the data.
5. Send Tom the new password separately from the link.

## Once a year (January)
The KPI sheet tabs are named by year ("2026 Actual" and so on). When the new year's tabs exist, update `config/dashboard.json`: `year`, the tab names, the pricing sheet ids, and the targets. If this hasn't been done, the January run fails with a clear "row/tab not found" alert. It won't publish wrong numbers.

## Where things live
| What | Where |
|---|---|
| Page layout and styling | `src/template.html` (Lucy's design, with numbers replaced by `{{TOKENS}}`) |
| Targets, excluded trips, trip display names, safety thresholds | `config/dashboard.json` |
| Source readers | `scripts/lib/sheets.mjs`, `scripts/lib/wetravel.mjs` |
| Number logic and rule-based notes | `scripts/lib/transform.mjs`, `scripts/lib/view.mjs` |
| Safety checks | `scripts/lib/checks.mjs` |
| Weekly trip snapshots | `data/snapshots/` |
| Last run report | `data/last-run.md` |

A trip only appears in the 2027 profitability table when the 2027 pricing **SUMMARY** tab has a row for it with a cost and a list price. That tab's own instructions explain how to add a tour. Trips without a row still count in the fill tile and the occupancy table, and each run's warnings list them.
