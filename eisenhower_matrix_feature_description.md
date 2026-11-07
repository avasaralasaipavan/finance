# Feature Specification: Eisenhower Time Matrix & Productivity Tracker

## 1. Overview
This module integrates an **Eisenhower Time Matrix & Productivity Audit** into an existing Flask personal finance application. It enables users to log hourly activities across 20 waking hours per day, classify tasks by **Urgency** and **Importance**, record daily emotional satisfaction, and observe patterns across 10-day tracking cycles.

---

## 2. Matrix Classification Rules

Every logged hour is classified into one of four standard Eisenhower Quadrants based on user selection:

| Urgent ($Y/N$) | Important ($Y/N$) | Code | Quadrant Category | Action Strategy |
| :---: | :---: | :---: | :---: | :---: |
| **Y** | **Y** | `YY` | **Do First** | Crises, pressing problems, deadline-driven tasks |
| **N** | **Y** | `NY` | **Schedule / Plan** | Long-term planning, skill building, health, strategic finance |
| **Y** | **N** | `YN` | **Delegate / Limit** | Interruptions, non-essential meetings, urgent requests |
| **N** | **N** | `NN` | **Eliminate** | Passive consumption, trivial activities, time-wasters |

---

## 3. Database Schema Design (SQLAlchemy)

### 3.1. `DailyLog` Model
Represents a single day's overall log and satisfaction entry.

* **`id`**: `INTEGER`, Primary Key
* **`user_id`**: `INTEGER`, Foreign Key (`User.id`)
* **`date`**: `DATE`, Unique per user per day
* **`day_number`**: `INTEGER` (Tracks cycle position, e.g., Day 1 to Day 10)
* **`is_happy`**: `BOOLEAN` (User's end-of-day satisfaction toggle: `True` for Yes, `False` for No)
* **`reflection_notes`**: `TEXT` (Narrative response to *"Why do you feel this way?"*)
* **`created_at`**: `DATETIME`

### 3.2. `HourlyTask` Model
Represents an individual hourly slot within a `DailyLog`.

* **`id`**: `INTEGER`, Primary Key
* **`daily_log_id`**: `INTEGER`, Foreign Key (`DailyLog.id`)
* **`time_slot`**: `VARCHAR(20)` (e.g., `4am-5am`, `5am-6am`, ..., `11pm-12am` — 20 slots per day)
* **`task_description`**: `TEXT` (Primary activity carried out during the hour)
* **`is_urgent`**: `BOOLEAN` (`True` for `Y`, `False` for `N`)
* **`is_important`**: `BOOLEAN` (`True` for `Y`, `False` for `N`)
* **`classification`**: `VARCHAR(2)` (Computed property/string: `YY`, `NY`, `YN`, or `NN`)

---

## 4. API & Route Requirements

### 4.1. Logging Endpoint
* **Route**: `GET /time-tracker/log/<date>` & `POST /time-tracker/log/<date>`
* **Functionality**:
  * `GET`: Render the 20-hour logging grid pre-populated with existing database records for the target date.
  * `POST`: Upsert the hourly entries, update urgency/importance flags, save daily happiness flag, and store optional reflection notes.

### 4.2. Dashboard & Analytics Endpoint
* **Route**: `GET /time-tracker/dashboard`
* **Functionality**:
  * Calculates real-time percentage allocation for all four matrix quadrants over a 10-day cycle:
    $$\text{Quadrant \%} = \left( \frac{\text{Total Hours in Quadrant}}{\text{Total Logged Hours}} \right) \times 100$$
  * Displays correlation between high `NY` (Important & Not Urgent) time investment and user financial/wellness goals.

---

## 5. Front-End Interface Components

1. **20-Hour Daily Logging Table**:
   * Rows corresponding to hourly slots (`4:00 AM` through `12:00 AM`).
   * Form inputs: `Task Description`, `Urgent Toggle (Y/N)`, `Important Toggle (Y/N)`, and a dynamic `Quadrant Tag` pill badge.
2. **End-of-Day Reflection Card**:
   * Interactive *Happy/Satisfied with today?* selector (Yes/No).
   * Free-text text area for daily commentary.
3. **2x2 Eisenhower Summary Matrix**:
   * Live visual display showing hours and percentage breakdown across `YY`, `NY`, `YN`, and `NN`.