// XP rules of the Gym module. The reasoning is in docs/decisions/xp-rules.md.
// Every number lives here, so the game can be balanced without touching the XP engine.

// Freezes the object and every object inside it, so no value can be changed by accident.
function deepFreeze(object) {
  for (const value of Object.values(object)) {
    if (value !== null && typeof value === 'object') {
      deepFreeze(value);
    }
  }
  return Object.freeze(object);
}

export const xpRules = deepFreeze({
  // XP events
  baseXp: 20, // completed workout, once the minimum of valid sets is reached
  xpPerValidSet: 2,
  recordXp: 25, // per exercise with a personal record
  weeklyStreak: { minSessions: 3, xp: 40 }, // sessions with XP in the week, once per week
  fiveDayWeek: { days: 5, xp: 15 }, // different training days in the week, once per week

  // Limits
  maxRecordsPerWorkout: 3,
  maxCountedSetsPerWorkout: 20, // both focuses
  dailyXpCap: 150,
  maxSessionsWithXpPerDay: 2,
  loggingWindowHours: 4, // hours after the start of a workout in which it can earn XP

  // Training focus: which sets are valid depends on the user's choice.
  // maxSetsPerExercise: null means no limit per exercise.
  focuses: {
    strength: { minReps: 1, maxReps: 3, maxSetsPerExercise: 8, minValidSets: 1 },
    hypertrophy: { minReps: 6, maxReps: 12, maxSetsPerExercise: null, minValidSets: 3 },
  },
});
