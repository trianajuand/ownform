import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { xpRules } from '../../../src/config/xp-rules.js';
import {
  isValidSet,
  countValidSets,
  calculateWorkoutXp,
  detectRecords,
  isWithinLoggingWindow,
  calculateWeeklyBonuses,
  applyDailyCap,
  calculateXp,
} from '../../../src/core/xp-engine/rules.js';

describe('isValidSet', () => {
  describe('strength focus (1 to 3 reps)', () => {
    it('accepts the lowest and highest valid reps', () => {
      assert.equal(
        isValidSet({ reps: 1, weight: 100, isWarmup: false }, 'strength', xpRules),
        true,
      );
      assert.equal(
        isValidSet({ reps: 3, weight: 100, isWarmup: false }, 'strength', xpRules),
        true,
      );
    });

    it('rejects reps just outside the range', () => {
      assert.equal(
        isValidSet({ reps: 0, weight: 100, isWarmup: false }, 'strength', xpRules),
        false,
      );
      assert.equal(
        isValidSet({ reps: 4, weight: 100, isWarmup: false }, 'strength', xpRules),
        false,
      );
    });
  });

  describe('hypertrophy focus (6 to 12 reps)', () => {
    it('accepts the lowest and highest valid reps', () => {
      assert.equal(
        isValidSet({ reps: 6, weight: 60, isWarmup: false }, 'hypertrophy', xpRules),
        true,
      );
      assert.equal(
        isValidSet({ reps: 12, weight: 60, isWarmup: false }, 'hypertrophy', xpRules),
        true,
      );
    });

    it('rejects reps just outside the range', () => {
      assert.equal(
        isValidSet({ reps: 5, weight: 60, isWarmup: false }, 'hypertrophy', xpRules),
        false,
      );
      assert.equal(
        isValidSet({ reps: 13, weight: 60, isWarmup: false }, 'hypertrophy', xpRules),
        false,
      );
    });
  });

  describe('warm-up sets', () => {
    it('never earns XP, even with reps inside the range', () => {
      assert.equal(isValidSet({ reps: 2, weight: 60, isWarmup: true }, 'strength', xpRules), false);
    });
  });

  describe('uses the rules it receives', () => {
    it('follows a custom config instead of the real one', () => {
      const fakeRules = { focuses: { test: { minReps: 20, maxReps: 25 } } };
      assert.equal(isValidSet({ reps: 22, weight: 10, isWarmup: false }, 'test', fakeRules), true);
      assert.equal(isValidSet({ reps: 3, weight: 10, isWarmup: false }, 'test', fakeRules), false);
    });
  });

  describe('invalid input', () => {
    it('throws a RangeError for an unknown focus', () => {
      assert.throws(
        () => isValidSet({ reps: 3, weight: 100, isWarmup: false }, 'cardio', xpRules),
        RangeError,
      );
    });

    it('throws a RangeError when the rules have no focuses', () => {
      assert.throws(
        () => isValidSet({ reps: 3, weight: 100, isWarmup: false }, 'strength', {}),
        RangeError,
      );
    });
  });
});

// Builds an array of `count` sets. `overrides` changes any field of every set.
function makeSets(count, overrides = {}) {
  return Array.from({ length: count }, () => ({
    exerciseId: 1,
    reps: 3,
    weight: 100,
    isWarmup: false,
    ...overrides,
  }));
}

