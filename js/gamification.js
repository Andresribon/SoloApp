import { XP_BY_DIFF, XP_BY_FREQUENCY, XP_LOSS_MISS, XP_LOSS_EXTRA, PERIOD_MISS_XP_RATE, BASE_XP_NEXT, GROWTH, FLEX_DAYS_PER_WEEK, DAILY_FLEX_THRESHOLD, NON_NEGOTIABLE_XP_RATE, DAILY_COMPLETION_BONUS_RATE } from './state.js';
import { todayLocalISO, parseDateKey, getWeekKey, getMonthKey } from './utils.js';

export const RANKS = [
  { name: 'E', min: 1, max: 14, color: '#9ca3af' }, { name: 'D', min: 15, max: 28, color: '#60a5fa' },
  { name: 'C', min: 29, max: 42, color: '#34d399' }, { name: 'B', min: 43, max: 56, color: '#a3e635' },
  { name: 'A', min: 57, max: 70, color: '#f59e0b' }, { name: 'S', min: 71, max: 84, color: '#f97316' },
  { name: 'Rango Nacional', min: 85, max: 99, color: '#dc2626' }, { name: 'Monarca de las Sombras', min: 100, max: Infinity, color: '#c084fc' }
];

export function getRankByLevel(level) {
  return RANKS.find(rank => level >= rank.min && level <= rank.max) || RANKS[0];
}

function ensureDay(state, date) {
  state.completions[date] ||= { habits: [], nonNegotiables: [] };
  return state.completions[date];
}

function hasCompletion(state, kind, itemId, date) {
  return (state.completions[date]?.[kind] || []).includes(itemId);
}

function getAwardedXp(state, rate) {
  return Math.max(1, Math.round(state.profile.xpToNext * rate));
}

export function xpForNonNegotiable(state) {
  return getAwardedXp(state, NON_NEGOTIABLE_XP_RATE);
}

export function xpForDailyCompletionBonus(state) {
  return getAwardedXp(state, DAILY_COMPLETION_BONUS_RATE);
}

export function addXp(state, amount, onEvent = () => {}) {
  const profile = state.profile;
  const oldRank = getRankByLevel(profile.level).name;
  profile.xp = Math.max(0, profile.xp + Math.trunc(amount));
  while (profile.xp >= profile.xpToNext && profile.level < 100) {
    profile.xp -= profile.xpToNext;
    profile.level += 1;
    profile.xpToNext = Math.floor(BASE_XP_NEXT * Math.pow(GROWTH, profile.level - 1));
    profile.rank = getRankByLevel(profile.level).name;
    state.levelHistory.push({ level: profile.level, date: todayLocalISO(), iso: new Date().toISOString(), rank: profile.rank });
    onEvent({ type: 'level', level: profile.level });
  }
  if (profile.level >= 100) {
    profile.level = 100;
    profile.rank = getRankByLevel(100).name;
    profile.xp = Math.min(profile.xp, profile.xpToNext);
  }
  if (getRankByLevel(profile.level).name !== oldRank) onEvent({ type: 'rank', rank: getRankByLevel(profile.level).name });
  return profile;
}

export function removeXp(state, amount, onEvent = () => {}, date = todayLocalISO()) {
  const profile = state.profile;
  const oldRank = getRankByLevel(profile.level).name;
  let remaining = Math.max(0, Math.trunc(amount));
  let levelsLost = 0;
  while (remaining > 0) {
    if (remaining <= profile.xp) {
      profile.xp -= remaining;
      remaining = 0;
      break;
    }
    remaining -= profile.xp;
    profile.xp = 0;
    if (profile.level <= 1) break;
    profile.level -= 1;
    levelsLost += 1;
    profile.xpToNext = Math.floor(BASE_XP_NEXT * Math.pow(GROWTH, profile.level - 1));
    profile.xp = profile.xpToNext;
  }
  profile.rank = getRankByLevel(profile.level).name;
  if (levelsLost) {
    state.levelHistory.push({ level: profile.level, date, iso: new Date().toISOString(), rank: profile.rank, penalty: true, levelsLost });
    onEvent({ type: 'levelDown', level: profile.level, levelsLost });
  }
  if (profile.rank !== oldRank) onEvent({ type: 'rank', rank: profile.rank });
  return profile;
}

