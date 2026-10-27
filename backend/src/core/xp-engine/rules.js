// Returns the settings of a training focus (for example, strength) from the rules.

// Throws a RangeError if the rules or the focus do not exist.
function getFocusRules(focus, rules) {
  if (!rules || !rules.focuses) {
    throw new RangeError("Rules must include a 'focuses' object");
  }

  const focusRules = rules.focuses[focus];

  if (!focusRules) {
    throw new RangeError(`Focus '${focus}' is not defined in the rules`);
  }

  return focusRules;
}

// that function check if it is a valid set, and if it is to obtain xp
export function isValidSet(set, focus, rules) {
  const focusRules = getFocusRules(focus, rules);

  if (set.isWarmup) {
    return false;
  }

  return set.reps >= focusRules.minReps && set.reps <= focusRules.maxReps;
}

// Counts the sets of a workout that earn XP.
// Applies the limit per exercise (if the focus has one) and the limit per workout.
export function countValidSets(sets, focus, rules) {
  const focusRules = getFocusRules(focus, rules);
  const counts = {};

  for (const set of sets) {
    if (!isValidSet(set, focus, rules)) {
      continue;
    }

    const exerciseId = set.exerciseId;

    if (counts[exerciseId] === undefined) {
      counts[exerciseId] = 0;
    }

    counts[exerciseId]++;
  }

  let total = 0;

  for (const count of Object.values(counts)) {
    if (focusRules.maxSetsPerExercise === null) {
      total += count;
    } else {
      total += Math.min(count, focusRules.maxSetsPerExercise);
    }
  }

  return Math.min(total, rules.maxCountedSetsPerWorkout);
}

// Calculates the XP of a workout: the base XP plus the XP of each counted set.
//The base +20 and the +2 per set, or 0 if you didn’t reach the minimum of sets
export function calculateWorkoutXp(sets, focus, rules) {
  const focusRules = getFocusRules(focus, rules);
  const validSets = countValidSets(sets, focus, rules);

  if (validSets < focusRules.minValidSets) {
    return {
      baseXp: 0,
      setsXp: 0,
      total: 0,
    };
  }

  const baseXp = rules.baseXp;
  const setsXp = validSets * rules.xpPerValidSet;

  return {
    baseXp,
    setsXp,
    total: baseXp + setsXp,
  };
}

// Says what kind of record a single set breaks, compared with the history of its exercise.
function getRecordType(set, exerciseHistory) {
  // A new maximum weight is a weight record.
  if (exerciseHistory.maxWeight !== undefined && set.weight > exerciseHistory.maxWeight) {
    return 'weight';
  }

  // A reps record only counts at a weight used before.
  const bestReps = exerciseHistory.bestRepsByWeight[set.weight];

  if (bestReps !== undefined && set.reps > bestReps) {
    return 'reps';
  }

  return null;
}

//Finds the exercises with a record (more weight, or more reps at the same weight)
export function detectRecords(sets, history, rules) {
  const records = [];
  const recordedExercises = new Set();

  for (const set of sets) {
    // Skip warm-up sets.
    if (set.isWarmup) {
      continue;
    }

    const exerciseId = set.exerciseId;

    // Skip exercises without history (the first time is only a baseline).
    const exerciseHistory = history[exerciseId];

    if (exerciseHistory === undefined) {
      continue;
    }

    // Only one record per exercise per workout.
    if (recordedExercises.has(exerciseId)) {
      continue;
    }

    const type = getRecordType(set, exerciseHistory);

    if (type !== null) {
      records.push({
        exerciseId,
        set,
        type,
      });

      recordedExercises.add(exerciseId);
    }
  }

  return records.slice(0, rules.maxRecordsPerWorkout);
}

//Checks that the workout was saved within 4 hours of its start
export function isWithinLoggingWindow(startedAt, now, rules) {
  const start = new Date(startedAt).getTime();
  const current = new Date(now).getTime();

  if (Number.isNaN(start)) {
    throw new RangeError('Invalid workout start date');
  }

  if (Number.isNaN(current)) {
    throw new RangeError('Invalid current date');
  }

  if (start > current) {
    return false;
  }

  const elapsedTime = current - start;
  const loggingWindowMs = rules.loggingWindowHours * 60 * 60 * 1000;

  return elapsedTime <= loggingWindowMs;
}

