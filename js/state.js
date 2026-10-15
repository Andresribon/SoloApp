import { todayLocalISO, id } from './utils.js';

export const XP_BY_DIFF = { easy: 10, medium: 15, hard: 25 };
export const XP_LOSS_MISS = 25;
export const XP_LOSS_EXTRA = 15;
export const XP_LOSS_WEEKLY_MISS = 8;
export const XP_LOSS_MONTHLY_MISS = 8;
export const BASE_XP_NEXT = 100;
export const GROWTH = 1.12;

export const DEFAULT_CATEGORIES = [
  ['Cognitiva', '#8b5cf6', 'brain'], ['Física', '#22c55e', 'pulse'],
  ['Económica', '#f59e0b', 'coin'], ['Espiritual', '#c084fc', 'star'],
  ['Social', '#38bdf8', 'people'], ['Salud', '#fb7185', 'heart']
];

export const SHADOW_POOL = [
  ['shadow-001', 'Igris', 'El Caballero Sanguinario', 'Una de las primeras sombras que Jinwoo logró extraer. Fiel, letal y símbolo de su ascenso.', 'S', '#c084fc'],
  ['shadow-002', 'Iron', 'El General de Acero', 'Una sombra imponente con gran resistencia. Refleja la disciplina forjada a base de misiones.', 'S', '#a3a3a3'],
  ['shadow-003', 'Tank', 'El Coloso', 'Protector incansable. Su presencia refuerza la determinación del Cazador.', 'S', '#22c55e'],
  ['shadow-004', 'Kaisel', 'El Dragón de las Sombras', 'Una de las sombras más majestuosas. Representa el poder que nace tras superar el límite.', 'SS', '#7c3aed'],
  ['shadow-005', 'Beru', 'La Reina de las Hormigas', 'Ágil, cruel y letal. Despierta cuando el cazador cruza el umbral más exigente.', 'SS', '#ef4444'],
  ['shadow-006', 'Bellion', 'El Gran General', 'Una sombra de autoridad absoluta. Solo aquellos que alcanzan el trono del Monarca pueden llamarla.', 'EX', '#c084fc']
].map(([id, name, title, description, tier, glow]) => ({ id, name, title, description, tier, glow, locked: true, unlocked: false, unlockedAt: null, unlockedBy: null, rebirthNumber: null }));

export function createDefaultState() {
  const today = todayLocalISO();
  return {
    schemaVersion: 1,
    profile: { level: 1, xp: 0, xpToNext: BASE_XP_NEXT, rank: 'E', streak: 0, bestStreak: 0, rebirths: 0, lastProcessedDate: today, lastActiveDate: today, createdAt: new Date().toISOString() },
    categories: DEFAULT_CATEGORIES.map(([name, color, icon]) => ({ id: id('category'), name, color, icon })),
    nonNegotiables: [],
    habits: [],
    completions: {},
    levelHistory: [{ level: 1, date: today, iso: new Date().toISOString(), rank: 'E' }],
    penalties: { active: false, triggeredAt: null, missedList: [], extraApplied: false, completedTasks: [] },
    punishmentTasks: [
      { id: id('punishment'), text: '30 flexiones' },
      { id: id('punishment'), text: '10 min lectura' },
      { id: id('punishment'), text: 'Ducha fría' }
    ],
    settings: { notifications: { enabled: false, dailyTime: '20:00', permission: 'default' }, penalty: {}, xpTable: { ...XP_BY_DIFF }, level: { base: BASE_XP_NEXT, growth: GROWTH }, ranks: {}, onboardingDone: false, reduceMotion: false, themeColor: '#0a0612' },
    shadows: SHADOW_POOL.map(shadow => ({ ...shadow })),
    heatmap: {}
  };
}

export const defaultState = createDefaultState();
