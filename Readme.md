# Personal Finance Journal

A Flask web app built on the *Personal Finance Journal* PDF. For every expense you log its **category** (Needs/Wants), the **driving force** behind it and how it made you **feel**. The app works out each month's reflection for you, and adds a 3D journal cover and a savings jar.

## Quick start

```bash
pip install -r requirements.txt

# 1. Create your admin account (or sign up at /admin/signup, see below)
flask --app app create-admin

# 2. Optional: load the June 2024 entries from the PDF into your account
flask --app app seed-june <your-username>

# 3. Run the app
python app.py
```

Open http://127.0.0.1:5000

## Features

**3D design (every page)**
- A soft 3D background of drifting ₹ coins, notes and gems that follows your mouse (or phone tilt). It continues smoothly from page to page.
- Cards tilt toward your cursor with a light glare, and rise in with a 3D flip when a page opens.
- Moving between pages turns like a journal page (in Chrome and Edge).
- **Login and signup:** a floating 3D journal that opens when you log in. **Admin login and signup:** a vault whose door unlocks.
- **Year view:** a 3D bookshelf. Hover a month to pull it out, click to open its cover. On phones it is a swipeable carousel.
- **Month page:** Income, Spent, Invested and Left over as 3D bars that update live. Adding an entry sends a coin flying to its total.
- **Portfolio:** a 3D donut of where your money is invested (drag to spin) and 3D monthly bars.
- **Admin dashboard:** 3D bars for entries per day and sign-ups.
- Forms and tables stay flat so typing is quick. The 3D pauses when the tab is hidden, switches off for people who prefer reduced motion, and falls back to a normal layout if the browser can't show 3D.

**Journal (every user)**
- **3D cover:** a floating green journal with ₹ coins. "Open" swings the cover open and takes you into the journal.
- **Year view:** 12 month cards, each showing income, spent, invested, left over and the category split.
- **Month page:**
  - **Vision & Tasks:** the month's vision (autosaved) and a task checklist.
  - **Expenses:** quick-add with one-tap chips for Category, Driving Force, Emotion and Payment Method. Entries are grouped into Week 1–4 tables (days 1–7, 8–14, 15–21, 22–end) and can be edited or deleted.
  - **Income:** add money from any source (salary, freelance, interest, rent, gifts…). The tab shows a total for each source.
  - **Investments:** record money you **put into** or **took out of** an investment (SIP, FD, stocks, gold…).
    - Give each investment a name, for example "SBI FD". Using the same name again adds to that investment.
    - Typing a name you've used before picks its type automatically.
  - **Reflection:**
    - automatic tallies, including income by source and invested by type
    - charts by driving force and by emotion
    - a 3D savings jar: gold coins are money invested, silver coins are money left over
    - Achievements and Notes
  - The month's summary works out **Income − Spent − Invested = Left over**.
- **Portfolio:** every investment in one table with:
  - money put in, money taken out and money still invested
  - an optional **"Worth today"** value you type in, which shows your gain or loss
  - where your money is invested (by type)
  - a chart of the amount invested each month
- CSV downloads for each month's expenses, income and investments.
- Light and dark mode. Works on phones.

**Admin**
- **Dashboard:** app-wide totals only (users, active this month, entries per day, sign-ups, most-used values). Admins can't see individual users' expenses.
- **Dropdowns:** add, rename, reorder, hide/show and delete the values for Category, Driving Force, Emotion, Payment Method, Income Source and Investment Type.
  - Renaming updates past entries.
  - A value already used by expenses can only be hidden, not deleted.
- **Users:** activate or deactivate, make admin or user, and reset a password (a temporary password is shown once). You can't lock yourself out or remove the last admin.
- **Settings:** turn public sign-up on or off.

## Accounts

| URL | Who |
|---|---|
| `/signup` | Normal users. The admin can close it in Settings. |
| `/admin/signup` | Creates an **admin**. Not linked anywhere in the app. |
| `/login` | Log in with a username or email. Works for everyone, including admins. |
| `/admin/login` | Separate login for **admins only**. It opens straight into the admin panel. Not linked anywhere in the app. |

> **Before deploying:** `/admin/signup` lets anyone who finds the URL create an admin account. Set `ADMIN_SIGNUP_ENABLED=false` in production, and that URL then returns 404.

## Configuration

Copy `.env.example` to `.env`. Real environment variables override `.env`.

| Variable | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | auto-generated in `instance/secret_key` | Signs session cookies |
| `ADMIN_SIGNUP_ENABLED` | `true` | Turns `/admin/signup` on or off |
| `SESSION_COOKIE_SECURE` | `false` | Set to `true` behind HTTPS |
| `DATABASE` | `instance/journal.db` | SQLite file path |
| `FLASK_DEBUG` | `true` | Debug mode for `python app.py` |

For production, run it with a WSGI server, for example `waitress-serve --call app:create_app`, rather than `python app.py`.

## Project layout

```
app.py              app factory, CSRF, CLI commands (create-admin, seed-june)
auth.py             login / signup / admin signup / logout, access decorators
journal.py          cover, year + month pages, portfolio, JSON API, CSV exports
admin.py            dashboard, dropdown manager, users, settings
db.py               SQLite queries, validation, tallies
schema.sql          tables: users, options, expenses, incomes, investments, holding_values, months, settings
seed_june_2024.py   June 2024 entries transcribed from the PDF
templates/          Jinja pages (auth/, admin/, errors/)
static/css/         styles (green theme from the PDF, light + dark)
static/js/          3D: three-common.js, bg3d.js, cover3d.js, auth3d.js, bars3d.js, money3d.js,
                    donut3d.js, jar3d.js, admin3d.js; UI: ui3d.js, month.js, charts.js, admin.js
```

Three.js and Chart.js load from a CDN, so the browser needs internet access.

**Upgrading from the first version:** just restart the app. The new tables and dropdowns are created automatically, and any income you typed into the old single income box becomes an income entry with source "Other".