describe('countValidSets', () => {
  it('returns 0 for a workout with no sets', () => {
    assert.equal(countValidSets([], 'strength', xpRules), 0);
  });

  it('counts only the valid sets (strength)', () => {
    const sets = [
      ...makeSets(3), // 3 valid sets
      ...makeSets(1, { reps: 5 }), // out of range
      ...makeSets(1, { reps: 2, isWarmup: true }), // warm-up
    ];
    assert.equal(countValidSets(sets, 'strength', xpRules), 3);
  });

  it('counts only the valid sets (hypertrophy)', () => {
    const sets = [...makeSets(3, { reps: 10 }), ...makeSets(2, { reps: 4 })];
    assert.equal(countValidSets(sets, 'hypertrophy', xpRules), 3);
  });

  it('limits strength to 8 sets per exercise', () => {
    assert.equal(countValidSets(makeSets(10), 'strength', xpRules), 8);
  });

  it('applies the per-exercise limit to each exercise separately', () => {
    const sets = [...makeSets(10, { exerciseId: 1 }), ...makeSets(2, { exerciseId: 2 })];
    assert.equal(countValidSets(sets, 'strength', xpRules), 10); // 8 + 2
  });

  it('has no per-exercise limit for hypertrophy', () => {
    assert.equal(countValidSets(makeSets(15, { reps: 10 }), 'hypertrophy', xpRules), 15);
  });

  it('limits the whole workout to 20 sets', () => {
    const sets = [
      ...makeSets(10, { exerciseId: 1, reps: 10 }),
      ...makeSets(10, { exerciseId: 2, reps: 10 }),
      ...makeSets(10, { exerciseId: 3, reps: 10 }),
    ];
    assert.equal(countValidSets(sets, 'hypertrophy', xpRules), 20);
  });

  it('follows a custom config instead of the real one', () => {
    const fakeRules = {
      maxCountedSetsPerWorkout: 5,
      focuses: { test: { minReps: 1, maxReps: 10, maxSetsPerExercise: 2 } },
    };
    const sets = [
      ...makeSets(4, { exerciseId: 1 }),
      ...makeSets(4, { exerciseId: 2 }),
      ...makeSets(4, { exerciseId: 3 }),
    ];
    // each exercise is cut to 2 (total 6), then the workout is cut to 5
    assert.equal(countValidSets(sets, 'test', fakeRules), 5);
  });

  it('throws a RangeError for an unknown focus', () => {
    assert.throws(() => countValidSets(makeSets(2), 'cardio', xpRules), RangeError);
  });

  it('throws a RangeError for an unknown focus even with no sets', () => {
    assert.throws(() => countValidSets([], 'cardio', xpRules), RangeError);
  });
});

describe('calculateWorkoutXp', () => {
  it('gives base XP plus 2 per valid set (strength)', () => {
    assert.deepEqual(calculateWorkoutXp(makeSets(3), 'strength', xpRules), {
      baseXp: 20,
      setsXp: 6,
      total: 26,
    });
  });

  it('reaches the minimum with a single set in strength', () => {
    assert.deepEqual(calculateWorkoutXp(makeSets(1), 'strength', xpRules), {
      baseXp: 20,
      setsXp: 2,
      total: 22,
    });
  });

  it('gives nothing in hypertrophy below the minimum of 3 sets', () => {
    const sets = makeSets(2, { reps: 10 });
    assert.deepEqual(calculateWorkoutXp(sets, 'hypertrophy', xpRules), {
      baseXp: 0,
      setsXp: 0,
      total: 0,
    });
  });

  it('gives XP in hypertrophy when it reaches exactly 3 sets', () => {
    const sets = makeSets(3, { reps: 10 });
    assert.deepEqual(calculateWorkoutXp(sets, 'hypertrophy', xpRules), {
      baseXp: 20,
      setsXp: 6,
      total: 26,
    });
  });

  it('does not count invalid sets toward the minimum', () => {
    const sets = [...makeSets(2, { reps: 10 }), ...makeSets(5, { reps: 4 })];
    assert.equal(calculateWorkoutXp(sets, 'hypertrophy', xpRules).total, 0);
  });

  it('ignores warm-up sets and out-of-range sets for the set XP', () => {
    const sets = [
      ...makeSets(1),
      ...makeSets(3, { reps: 2, isWarmup: true }),
      ...makeSets(2, { reps: 5 }),
    ];
    assert.deepEqual(calculateWorkoutXp(sets, 'strength', xpRules), {
      baseXp: 20,
      setsXp: 2,
      total: 22,
    });
  });

  it('pays only for the sets that count after the per-exercise limit', () => {
    // 10 valid strength sets of one exercise: only 8 count -> 8 x 2 = 16
    assert.deepEqual(calculateWorkoutXp(makeSets(10), 'strength', xpRules), {
      baseXp: 20,
      setsXp: 16,
      total: 36,
    });
  });

  it('pays only for the sets that count after the workout limit', () => {
    // 25 valid hypertrophy sets: only 20 count -> 20 x 2 = 40
    const sets = makeSets(25, { reps: 10 });
    assert.deepEqual(calculateWorkoutXp(sets, 'hypertrophy', xpRules), {
      baseXp: 20,
      setsXp: 40,
      total: 60,
    });
  });

  it('gives nothing for an empty workout', () => {
    assert.equal(calculateWorkoutXp([], 'strength', xpRules).total, 0);
  });

  it('follows a custom config instead of the real one', () => {
    const fakeRules = {
      baseXp: 100,
      xpPerValidSet: 10,
      maxCountedSetsPerWorkout: 50,
      focuses: {
        test: { minReps: 1, maxReps: 10, maxSetsPerExercise: null, minValidSets: 2 },
      },
    };
    assert.deepEqual(calculateWorkoutXp(makeSets(2), 'test', fakeRules), {
      baseXp: 100,
      setsXp: 20,
      total: 120,
    });
    assert.equal(calculateWorkoutXp(makeSets(1), 'test', fakeRules).total, 0);
  });

  it('throws a RangeError for an unknown focus', () => {
    assert.throws(() => calculateWorkoutXp(makeSets(3), 'cardio', xpRules), RangeError);
  });
});

