export function todayLocalISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function id(prefix = 'id') {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

export function parseDateKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function formatDateKey(date) {
  return todayLocalISO(date);
}

export function startOfWeekMonday(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

export function getWeekKey(date) {
  return formatDateKey(startOfWeekMonday(date));
}

export function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function dateLabel(key, options = { day: 'numeric', month: 'short' }) {
  return parseDateKey(key).toLocaleDateString('es-ES', options);
}
