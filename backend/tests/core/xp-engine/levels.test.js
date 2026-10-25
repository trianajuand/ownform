import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpForLevel, levelFromXp, progressToNextLevel } from '../../../src/core/xp-engine/levels.js';

test('xpForLevel returns 0 for level 1', () => {
  assert.equal(xpForLevel(1), 0);
});