describe('detectRecords', () => {
  // Exercise 1 = bench press: 60 kg x 10, 65 kg x 8 and 70 kg x 6
  const history = {
    1: { maxWeight: 70, bestRepsByWeight: { 60: 10, 65: 8, 70: 6 } },
  };

  it('detects a reps record at a weight used before', () => {
    const sets = makeSets(1, { weight: 70, reps: 7 });
    assert.deepEqual(detectRecords(sets, history, xpRules), [
      { exerciseId: 1, set: sets[0], type: 'reps' },
    ]);
  });

  it('detects a weight record when the weight is the heaviest ever', () => {
    const sets = makeSets(1, { weight: 72.5, reps: 3 });
    assert.deepEqual(detectRecords(sets, history, xpRules), [
      { exerciseId: 1, set: sets[0], type: 'weight' },
    ]);
  });

  it('does not count a tie as a record', () => {
    const sets = makeSets(1, { weight: 70, reps: 6 });
    assert.deepEqual(detectRecords(sets, history, xpRules), []);
  });

  it('does not count a new weight that is not the heaviest', () => {
    const sets = makeSets(1, { weight: 62.5, reps: 4 });
    assert.deepEqual(detectRecords(sets, history, xpRules), []);
  });

  it('ignores warm-up sets', () => {
    const sets = makeSets(1, { weight: 100, reps: 1, isWarmup: true });
    assert.deepEqual(detectRecords(sets, history, xpRules), []);
  });

  it('treats an exercise without history as a baseline, not a record', () => {
    const sets = makeSets(1, { exerciseId: 99, weight: 200, reps: 10 });
    assert.deepEqual(detectRecords(sets, history, xpRules), []);
  });

  it('considers every working set, whatever its reps', () => {
    // 20 reps is outside the valid range of both focuses, but it still counts for records
    const sets = makeSets(1, { weight: 75, reps: 20 });
    assert.equal(detectRecords(sets, history, xpRules)[0].type, 'weight');
  });

  it('gives only one record per exercise, the first one found', () => {
    const sets = [
      ...makeSets(1, { weight: 72.5, reps: 3 }),
      ...makeSets(1, { weight: 75, reps: 2 }),
      ...makeSets(1, { weight: 70, reps: 7 }),
    ];
    const records = detectRecords(sets, history, xpRules);
    assert.equal(records.length, 1);
    assert.equal(records[0].set, sets[0]);
  });

  it('gives one record to each exercise that breaks one', () => {
    const twoHistories = {
      1: { maxWeight: 70, bestRepsByWeight: { 70: 6 } },
      2: { maxWeight: 40, bestRepsByWeight: { 40: 10 } },
    };
    const sets = [
      ...makeSets(1, { exerciseId: 1, weight: 72.5, reps: 3 }),
      ...makeSets(1, { exerciseId: 2, weight: 40, reps: 11 }),
    ];
    const records = detectRecords(sets, twoHistories, xpRules);
    assert.deepEqual(
      records.map((record) => record.exerciseId),
      [1, 2],
    );
  });

  it('handles bodyweight exercises (weight 0)', () => {
    const pullUps = { 5: { maxWeight: 0, bestRepsByWeight: { 0: 8 } } };
    const tie = makeSets(1, { exerciseId: 5, weight: 0, reps: 8 });
    const moreReps = makeSets(1, { exerciseId: 5, weight: 0, reps: 9 });
    const weighted = makeSets(1, { exerciseId: 5, weight: 5, reps: 5 });

    assert.deepEqual(detectRecords(tie, pullUps, xpRules), []);
    assert.equal(detectRecords(moreReps, pullUps, xpRules)[0].type, 'reps');
    assert.equal(detectRecords(weighted, pullUps, xpRules)[0].type, 'weight');
  });

  it('rewards at most 3 records per workout (the first ones)', () => {
    const history4 = {};
    for (const id of [1, 2, 3, 4]) {
      history4[id] = { maxWeight: 50, bestRepsByWeight: { 50: 5 } };
    }
    // flatMap builds one set for each exercise id and joins them in a single array
    const sets = [1, 2, 3, 4].flatMap((id) => makeSets(1, { exerciseId: id, weight: 60, reps: 5 }));

    const records = detectRecords(sets, history4, xpRules);
    assert.deepEqual(
      records.map((record) => record.exerciseId),
      [1, 2, 3],
    );
  });

  it('follows the record limit of a custom config', () => {
    const fakeRules = { maxRecordsPerWorkout: 1 };
    const twoHistories = {
      1: { maxWeight: 50, bestRepsByWeight: { 50: 5 } },
      2: { maxWeight: 50, bestRepsByWeight: { 50: 5 } },
    };
    const sets = [
      ...makeSets(1, { exerciseId: 1, weight: 60, reps: 5 }),
      ...makeSets(1, { exerciseId: 2, weight: 60, reps: 5 }),
    ];
    assert.equal(detectRecords(sets, twoHistories, fakeRules).length, 1);
  });

  it('returns an empty array for a workout with no sets', () => {
    assert.deepEqual(detectRecords([], history, xpRules), []);
  });
});

