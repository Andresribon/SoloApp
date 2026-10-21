import { createDefaultState, SHADOW_POOL } from './state.js';
import { id } from './utils.js';

export const STORAGE_KEY = 'sistema_v1';

export function migrate(input) {
  const base = createDefaultState();
  const data = input && typeof input === 'object' ? input : {};
  const version = Number(data.schemaVersion || 0);
  const result = { ...base, ...data, schemaVersion: 1 };
  result.profile = { ...base.profile, ...(data.profile || {}) };
  result.settings = { ...base.settings, ...(data.settings || {}) };
  delete result.settings.notifications;
  result.categories = Array.isArray(data.categories) ? data.categories : base.categories;
  result.habits = Array.isArray(data.habits) ? data.habits : [];
  result.nonNegotiables = Array.isArray(data.nonNegotiables) ? data.nonNegotiables : [];
  result.completions = data.completions && typeof data.completions === 'object' ? data.completions : {};
  result.weeklyFlexibility = Object.fromEntries(Object.entries(data.weeklyFlexibility && typeof data.weeklyFlexibility === 'object' ? data.weeklyFlexibility : {})
    .map(([week, record]) => [week, { ...(record && typeof record === 'object' ? record : {}), usedDays: Array.isArray(record?.usedDays) ? record.usedDays : [] }]));
  result.dailyWarnings = Array.isArray(data.dailyWarnings)
    ? data.dailyWarnings
      .filter(warning => warning && typeof warning === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(warning.date) && ['flex', 'penalty'].includes(warning.type))
      .map(warning => ({
        id: warning.date,
        date: warning.date,
        type: warning.type,
        reason: ['period', 'daily'].includes(warning.reason) ? warning.reason : 'daily',
        remainingFlexDays: Number.isInteger(warning.remainingFlexDays) ? warning.remainingFlexDays : 0
      }))
    : [];
  const weeklySkill = data.weeklySkill && typeof data.weeklySkill === 'object' ? data.weeklySkill : {};
  result.weeklySkill = {
    current: normalizeWeeklySkillWeek(weeklySkill.current, base.weeklySkill.current),
    history: Array.isArray(weeklySkill.history)
      ? weeklySkill.history.map(entry => normalizeWeeklySkillWeek(entry, null)).filter(Boolean)
      : []
  };
  result.levelHistory = Array.isArray(data.levelHistory) ? data.levelHistory : base.levelHistory;
  result.punishmentTasks = Array.isArray(data.punishmentTasks) ? data.punishmentTasks : base.punishmentTasks;
  result.penalties = { ...base.penalties, ...(data.penalties || {}) };
  result.shadows = Array.isArray(data.shadows) && data.shadows.length
    ? SHADOW_POOL.map(defaultShadow => ({ ...defaultShadow, ...(data.shadows.find(shadow => shadow.id === defaultShadow.id) || {}) }))
    : SHADOW_POOL.map(shadow => ({ ...shadow }));
  result.heatmap = data.heatmap && typeof data.heatmap === 'object' ? data.heatmap : {};
  if (version < 1) result.schemaVersion = 1;
  return result;
}

function normalizeWeeklySkillWeek(week, fallback) {
  if (!week || typeof week !== 'object') return fallback;
  const weekKey = typeof week.weekKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(week.weekKey)
    ? week.weekKey
    : fallback?.weekKey || null;
  const legacySkill = typeof week.title === 'string' && week.title.trim()
    ? [{ id: id('skill'), title: week.title, description: week.description }]
    : [];
  const sourceSkills = Array.isArray(week.skills) ? week.skills : legacySkill;
  const skills = sourceSkills
    .filter(skill => skill && typeof skill.title === 'string' && skill.title.trim())
    .map(skill => ({
      id: typeof skill.id === 'string' && skill.id ? skill.id : id('skill'),
      title: skill.title.trim().slice(0, 120),
      description: typeof skill.description === 'string' ? skill.description.trim().slice(0, 2000) : '',
      completed: skill.completed === true,
      ...(typeof skill.carriedFromWeek === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(skill.carriedFromWeek)
        ? { carriedFromWeek: skill.carriedFromWeek }
        : {})
    }));
  if (!weekKey && !skills.length) return fallback;
  return { weekKey, skills };
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    return migrate(JSON.parse(raw));
  } catch (error) {
    console.error('[SISTEMA] No se pudieron leer los datos locales.', error);
    return createDefaultState();
  }
}

export function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error('[SISTEMA] No se pudieron guardar los datos locales.', error);
    return false;
  }
}