export function applyPenalty(state, date, missedList, onEvent = () => {}) {
  if (!state.penalties.active) {
    state.penalties = { active: true, triggeredAt: date, missedList: [...new Set(missedList)], extraApplied: false, completedTasks: [] };
    addXp(state, -XP_LOSS_MISS, onEvent);
    state.profile.streak = 0;
    onEvent({ type: 'penalty', missedList: state.penalties.missedList });
  } else {
    state.penalties.missedList = [...new Set([...state.penalties.missedList, ...missedList])];
  }
}

function periodCount(state, habit, start, end) {
  let count = 0;
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (hasCompletion(state, 'habits', habit.id, todayLocalISO(cursor))) count += 1;
  }
  return count;
}

export function closeWeekly(state, endedWeek, onEvent = () => {}) {
  const start = parseDateKey(endedWeek);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const missedHabits = [];
  for (const habit of state.habits.filter(item => item.active !== false && item.frequency === 'weekly')) {
    const done = periodCount(state, habit, start, end);
    if (done < Number(habit.weeklyTarget || 1) && habit.lastClosedWeek !== endedWeek) {
      missedHabits.push(habit);
    }
    habit.lastClosedWeek = endedWeek;
  }
  applyPeriodMissPenalty(state, missedHabits, todayLocalISO(end), onEvent);
}

export function closeMonthly(state, endedMonth, onEvent = () => {}) {
  const [year, month] = endedMonth.split('-').map(Number);
  const start = new Date(year, month - 1, 1, 12);
  const end = new Date(year, month, 0, 12);
  const missedHabits = [];
  for (const habit of state.habits.filter(item => item.active !== false && item.frequency === 'monthly')) {
    const done = periodCount(state, habit, start, end);
    if (done < 1 && habit.lastClosedMonth !== endedMonth) {
      missedHabits.push(habit);
    }
    habit.lastClosedMonth = endedMonth;
  }
  applyPeriodMissPenalty(state, missedHabits, todayLocalISO(end), onEvent);
}

function applyPeriodMissPenalty(state, missedHabits, date, onEvent) {
  if (!missedHabits.length) return;
  const lossPerHabit = Math.max(1, Math.round(state.profile.xpToNext * PERIOD_MISS_XP_RATE));
  removeXp(state, lossPerHabit * missedHabits.length, onEvent, date);
  const missedNames = missedHabits.map(habit => `${habit.name} (${habit.frequency === 'weekly' ? 'semanal' : 'mensual'})`);
  applyPenalty(state, date, missedNames, onEvent);
  addDailyWarning(state, date, 'penalty', 0, 'period');
}

export function processPendingDays(state, today = todayLocalISO(), onEvent = () => {}) {
  const last = state.profile.lastProcessedDate || today;
  const cursor = parseDateKey(last);
  const target = parseDateKey(today);
  if (cursor >= target) return;
  cursor.setDate(cursor.getDate() + 1);
  while (cursor < target) {
    const date = todayLocalISO(cursor);
    if (state.penalties.active && !state.penalties.extraApplied) {
      addXp(state, -XP_LOSS_EXTRA, onEvent);
      state.penalties.extraApplied = true;
    }
    const day = state.completions[date] || { habits: [], nonNegotiables: [] };
    const required = [
      ...state.nonNegotiables.filter(item => item.active !== false).map(item => ({ item, kind: 'nonNegotiables' })),
      ...state.habits.filter(item => item.active !== false && item.frequency === 'daily').map(item => ({ item, kind: 'habits' }))
    ];
    const activeNonNegotiables = state.nonNegotiables.filter(item => item.active !== false);
    const dailyHabits = state.habits.filter(item => item.active !== false && item.frequency === 'daily');
    const missedNonNegotiables = activeNonNegotiables.filter(item => !hasCompletion(state, 'nonNegotiables', item.id, date));
    const missedDaily = dailyHabits.filter(item => !hasCompletion(state, 'habits', item.id, date));
    const flexKey = getWeekKey(cursor);
    state.weeklyFlexibility ||= {};
    state.weeklyFlexibility[flexKey] ||= { usedDays: [] };
    const usedDays = state.weeklyFlexibility[flexKey].usedDays;
    let missed = [...missedNonNegotiables.map(item => item.name)];
    if (missedDaily.length) {
      const minimumCompletions = Math.ceil(dailyHabits.length * DAILY_FLEX_THRESHOLD);
      const mayUseFlexDay = missedNonNegotiables.length === 0
        && dailyHabits.length > 0
        && dailyHabits.length - missedDaily.length >= minimumCompletions
        && usedDays.length < FLEX_DAYS_PER_WEEK;
      if (mayUseFlexDay) {
        usedDays.push(date);
        state.heatmap[date] = { complete: true, flexible: true };
        addDailyWarning(state, date, 'flex', usedDays.length);
      } else {
        missed.push(...missedDaily.map(item => item.name));
      }
    }
    if (missed.length) {
      applyPenalty(state, date, missed, onEvent);
      addDailyWarning(state, date, 'penalty', usedDays.length);
    }
    else if (required.length) {
      state.profile.streak += 1;
      state.profile.bestStreak = Math.max(state.profile.bestStreak, state.profile.streak);
      state.heatmap[date] ||= { complete: true };
    }
    const nextDate = new Date(cursor); nextDate.setDate(nextDate.getDate() + 1);
    if (getWeekKey(nextDate) !== getWeekKey(cursor)) closeWeekly(state, getWeekKey(cursor), onEvent);
    if (getMonthKey(nextDate) !== getMonthKey(cursor)) closeMonthly(state, getMonthKey(cursor), onEvent);
    state.profile.lastProcessedDate = date;
    cursor.setDate(cursor.getDate() + 1);
  }
}