describe('isWithinLoggingWindow', () => {
  const startedAt = '2026-10-27T10:00:00Z';

  it('accepts a workout saved 30 minutes after it started', () => {
    assert.equal(isWithinLoggingWindow(startedAt, '2026-10-27T10:30:00Z', xpRules), true);
  });

  it('accepts a workout saved at the very moment it started', () => {
    assert.equal(isWithinLoggingWindow(startedAt, startedAt, xpRules), true);
  });

  it('accepts a workout saved exactly 4 hours after it started', () => {
    assert.equal(isWithinLoggingWindow(startedAt, '2026-10-27T14:00:00Z', xpRules), true);
  });

  it('rejects a workout saved one second after the 4 hours', () => {
    assert.equal(isWithinLoggingWindow(startedAt, '2026-10-27T14:00:01Z', xpRules), false);
  });

  it('rejects a workout that starts in the future', () => {
    assert.equal(isWithinLoggingWindow(startedAt, '2026-10-27T09:59:00Z', xpRules), false);
  });

  it('rejects a start that is one second in the future', () => {
    assert.equal(isWithinLoggingWindow(startedAt, '2026-10-27T09:59:59Z', xpRules), false);
  });

  it('works when the window crosses midnight', () => {
    assert.equal(
      isWithinLoggingWindow('2026-10-27T23:00:00Z', '2026-10-28T02:00:00Z', xpRules),
      true,
    );
  });

  it('follows the window of a custom config', () => {
    const fakeRules = { loggingWindowHours: 1 };
    assert.equal(isWithinLoggingWindow(startedAt, '2026-10-27T11:00:00Z', fakeRules), true);
    assert.equal(isWithinLoggingWindow(startedAt, '2026-10-27T11:00:01Z', fakeRules), false);
  });

  it('throws a RangeError for an invalid start date', () => {
    assert.throws(
      () => isWithinLoggingWindow('hello', '2026-10-27T10:00:00Z', xpRules),
      RangeError,
    );
  });

  it('throws a RangeError for an invalid current date', () => {
    assert.throws(() => isWithinLoggingWindow(startedAt, 'hello', xpRules), RangeError);
  });
});