//The weekly streak (+40) and the five-day bonus (+15), once per week
export function calculateWeeklyBonuses(performedOn, week, rules) {
  const sessionsBefore = week.sessions;
  const sessionsAfter = sessionsBefore + 1;

  const daysBefore = new Set(week.trainingDays);
  const daysAfter = new Set([...week.trainingDays, performedOn]);

  let streakXp = 0;
  let fiveDaysXp = 0;

  // Check whether this workout crosses the weekly session threshold.
  if (
    sessionsBefore < rules.weeklyStreak.minSessions &&
    sessionsAfter >= rules.weeklyStreak.minSessions
  ) {
    streakXp = rules.weeklyStreak.xp;
  }

  // Check whether this workout crosses the distinct training days threshold.
  if (daysBefore.size < rules.fiveDayWeek.days && daysAfter.size >= rules.fiveDayWeek.days) {
    fiveDaysXp = rules.fiveDayWeek.xp;
  }

  return {
    streakXp,
    fiveDaysXp,
    total: streakXp + fiveDaysXp,
  };
}

//Cuts the XP so the day never goes above 150
export function applyDailyCap(items, xpToday, rules) {
  let remaining = Math.max(0, rules.dailyXpCap - xpToday);
  const cappedItems = [];
  let total = 0;

  for (const item of items) {
    const awarded = Math.min(item.xp, remaining);

    remaining -= awarded;

    if (awarded > 0) {
      cappedItems.push({
        ...item,
        xp: awarded,
      });

      total += awarded;
    }
  }

  return {
    items: cappedItems,
    total,
  };
}

/**
 * Calculates the XP earned by a workout by chaining the XP engine functions.
 *
 * Checks the logging window and daily session limit first, then calculates
 * workout XP, personal records, weekly bonuses, and applies the daily XP cap.
 *
 * Returns the awarded items, total XP, and a reason when no XP is earned.
 * Does not modify the input or read the system clock.
 */
export function calculateXp(input, rules) {
  const { sets, focus, startedAt, performedOn, now, history, week, xpToday, sessionsToday } = input;

  // Part 1: Check whether the workout is allowed to earn XP.
  if (!isWithinLoggingWindow(startedAt, now, rules)) {
    return {
      items: [],
      total: 0,
      reason: 'outside_logging_window',
    };
  }

  if (sessionsToday >= rules.maxSessionsWithXpPerDay) {
    return {
      items: [],
      total: 0,
      reason: 'session_limit',
    };
  }

  // Part 2: Calculate XP for the workout itself.
  const workoutXp = calculateWorkoutXp(sets, focus, rules);

  if (workoutXp.total === 0) {
    return {
      items: [],
      total: 0,
      reason: 'not_enough_valid_sets',
    };
  }

  // Part 3: Build XP items in priority order.
  const items = [
    {
      type: 'workout_completed',
      xp: workoutXp.total,
    },
  ];

  // Add personal record items.
  const records = detectRecords(sets, history, rules);

  for (const record of records) {
    items.push({
      type: 'personal_record',
      xp: rules.recordXp,
      exerciseId: record.exerciseId,
      set: record.set,
    });
  }

  // Add weekly bonuses.
  const weeklyBonuses = calculateWeeklyBonuses(performedOn, week, rules);

  if (weeklyBonuses.streakXp > 0) {
    items.push({
      type: 'weekly_streak',
      xp: weeklyBonuses.streakXp,
    });
  }

  if (weeklyBonuses.fiveDaysXp > 0) {
    items.push({
      type: 'weekly_five_days',
      xp: weeklyBonuses.fiveDaysXp,
    });
  }

  // Part 4: Apply the daily XP cap.
  const result = applyDailyCap(items, xpToday, rules);

  return {
    items: result.items,
    total: result.total,
    reason: result.items.length === 0 ? 'daily_cap_reached' : null,
  };
}