function addDailyWarning(state, date, type, usedFlexDays, reason = 'daily') {
  state.dailyWarnings ||= [];
  const existing = state.dailyWarnings.find(warning => warning.date === date);
  if (existing) {
    if (type === 'penalty') {
      existing.type = type;
      existing.remainingFlexDays = Math.max(0, FLEX_DAYS_PER_WEEK - usedFlexDays);
      existing.reason = reason;
    }
    return;
  }
  state.dailyWarnings.push({
    id: date,
    date,
    type,
    reason,
    usedFlexDays,
    remainingFlexDays: Math.max(0, FLEX_DAYS_PER_WEEK - usedFlexDays)
  });
}

export function completePenaltyTasks(state, taskId, checked) {
  const tasks = state.penalties.completedTasks;
  state.penalties.completedTasks = checked ? [...new Set([...tasks, taskId])] : tasks.filter(id => id !== taskId);
  if (state.punishmentTasks.length > 0 && state.punishmentTasks.every(task => state.penalties.completedTasks.includes(task.id))) {
    state.penalties.active = false;
    state.penalties.missedList = [];
    state.dailyWarnings = (state.dailyWarnings || []).filter(warning => warning.type !== 'penalty');
  }
}

export function awaken(state) {
  state.profile.rebirths += 1;
  state.profile.level = 1;
  state.profile.xp = 0;
  state.profile.xpToNext = BASE_XP_NEXT;
  state.profile.rank = getRankByLevel(1).name;
  const shadow = state.shadows.find(item => item.locked);
  if (shadow) {
    Object.assign(shadow, { locked: false, unlocked: true, unlockedAt: new Date().toISOString(), unlockedBy: 'rebirth', rebirthNumber: state.profile.rebirths });
  }
  state.levelHistory.push({ level: 1, date: todayLocalISO(), iso: new Date().toISOString(), rank: state.profile.rank, rebirth: state.profile.rebirths });
  return shadow || null;
}

export function xpForHabit(habit, profile = null) {
  const level = typeof profile === 'number' ? profile : profile?.level || 1;
  const xpToNext = typeof profile === 'object' && profile?.xpToNext
    ? profile.xpToNext
    : Math.floor(BASE_XP_NEXT * Math.pow(GROWTH, Math.max(0, level - 1)));
  const difficultyShare = XP_BY_DIFF[habit.difficulty] || XP_BY_DIFF.medium;
  const frequencyMultiplier = XP_BY_FREQUENCY[habit.frequency] || XP_BY_FREQUENCY.daily;
  return Math.max(1, Math.round(xpToNext * difficultyShare * frequencyMultiplier / 100));
}

export function canLevelUpByDayCompletion() {
  return true;
}