describe('calculateWeeklyBonuses', () => {
  it('gives the weekly streak when this workout is the 3rd session', () => {
    const week = { sessions: 2, trainingDays: ['2026-10-26', '2026-10-27'] };
    assert.deepEqual(calculateWeeklyBonuses('2026-10-28', week, xpRules), {
      streakXp: 40,
      fiveDaysXp: 0,
      total: 40,
    });
  });

  it('gives nothing for the first session of the week', () => {
    const week = { sessions: 0, trainingDays: [] };
    assert.deepEqual(calculateWeeklyBonuses('2026-10-26', week, xpRules), {
      streakXp: 0,
      fiveDaysXp: 0,
      total: 0,
    });
  });

  it('gives nothing for the 2nd session', () => {
    const week = { sessions: 1, trainingDays: ['2026-10-26'] };
    assert.equal(calculateWeeklyBonuses('2026-10-27', week, xpRules).total, 0);
  });

  it('does not repeat the streak after the 3rd session', () => {
    const week = {
      sessions: 3,
      trainingDays: ['2026-10-26', '2026-10-27', '2026-10-28'],
    };
    assert.equal(calculateWeeklyBonuses('2026-10-29', week, xpRules).streakXp, 0);
  });

  it('gives the five-day bonus when this workout is on a 5th different day', () => {
    const week = {
      sessions: 4,
      trainingDays: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'],
    };
    // Any days count: here Monday to Thursday plus Sunday
    assert.deepEqual(calculateWeeklyBonuses('2026-11-01', week, xpRules), {
      streakXp: 0,
      fiveDaysXp: 15,
      total: 15,
    });
  });

  it('does not count a second session on a day already trained', () => {
    const week = {
      sessions: 4,
      trainingDays: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'],
    };
    assert.equal(calculateWeeklyBonuses('2026-10-29', week, xpRules).fiveDaysXp, 0);
  });

  it('does not repeat the five-day bonus after the 5th day', () => {
    const week = {
      sessions: 5,
      trainingDays: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
    };
    assert.equal(calculateWeeklyBonuses('2026-10-31', week, xpRules).fiveDaysXp, 0);
  });

  it('can give both bonuses at once when the thresholds are crossed together', () => {
    // With the real config this cannot happen, so we use a custom one
    const fakeRules = {
      weeklyStreak: { minSessions: 2, xp: 10 },
      fiveDayWeek: { days: 2, xp: 5 },
    };
    const week = { sessions: 1, trainingDays: ['2026-10-26'] };
    assert.deepEqual(calculateWeeklyBonuses('2026-10-27', week, fakeRules), {
      streakXp: 10,
      fiveDaysXp: 5,
      total: 15,
    });
  });

  it('does not modify the week it receives', () => {
    const week = { sessions: 2, trainingDays: ['2026-10-26', '2026-10-27'] };
    const copy = structuredClone(week);
    calculateWeeklyBonuses('2026-10-28', week, xpRules);
    assert.deepEqual(week, copy);
  });
});

