# Expense dashboard (Flask + SQLite)

Works with the expense-tracker database schema (tables: users, options, expenses, incomes, investments).

    pip install -r requirements.txt
    python app.py

Open http://127.0.0.1:5000

## Load your database
Any one of these:
1. Click "Upload database" in the page and choose your .db file.
2. Copy your .db file into the `data/` folder.
3. Set the path: `DB_PATH=/path/to/your.db python app.py`

## What you can do
- Switch user and month (or "All time").
- Add expenses in the page. They are saved to the `expenses` table of your database. Keep a backup copy first.
- Change what counts as a fixed bill or a trip under "Settings". These are saved in `data/dashboard_config.json`, not in your database.

The app is meant for your own computer. It listens on 127.0.0.1 only and has no login, so do not expose it to a network.
Chart.js is bundled in `static/`, so the page works offline.
