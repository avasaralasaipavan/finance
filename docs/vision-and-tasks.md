# Vision & Tasks — concept and proposal

Status: **partly built.** Ongoing habits, the Reflection "Vision vs reality" card, task progress and
in-app guidance are done (see §7). Number targets, carry-over and the Year view are still open.

---

## 1. The concept

Each month follows a **plan → act → review** loop:

| Part | When | What it is | Test |
|---|---|---|---|
| **Vision** | Once, on day 1 of the month | The **result** you want by month end | Can you check it yes/no on the 30th? |
| **Tasks** | Listed on day 1, added any time | One-time **actions** that make the vision happen | Can you do it once and tick it? |
| **Reflection** | Last day of the month | Did the ticks add up to the vision? | — |

### Habits vs tasks

Daily habits ("bring snacks from home") never finish, so they can't be ticked.

- **Tasks** = the one-time *setup steps* that make a habit easy (buy a tiffin, agree a rule with family).
- **The habit itself** is tracked through **expenses** — every time you eat out, you log it, and
  Reflection shows the count and amount against the target.

### Writing a good vision

- Describe the outcome, not the action.
- Add a number so it can be checked: "eat out very less" → "eat out at most 4 times (under ₹2,000)".

---

## 2. Worked example

**Vision**
> Waste no food at home, and eat out at most 4 times this month (under ₹2,000).

**Tasks** (each done once, then ticked)
- ☐ Talk with family once and agree: tell each other before cooking who's eating at home
- ☐ Buy a tiffin and snack box
- ☐ Stock snacks for the week every Sunday (or on the 1st and 15th)
- ☐ Plan the week's meals on Sunday so nothing is left over

**During the month** — tick tasks as they're done; log every eat-out as an expense.

**Month-end Reflection** (what it *should* show)
- Vision: eat out ≤ 4 times, under ₹2,000
- Actual: ate out 6 times, ₹2,700 ❌ — close
- Tasks: 3 of 4 done
- Note: "Weekends were the problem — plan Saturday lunch next month."

**Next month's vision** carries the lesson forward.

---

## 3. What the app does today

- **Vision & Tasks tab** — vision is a free-text box (autosaved); tasks are a checklist.
  Ticking a task already saves and strikes it through
  ([static/js/month.js](../static/js/month.js) `renderTasks`), but the checkbox is small and easy to miss.
- **Reflection tab** — only money: savings jar, driving-force and emotion charts, tallies,
  Achievements and Notes ([templates/month.html](../templates/month.html)).
  **The vision and task results never appear here.**
- **Year view** — no task progress.
- **Vision has no numbers**, so the app can't tell whether it was achieved.

The core gap: on the last day, Reflection can't answer *"did I achieve my vision?"*

---

## 4. Options

1. **"Vision vs reality" card at the top of Reflection** *(main fix)*
   - Repeats the vision text.
   - Task progress: "3 of 4 done · 75%" (ring or bar).
   - Completed vs not-completed lists; optionally tick from here too.

2. **Measurable targets** — optional numbers alongside the vision, checked automatically
   against real entries, e.g.:
   - Savings goal (₹)
   - Total spending limit (₹)
   - Investment goal (₹)
   - Limit for one category / tag, e.g. "Eating out ≤ ₹2,000" or "≤ 4 times"

   Reflection shows: "Eating out: 6 times, ₹2,700 of ₹2,000 limit ❌".

3. **Carry over unfinished tasks** — button at month end: "Move 1 unfinished task to December".

4. **Task progress on the Year view** — each month card shows "3/4 tasks".

5. **Make ticking obvious** — bigger checkboxes, progress bar above the list, small celebration
   when all are done.

6. **In-app guidance** — short helper text / placeholders on the Vision & Tasks tab explaining
   "Vision = result by month end, Tasks = one-time steps", with an example.

---

## 5. Open questions

- Option 1 alone, or 1 + 2 (targets)? Targets are more work but tie the vision to real data.
- Should Reflection allow ticking tasks, or only display results?
- Carry-over of unfinished tasks: automatic, a button, or not at all?
- **How does the app know an expense is "eating out"?** Today expenses only have
  Category (Needs / Wants), Driving Force, Emotion and Payment Method. A target like
  "eating out ≤ ₹2,000" needs one of:
  - a new admin-managed Category value such as "Eating out", or
  - a new "Tag" dropdown on expenses, or
  - matching on the expense name (fragile).
- Targets measured in **amount**, **count**, or both?

## 6. Suggested starting point

**1 + 2 + 5 + 6** — Reflection answers "did I achieve my vision?" with real numbers, ticking is
obvious, and the tab explains itself. Options 3 and 4 can follow later.

---

## 7. Built so far (2026-10-10)

- **Ongoing habits** (Vision & Tasks tab) — a daily vision such as "Didn't eat out today", with an
  optional "why". Each habit has a month calendar: tap a day once = ✓ kept, twice = ✕ missed,
  three times = clear. The current month also has quick "Today: ✓ Kept / ✕ Missed" buttons.
  - Starts from the 1st of the month it was added in (so earlier days can be filled in) and shows
    in every later month until **Stopped**; stopped habits can be **Resumed**. Delete removes its history.
  - Unmarked days are not counted as misses. Score = kept ÷ marked days.
  - Shows current streak (current month) and best streak.
  - Tables: `habits`, `habit_checks`.
- **Vision vs reality** card at the top of Reflection — the month's vision, task progress
  (tasks can be ticked here too), and each habit's score, best streak, and the weekday with the
  most misses (when one stands out).
- **Tasks** — progress bar ("2 of 3 done"), bigger checkboxes.
- **Guidance** — helper text and examples on the Vision, Tasks and Habits boxes.

Still open: options 2 (number targets), 3 (carry over tasks), 4 (Year view), and the
"eating out" tagging question.