describe('applyDailyCap', () => {
  it('keeps everything when the day stays under the cap', () => {
    const items = [
      { type: 'workout_completed', xp: 26 },
      { type: 'personal_record', xp: 25 },
    ];
    assert.deepEqual(applyDailyCap(items, 0, xpRules), { items, total: 51 });
  });

  it('cuts the last items that do not fit, in priority order', () => {
    const items = [
      { type: 'workout_completed', xp: 26 },
      { type: 'personal_record', xp: 25 },
      { type: 'personal_record', xp: 25 },
      { type: 'weekly_streak', xp: 40 },
    ];
    // 100 XP already earned: 50 left -> 26, then 24 of the first record, then nothing
    assert.deepEqual(applyDailyCap(items, 100, xpRules), {
      items: [
        { type: 'workout_completed', xp: 26 },
        { type: 'personal_record', xp: 24 },
      ],
      total: 50,
    });
  });

  it('removes the items that come after the cap is reached exactly', () => {
    const items = [
      { type: 'workout_completed', xp: 26 },
      { type: 'personal_record', xp: 25 },
    ];
    // 124 + 26 = 150, so the record gets nothing
    assert.deepEqual(applyDailyCap(items, 124, xpRules), {
      items: [{ type: 'workout_completed', xp: 26 }],
      total: 26,
    });
  });

  it('gives the last XP that fits when the day is almost full', () => {
    const items = [
      { type: 'workout_completed', xp: 26 },
      { type: 'personal_record', xp: 25 },
    ];
    assert.deepEqual(applyDailyCap(items, 149, xpRules), {
      items: [{ type: 'workout_completed', xp: 1 }],
      total: 1,
    });
  });

  it('gives nothing when the cap is already reached', () => {
    const items = [{ type: 'workout_completed', xp: 26 }];
    assert.deepEqual(applyDailyCap(items, 150, xpRules), { items: [], total: 0 });
  });

  it('gives nothing when the day is already over the cap', () => {
    const items = [{ type: 'workout_completed', xp: 26 }];
    assert.deepEqual(applyDailyCap(items, 200, xpRules), { items: [], total: 0 });
  });

  it('keeps the extra fields of each item', () => {
    const items = [{ type: 'personal_record', xp: 25, exerciseId: 3 }];
    assert.deepEqual(applyDailyCap(items, 140, xpRules), {
      items: [{ type: 'personal_record', xp: 10, exerciseId: 3 }],
      total: 10,
    });
  });

  it('removes items that had 0 XP from the start', () => {
    const items = [{ type: 'weekly_streak', xp: 0 }];
    assert.deepEqual(applyDailyCap(items, 0, xpRules), { items: [], total: 0 });
  });

  it('returns an empty result for an empty list', () => {
    assert.deepEqual(applyDailyCap([], 0, xpRules), { items: [], total: 0 });
  });

  it('follows the cap of a custom config', () => {
    const fakeRules = { dailyXpCap: 10 };
    const items = [
      { type: 'a', xp: 6 },
      { type: 'b', xp: 6 },
    ];
    assert.deepEqual(applyDailyCap(items, 0, fakeRules), {
      items: [
        { type: 'a', xp: 6 },
        { type: 'b', xp: 4 },
      ],
      total: 10,
    });
  });

  it('does not modify the items it receives', () => {
    const items = [{ type: 'workout_completed', xp: 26 }];
    const copy = structuredClone(items);
    applyDailyCap(items, 140, xpRules);
    assert.deepEqual(items, copy);
  });
});

// A normal input: 3 valid strength sets, saved 1 hour after the start, nothing earned before.
function makeInput(overrides = {}) {
  return {
    sets: makeSets(3), // exercise 1, 3 reps, 100 kg
    focus: 'strength',
    startedAt: '2026-10-27T10:00:00Z',
    performedOn: '2026-10-27',
    now: '2026-10-27T11:00:00Z',
    history: {},
    week: { sessions: 0, trainingDays: [] },
    xpToday: 0,
    sessionsToday: 0,
    ...overrides,
  };
}

