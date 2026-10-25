# Ownform: XP Rules (Gym module)

**Status:** decided by the project owner, v1.6 (one open point in section 7, which does not block `rules.js`).
**Date:** 2026-10-22
**Scope:** MVP, Gym module. This document is the single reference for `rules.js` and its tests.
**Based on:** the project document (sections 5.3 and 5.4) and the database design (open questions O1 to O9, now answered here).

The values (XP amounts, caps, limits) are a starting point. They live in the configuration file, not in the logic, so they can be balanced after using the app.

---

## 1. How XP is earned

| Event | XP | Notes |
|---|---|---|
| Completed workout (minimum of valid sets: 1 for strength, 3 for hypertrophy) | +20 | Base XP. Action type `workout_completed` |
| Each valid set | +2 | A valid set is a working set with reps inside the range of the user's training focus (section 1.1). Counts up to 8 sets per exercise for strength, and up to 20 sets per workout in total for both focuses. Part of the `workout_completed` action |
| Personal record in an exercise | +25 | At most 1 per exercise per workout, at most 3 per workout. Action type `personal_record` |
| Weekly streak: 3 or more sessions in the week | +40 | Once per week. Action type `weekly_streak` |
| Five-day week: training on 5 different days in the week | +15 | Once per week. Stacks with the weekly streak. Action type `weekly_five_days` |

A workout that earns no XP (for example, fewer valid sets than the minimum, the daily cap already reached, or saved outside the 4-hour logging window) is still saved, but it creates no action.

### 1.1 Training focus

At the start, the user chooses a training focus: **strength** or **hypertrophy**. The user can change it later. The focus decides how sets are counted:

| | Strength | Hypertrophy |
|---|---|---|
| Valid reps | 1 to 3 | 6 to 12 |
| Warm-up sets | Yes. They are marked as warm-up and earn no XP | No separate warm-up phase. Every set is a working set |
| Sets that count for XP | Up to 8 working sets per exercise. The user chooses how many (1 to 8) | No limit per exercise |
| Minimum valid sets for the base XP | 1 | 3 |

All the numbers are configurable. For both focuses, at most 20 sets count per workout in total.

- Inside the valid range, a set gives the same +2 whatever the number of reps.
- Working sets outside the range are saved but earn no XP. For example, sets of 4 or 5 reps earn nothing for either focus.
- Warm-up sets are saved and flagged as warm-up. They do not count toward the minimum, toward the limit of sets, or toward personal records (section 2).
- Changing the focus affects only future workouts. XP already logged stays as it is.
- The focus is stored per user, in the gym module (the `gym_profiles` table).

---

## 2. Personal records

An exercise earns a record in a workout when, compared with the history **before** that workout, at least one of these is true:

- **Weight record:** a set has a weight strictly greater than the user's previous maximum weight for that exercise.
- **Repetition record:** a set has strictly more repetitions than the user's previous best at **exactly the same weight** for that exercise.

Rules:

- **Baseline:** the first time an exercise is logged is only a baseline, not a record. Likewise, the first time a weight is used for an exercise gives no repetition record.
- **History** means the working sets of the user's previously saved workouts for that exercise (warm-up sets excluded).
- An exercise earns **one** +25 per workout, even if it breaks both kinds of record.
- At most 3 records are rewarded per workout.
- Ties are not records (same weight and same reps as your best).
- Every saved working set is considered for records, whatever its number of reps. Warm-up sets are excluded, both from the history and from record detection. The valid-set ranges (section 1.1) only decide the +2 per set and the minimum of sets.
- Weight `0` means no added weight (bodyweight). Weighted calisthenics, such as weighted pull-ups, store the real added weight.
- `actions.reference_id` of a `personal_record` points to the set that broke the record.

Examples, with a bench press history of 60 kg x 10, 65 kg x 8 and 70 kg x 6:

| Today's set | Result | Reason |
|---|---|---|
| 70 kg x 7 | Record | More reps at 70 kg |
| 72.5 kg x 3 | Record | Heavier than ever |
| 70 kg x 6 | No record | Ties the best |
| 62.5 kg x 4 | No record | First time at that weight and not the heaviest |

Bodyweight example: pull-ups with no added weight, first time 8 reps (baseline). Next time 9 reps is a record. Later, 5 kg x 5 is a weight record, because 5 is greater than 0.

---

## 3. Weeks, training days and streaks

