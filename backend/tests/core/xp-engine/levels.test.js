import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  xpForLevel,
  levelFromXp,
  progressToNextLevel,
} from '../../../src/core/xp-engine/levels.js';

describe('xpForLevel', () => {
  it('returns 0 for level 1', () => {
    assert.equal(xpForLevel(1), 0);
  });

  it('returns the XP needed to reach each level', () => {
    assert.equal(xpForLevel(2), 100);
    assert.equal(xpForLevel(3), 300);
    assert.equal(xpForLevel(4), 600);
    assert.equal(xpForLevel(5), 1000);
    assert.equal(xpForLevel(10), 4500);
  });

  it('throws a RangeError for a level below 1', () => {
    assert.throws(() => xpForLevel(0), RangeError);
    assert.throws(() => xpForLevel(-1), RangeError);
  });

  it('throws a RangeError when the level is not an integer', () => {
    assert.throws(() => xpForLevel(1.5), RangeError);
    assert.throws(() => xpForLevel('2'), RangeError);
    assert.throws(() => xpForLevel(undefined), RangeError);
  });
});

describe('levelFromXp', () => {
  it('returns level 1 for 0 XP', () => {
    assert.equal(levelFromXp(0), 1);
  });

  it('stays at level 1 one XP before level 2', () => {
    assert.equal(levelFromXp(99), 1);
  });

  it('reaches level 2 at exactly 100 XP', () => {
    assert.equal(levelFromXp(100), 2);
  });

  it('stays at level 2 one XP before level 3', () => {
    assert.equal(levelFromXp(299), 2);
  });

  it('reaches level 3 at exactly 300 XP', () => {
    assert.equal(levelFromXp(300), 3);
  });

  it('gives the right level for a large amount of XP', () => {
    assert.equal(levelFromXp(4500), 10);
    assert.equal(levelFromXp(4499), 9);
  });

  it('agrees with xpForLevel at every threshold (levels 1 to 100)', () => {
    for (let level = 1; level <= 100; level++) {
      const xp = xpForLevel(level);
      assert.equal(levelFromXp(xp), level, `level ${level} should start at ${xp} XP`);
      if (xp > 0) {
        assert.equal(
          levelFromXp(xp - 1),
          level - 1,
          `${xp - 1} XP should still be level ${level - 1}`,
        );
      }
    }
  });

  it('throws a RangeError for negative XP', () => {
    assert.throws(() => levelFromXp(-1), RangeError);
  });

  it('throws a RangeError when the XP is not an integer', () => {
    assert.throws(() => levelFromXp(1.5), RangeError);
    assert.throws(() => levelFromXp('100'), RangeError);
    assert.throws(() => levelFromXp(undefined), RangeError);
  });
});

describe('progressToNextLevel', () => {
  it('shows the progress of a new character (0 XP)', () => {
    assert.deepEqual(progressToNextLevel(0), {
      level: 1,
      currentLevelXp: 0,
      nextLevelXp: 100,
      xpToNextLevel: 100,
    });
  });

  it('shows the progress in the middle of a level', () => {
    assert.deepEqual(progressToNextLevel(150), {
      level: 2,
      currentLevelXp: 100,
      nextLevelXp: 300,
      xpToNextLevel: 150,
    });
  });

  it('starts a new level exactly at its threshold', () => {
    assert.deepEqual(progressToNextLevel(100), {
      level: 2,
      currentLevelXp: 100,
      nextLevelXp: 300,
      xpToNextLevel: 200,
    });
  });

  it('needs 1 XP when the character is one XP away from the next level', () => {
    assert.equal(progressToNextLevel(299).xpToNextLevel, 1);
    assert.equal(progressToNextLevel(299).level, 2);
  });

  it('throws a RangeError for invalid XP', () => {
    assert.throws(() => progressToNextLevel(-1), RangeError);
    assert.throws(() => progressToNextLevel(1.5), RangeError);
  });
});