describe('calculateXp', () => {
  // Exercise 1 had a best weight of 90 kg, so 100 kg is a weight record
  const recordHistory = { 1: { maxWeight: 90, bestRepsByWeight: { 90: 3 } } };

  it('gives the workout XP for a normal workout', () => {
    assert.deepEqual(calculateXp(makeInput(), xpRules), {
      items: [{ type: 'workout_completed', xp: 26 }],
      total: 26,
      reason: null,
    });
  });

  it('adds a personal record item', () => {
    const input = makeInput({ history: recordHistory });
    assert.deepEqual(calculateXp(input, xpRules), {
      items: [
        { type: 'workout_completed', xp: 26 },
        { type: 'personal_record', xp: 25, exerciseId: 1, set: input.sets[0] },
      ],
      total: 51,
      reason: null,
    });
  });

  it('ignores warm-up sets when counting the workout XP', () => {
    const sets = [...makeSets(1), ...makeSets(3, { reps: 2, isWarmup: true })];
    assert.equal(calculateXp(makeInput({ sets }), xpRules).total, 22);
  });

  it('gives the weekly streak on the 3rd session', () => {
    const week = { sessions: 2, trainingDays: ['2026-10-26', '2026-10-27'] };
    assert.deepEqual(calculateXp(makeInput({ week }), xpRules), {
      items: [
        { type: 'workout_completed', xp: 26 },
        { type: 'weekly_streak', xp: 40 },
      ],
      total: 66,
      reason: null,
    });
  });

  it('gives the five-day bonus on the 5th different day', () => {
    const input = makeInput({
      startedAt: '2026-11-01T10:00:00Z',
      now: '2026-11-01T11:00:00Z',
      performedOn: '2026-11-01',
      week: {
        sessions: 4,
        trainingDays: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'],
      },
    });
    assert.deepEqual(calculateXp(input, xpRules), {
      items: [
        { type: 'workout_completed', xp: 26 },
        { type: 'weekly_five_days', xp: 15 },
      ],
      total: 41,
      reason: null,
    });
  });

  it('puts the items in priority order: workout, records, streak', () => {
    const week = { sessions: 2, trainingDays: ['2026-10-26', '2026-10-27'] };
    const result = calculateXp(makeInput({ history: recordHistory, week }), xpRules);
    assert.deepEqual(
      result.items.map((item) => item.type),
      ['workout_completed', 'personal_record', 'weekly_streak'],
    );
    assert.equal(result.total, 91);
  });

  it('refuses XP when the workout is saved after the logging window', () => {
    const input = makeInput({ now: '2026-10-27T15:00:00Z' }); // 5 hours later
    assert.deepEqual(calculateXp(input, xpRules), {
      items: [],
      total: 0,
      reason: 'outside_logging_window',
    });
  });

  it('refuses XP when the workout starts in the future', () => {
    const input = makeInput({ now: '2026-10-27T09:00:00Z' });
    assert.equal(calculateXp(input, xpRules).reason, 'outside_logging_window');
  });

  it('refuses XP after 2 sessions with XP in the day', () => {
    const result = calculateXp(makeInput({ sessionsToday: 2 }), xpRules);
    assert.deepEqual(result, { items: [], total: 0, reason: 'session_limit' });
  });

  it('allows a second session in the day', () => {
    assert.equal(calculateXp(makeInput({ sessionsToday: 1 }), xpRules).total, 26);
  });

  it('refuses XP when the workout does not reach the minimum of valid sets', () => {
    const input = makeInput({ focus: 'hypertrophy', sets: makeSets(2, { reps: 10 }) });
    assert.deepEqual(calculateXp(input, xpRules), {
      items: [],
      total: 0,
      reason: 'not_enough_valid_sets',
    });
  });

  it('gives no records or bonuses when the workout earns no XP', () => {
    const input = makeInput({
      focus: 'hypertrophy',
      sets: makeSets(2, { reps: 10 }),
      history: recordHistory,
      week: { sessions: 2, trainingDays: ['2026-10-26', '2026-10-27'] },
    });
    assert.equal(calculateXp(input, xpRules).total, 0);
  });

  it('cuts the XP with the daily cap, in priority order', () => {
    const week = { sessions: 2, trainingDays: ['2026-10-26', '2026-10-27'] };
    const input = makeInput({ history: recordHistory, week, xpToday: 100 });
    // 50 left: workout 26, then the record gets 24, and the streak gets nothing
    assert.deepEqual(calculateXp(input, xpRules), {
      items: [
        { type: 'workout_completed', xp: 26 },
        { type: 'personal_record', xp: 24, exerciseId: 1, set: input.sets[0] },
      ],
      total: 50,
      reason: null,
    });
  });

  it('refuses XP when the daily cap is already reached', () => {
    const result = calculateXp(makeInput({ xpToday: 150 }), xpRules);
    assert.deepEqual(result, { items: [], total: 0, reason: 'daily_cap_reached' });
  });

  it('throws a RangeError for an unknown focus', () => {
    assert.throws(() => calculateXp(makeInput({ focus: 'cardio' }), xpRules), RangeError);
  });

  it('does not modify the input it receives', () => {
    const input = makeInput({ history: recordHistory });
    const copy = structuredClone(input);
    calculateXp(input, xpRules);
    assert.deepEqual(input, copy);
  });
});
