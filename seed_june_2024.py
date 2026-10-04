"""June 2024 entries transcribed from 'Personal Finance Journal.pdf' (pages 59-61).

Two dates in the PDF were typos ("14/0624", "14/06/25"); both are 2024-06-14 here.
"""
import db

VISION = "system design improve\ncomplete system design"

# (date, item, amount, category, driving force, emotion, notes)
EXPENSES = [
    # Week 1 page
    ("2024-06-01", "petrol", 200, "Needs", "Needs", "Normal", ""),
    ("2024-06-01", "beers", 360, "Wants", "Happiness", "Happy", ""),
    ("2024-06-01", "shawarma", 180, "Wants", "External Pressure", "Sad", ""),
    ("2024-06-02", "ice creams", 160, "Wants", "Happiness", "Happy", "parents"),
    ("2024-06-02", "jaadi", 700, "Needs", "Needs", "Normal", ""),
    ("2024-06-06", "petrol", 172, "Needs", "Needs", "Normal", ""),
    ("2024-06-05", "vegetables", 110, "Needs", "Needs", "Normal", ""),
    ("2024-06-06", "daan", 56, "Wants", "FOMO", "Happy", ""),
    ("2024-06-05", "kalyan", 2500, "Wants", "FOMO", "Normal", ""),
    ("2024-06-05", "home", 11500, "Needs", "Needs", "Happy", ""),
    ("2024-06-05", "pant", 735, "Needs", "Needs", "Normal", ""),
    ("2024-06-12", "petrol", 170, "Needs", "Needs", "Normal", ""),
    ("2024-06-12", "snacks", 182, "Wants", "Happiness", "Happy", ""),
    ("2024-06-12", "lent", 2000, "Wants", "Needs", "Happy", ""),
    ("2024-06-14", "bulb", 500, "Needs", "Needs", "Normal", ""),
    ("2024-06-14", "dryer", 350, "Needs", "Needs", "Normal", ""),
    ("2024-06-14", "movie", 200, "Wants", "Happiness", "Normal", ""),
    ("2024-06-14", "milk", 60, "Needs", "Needs", "Normal", ""),
    ("2024-06-14", "tiffins", 70, "Needs", "Needs", "Normal", ""),
    ("2024-06-14", "filter", 800, "Needs", "Needs", "Normal", ""),
    # Week 2 page
    ("2024-06-14", "petrol", 170, "Needs", "Needs", "Normal", ""),
    ("2024-06-14", "tickets", 1600, "Wants", "Happiness", "Happy", ""),
    ("2024-06-14", "haircut", 200, "Needs", "Needs", "Happy", ""),
    ("2024-06-15", "drinks", 2800, "Wants", "Needs", "Happy", ""),
    ("2024-06-15", "lent", 2000, "Wants", "FOMO", "Normal", "given to naresh"),
    ("2024-06-16", "biryani", 280, "Wants", "Happiness", "Happy", ""),
]


def _option_id(kind, label):
    """Find an option by label, recreating it if the admin removed it."""
    for o in db.list_options(kind):
        if o["label"].lower() == label.lower():
            return o["id"]
    db.add_option(kind, label)
    return _option_id(kind, label)


def seed(user_id):
    """Replace the user's June 2024 expenses with the PDF entries. Returns (count, total)."""
    conn = db.get_db()
    start, end = db.month_bounds(2024, 6)
    conn.execute("DELETE FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?",
                 (user_id, start, end))
    conn.commit()
    for d, item, amount, cat, force, emotion, notes in EXPENSES:
        db.add_expense(user_id, {
            "date": d, "item": item, "amount": amount, "notes": notes,
            "category_id": _option_id("category", cat),
            "driving_force_id": _option_id("driving_force", force),
            "emotion_id": _option_id("emotion", emotion),
            "payment_method_id": None,
        })
    db.save_month(user_id, 2024, 6, {"vision": VISION})
    return len(EXPENSES), sum(e[2] for e in EXPENSES)
