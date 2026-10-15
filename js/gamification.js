import { XP_BY_DIFF, XP_LOSS_MISS, XP_LOSS_EXTRA, XP_LOSS_WEEKLY_MISS, XP_LOSS_MONTHLY_MISS, BASE_XP_NEXT, GROWTH } from './state.js';
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

export function applyPenalty(state, date, missedList, onEvent = () => {}) {
  if (!state.penalties.active) {
    state.penalties = { active: true, triggeredAt: date, missedList, extraApplied: false, completedTasks: [] };
    addXp(state, -XP_LOSS_MISS, onEvent);
    state.profile.streak = 0;
    onEvent({ type: 'penalty', missedList });
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
  for (const habit of state.habits.filter(item => item.active !== false && item.frequency === 'weekly')) {
    const done = periodCount(state, habit, start, end);
    if (done < Number(habit.weeklyTarget || 1) && habit.lastClosedWeek !== endedWeek) {
      addXp(state, -XP_LOSS_WEEKLY_MISS, onEvent);
    }
    habit.lastClosedWeek = endedWeek;
  }
}

export function closeMonthly(state, endedMonth, onEvent = () => {}) {
  const [year, month] = endedMonth.split('-').map(Number);
  const start = new Date(year, month - 1, 1, 12);
  const end = new Date(year, month, 0, 12);
  for (const habit of state.habits.filter(item => item.active !== false && item.frequency === 'monthly')) {
    const done = periodCount(state, habit, start, end);
    if (done < Number(habit.monthlyTarget || 1) && habit.lastClosedMonth !== endedMonth) {
      addXp(state, -XP_LOSS_MONTHLY_MISS, onEvent);
    }
    habit.lastClosedMonth = endedMonth;
  }
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
    const missed = required.filter(({ item, kind }) => !hasCompletion(state, kind, item.id, date)).map(({ item }) => item.name);
    if (missed.length) applyPenalty(state, date, missed, onEvent);
    else if (required.length) {
      state.profile.streak += 1;
      state.profile.bestStreak = Math.max(state.profile.bestStreak, state.profile.streak);
      state.heatmap[date] = { complete: true };
    }
    const nextDate = new Date(cursor); nextDate.setDate(nextDate.getDate() + 1);
    if (getWeekKey(nextDate) !== getWeekKey(cursor)) closeWeekly(state, getWeekKey(cursor), onEvent);
    if (getMonthKey(nextDate) !== getMonthKey(cursor)) closeMonthly(state, getMonthKey(cursor), onEvent);
    state.profile.lastProcessedDate = date;
    cursor.setDate(cursor.getDate() + 1);
  }
}

export function completePenaltyTasks(state, taskId, checked) {
  const tasks = state.penalties.completedTasks;
  state.penalties.completedTasks = checked ? [...new Set([...tasks, taskId])] : tasks.filter(id => id !== taskId);
  if (state.punishmentTasks.length > 0 && state.punishmentTasks.every(task => state.penalties.completedTasks.includes(task.id))) {
    state.penalties.active = false;
    state.penalties.missedList = [];
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

export function xpForHabit(habit) {
  return Number(habit.xp) || XP_BY_DIFF[habit.difficulty] || XP_BY_DIFF.medium;
}

export function canLevelUpByDayCompletion() {
  return true;
}
