import { createDefaultState, SHADOW_POOL } from './state.js';

export const STORAGE_KEY = 'sistema_v1';

export function migrate(input) {
  const base = createDefaultState();
  const data = input && typeof input === 'object' ? input : {};
  const version = Number(data.schemaVersion || 0);
  const result = { ...base, ...data, schemaVersion: 1 };
  result.profile = { ...base.profile, ...(data.profile || {}) };
  result.settings = { ...base.settings, ...(data.settings || {}), notifications: { ...base.settings.notifications, ...(data.settings?.notifications || {}) } };
  result.categories = Array.isArray(data.categories) ? data.categories : base.categories;
  result.habits = Array.isArray(data.habits) ? data.habits : [];
  result.nonNegotiables = Array.isArray(data.nonNegotiables) ? data.nonNegotiables : [];
  result.completions = data.completions && typeof data.completions === 'object' ? data.completions : {};
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
