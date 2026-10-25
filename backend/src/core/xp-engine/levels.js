// How much xp you need to level up to specific level
export function xpForLevel(level) {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError('Level must be an integer of 1 or more');
  }

  return 50 * level * (level - 1);
}

//What level are you based on your acumulated xp
export function levelFromXp(xp) {
  if (!Number.isInteger(xp) || xp < 0) {
    throw new RangeError('XP must be a non-negative integer');
  }

  return Math.floor((1 + Math.sqrt(1 + 0.08 * xp)) / 2);
}

//returns a object with level, the current xp level, the xp to the next level and how many xp need to the next level
export function progressToNextLevel(xp) {
  const level = levelFromXp(xp);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const xpToNextLevel = nextLevelXp - xp;
  return {
    level: level,
    currentLevelXp: currentLevelXp,
    nextLevelXp: nextLevelXp,
    xpToNextLevel: xpToNextLevel,
  };
}