- A **week** is Monday to Sunday (ISO 8601), based on the workout's date (`performed_on`), not on when it was saved.
- A **session** is a workout that earned XP, which means one `workout_completed` action.
- A **training day** is a calendar day with at least one session.
- **Weekly streak:** awarded once per week, when the week reaches 3 sessions. It is recorded with the date of the workout that completed it.
- **Five-day week:** awarded once per week, when the week reaches 5 different training days. Any days count, for example Monday to Thursday plus Sunday. It is recorded with the date of the workout that completed it.
- Both bonuses have `reference_id = NULL`.

---

## 4. Anti-cheat rules

| Rule | Value |
|---|---|
| Daily XP cap for the module | 150 XP per day |
| Sessions with XP per day | At most 2 |
| Logging window | XP is earned only if the workout is saved within 4 hours after it started (configurable). A workout saved later is kept, with no XP |
| Future start | A workout cannot start in the future, so it earns no XP |
| Valid set | A working set with reps in the range of the user's training focus (section 1.1). Strength: 1 to 3 reps. Hypertrophy: 6 to 12 reps (both configurable) |
| Weight and duration limits | Not defined yet. Until they are, the database's loose safety limits apply (weight 0 to 1000 kg, duration 1 to 600 minutes) |

- All XP counts toward the daily cap, including records and both weekly bonuses.
- "Sessions with XP per day" is the number of `workout_completed` actions with that `occurred_on`.
- If a workout would take the day above 150 XP, only the XP needed to reach the cap is awarded, and each action records the amount actually awarded.
- Once the cap is reached, the workout is saved but no action is created, and the response says no more XP was earned that day.
- When the cap cuts a workout's XP, the concepts are awarded in this order: base and sets, then records, then the weekly streak, then the five-day bonus.
- Workouts are meant to be recorded in real time, first on the web and later in the mobile app. The 4-hour window starts when the workout starts.
- To start logging a workout, the user enters the start time (the client sends it). The end time is calculated from the start time.
- Cheating is not a design concern: the value of the app is the user's own real progress. The cap, the sessions per day and the 4-hour window guide the user, and they are not a security barrier.

---

## 5. Where each rule lives

| Rule | Where |
|---|---|
| XP amounts, caps, thresholds | Configuration file |
| Calculating XP, records, streaks, caps, levels | XP engine (pure functions, no database, no HTTP) |
| Date and range validation | API validation layer (zod) |
| Loading the history the engine needs | Repositories and services |
| Demo user is read-only | Middleware |

The engine receives the workout (each set with its warm-up flag), the user's training focus, the relevant history and the configuration, and returns XP per concept, records and the total awarded. The history it needs, per exercise, is the maximum weight ever and the best repetitions at each weight.

---

## 6. Action types

| Type | `reference_id` |
|---|---|
| `workout_completed` | `workouts.id` |
| `personal_record` | `workout_sets.id` (the set that broke the record) |
| `weekly_streak` | `NULL` |
| `weekly_five_days` | `NULL` |

The `actions.type` column is plain text with no list in the schema (decision D7 of the database design), so adding `weekly_five_days` needs no migration.

---

## 7. Still to decide

Nothing in this document blocks writing `rules.js`.

1. **End time:** the user enters the start time and the end time is calculated. Proposal: the user also enters the duration, as in the current form, and the end time is the start time plus the duration, so no end-time column is needed.

Weight and duration limits will be defined by the owner when they are needed.

---

## 8. Documents to update

- **Project document, section 5.3:** add a row for the five-day week (+15). The 3-session streak and the weekly pace estimates stay as they are.
- **Project document, sections 5.4, 7.1 and 7.3:** the anti-cheat rules and the workout flow change with the 4-hour window and real-time logging. The valid-set ranges change too, and registration gets a training-focus question, with a way to change it later. The log-workout screen (screen 3) gets the start time and a way to mark warm-up sets, and section 5.3 describes the focus rules.
- **Database design (done in v0.3):** O1 to O9 are decided, `weekly_five_days` is in the action types, and the 4-hour window replaces O6. Migration 001 was edited in place with three additions (no database had been created from it yet): `workouts.started_at`, `workout_sets.is_warmup` (default 0) and the `gym_profiles` table.

---

## 9. Ideas for after the MVP

- **Unusual-jump warning:** if the reps or the weight of an exercise jump far above the last session (for example, from 12 to 30 reps), show an in-app warning so a typo can be fixed. It is not part of the MVP, and push notifications are not planned.
