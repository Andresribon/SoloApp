import { element, id, todayLocalISO, dateLabel, parseDateKey, getWeekKey, getMonthKey, clamp } from './utils.js';
import { icon } from './icons.js';
import { FLEX_DAYS_PER_WEEK, DAILY_FLEX_THRESHOLD, NON_NEGOTIABLE_XP_RATE, DAILY_COMPLETION_BONUS_RATE } from './state.js';
import { getRankByLevel, addXp, xpForHabit, xpForNonNegotiable, xpForDailyCompletionBonus, completePenaltyTasks, awaken, getHabitPeriodProgress } from './gamification.js';
import { migrate } from './storage.js';

let state;
let persist;
let notifyEvent;
let currentView = 'home';
let currentFrequency = 'all';
let currentCategory = 'all';
let currentHabitSection = 'missions';
let habitFrequencyOpen = { daily: true, weekly: false, monthly: false };
let toastTimer;
let epicQueue = [];
let epicShowing = false;
let penaltyKeyboardTrapInstalled = false;

export function initUI(appState, saveState, eventHandler) {
  state = appState;
  persist = saveState;
  notifyEvent = eventHandler;
  syncWeeklySkill();
  const navIcons = { home: 'home', habits: 'check', 'weekly-skill': 'brain', stats: 'stats', shadows: 'shadows', settings: 'gear' };
  document.querySelectorAll('.nav-item').forEach(button => {
    const placeholder = button.querySelector('.icon');
    if (placeholder) placeholder.replaceWith(icon(navIcons[button.dataset.view], `icon icon-${navIcons[button.dataset.view]}`));
  });
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
  document.querySelector('.brand')?.addEventListener('click', event => { event.preventDefault(); navigate('home'); });
  if (!penaltyKeyboardTrapInstalled) {
    document.addEventListener('keydown', keepPenaltyModalLocked);
    penaltyKeyboardTrapInstalled = true;
  }
  renderAll();
}

export function updateState(nextState) {
  state = nextState;
  renderAll();
}

export function navigate(name) {
  if (state.penalties.active) return;
  currentView = name;
  document.querySelectorAll('.view').forEach(view => {
    const active = view.id === `view-${name}`;
    view.hidden = !active;
    view.classList.toggle('active', active);
  });
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  renderCurrent();
  window.scrollTo({ top: 0, behavior: state.settings.reduceMotion ? 'auto' : 'smooth' });
}

function renderAll() {
  const previousPositions = currentView === 'home' && !shouldReduceMotion()
    ? captureHomeQuestPositions()
    : null;
  renderCurrent();
  if (previousPositions) animateHomeQuestReorder(previousPositions);
}

function shouldReduceMotion() {
  return Boolean(state.settings.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function captureHomeQuestPositions() {
  return new Map([...document.querySelectorAll('#view-home .quest-row[data-home-order-key]')].map(row => [
    row.dataset.homeOrderKey,
    {
      top: row.getBoundingClientRect().top,
      group: row.dataset.homeOrderGroup,
      completed: row.dataset.homeCompleted === 'true'
    }
  ]));
}

function animateHomeQuestReorder(previousPositions) {
  if (shouldReduceMotion()) return;
  for (const row of document.querySelectorAll('#view-home .quest-row[data-home-order-key]')) {
    const previous = previousPositions.get(row.dataset.homeOrderKey);
    if (!previous || previous.group !== row.dataset.homeOrderGroup || typeof row.animate !== 'function') continue;
    const offset = previous.top - row.getBoundingClientRect().top;
    if (Math.abs(offset) < 1) continue;

    const completedNow = !previous.completed && row.dataset.homeCompleted === 'true';
    row.animate([
      {
        transform: `translateY(${offset}px) scale(${completedNow ? 0.98 : 1})`,
        filter: completedNow ? 'brightness(1.45)' : 'brightness(1.12)',
        boxShadow: '0 0 18px rgba(168, 85, 247, .36)'
      },
      {
        transform: 'translateY(0) scale(1)',
        filter: 'brightness(1)',
        boxShadow: '0 0 0 rgba(168, 85, 247, 0)'
      }
    ], {
      duration: completedNow ? 620 : 500,
      easing: 'cubic-bezier(.22, 1, .36, 1)'
    });
  }
}

function renderCurrent() {
  syncWeeklySkill();
  if (state.penalties.active) {
    currentView = 'home';
    document.querySelectorAll('.view').forEach(view => {
      const active = view.id === 'view-home';
      view.hidden = !active;
      view.classList.toggle('active', active);
    });
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === 'home'));
    renderHome();
    renderPenaltyModal();
    return;
  }
  const modalRoot = document.getElementById('modal-root');
  if (modalRoot.querySelector('.penalty-overlay')) {
    modalRoot.replaceChildren();
    document.querySelector('.app-shell').inert = false;
    document.body.classList.remove('penalty-open');
  }
  const renderers = { home: renderHome, habits: renderHabits, 'weekly-skill': renderWeeklySkill, stats: renderStats, shadows: renderShadows, settings: renderSettings };
  renderers[currentView]();
}

function syncWeeklySkill() {
  const weekKey = getWeekKey(parseDateKey(todayLocalISO()));
  state.weeklySkill ||= { current: { weekKey, title: '', description: '' }, history: [] };
  state.weeklySkill.history ||= [];
  if (!state.weeklySkill.current || state.weeklySkill.current.weekKey !== weekKey) {
    const previous = state.weeklySkill.current;
    let carryOver = [];
    if (previous?.skills?.length) {
      state.weeklySkill.history = state.weeklySkill.history.filter(entry => entry.weekKey !== previous.weekKey);
      state.weeklySkill.history.push({
        ...previous,
        skills: previous.skills.map(skill => ({ ...skill, completed: skill.completed === true }))
      });
      carryOver = previous.skills
        .filter(skill => skill.completed !== true)
        .map(skill => ({ ...skill, completed: false, carriedFromWeek: previous.weekKey }));
    }
    state.weeklySkill.current = { weekKey, skills: carryOver };
    persist();
  }
}

function heading(title, eyebrow = 'VENTANA DE ESTADO') {
  const wrap = element('div', 'section-heading');
  const titleNode = element('h1', 'view-title', title);
  titleNode.id = `${currentView}-title`;
  wrap.append(element('p', 'eyebrow', eyebrow), titleNode);
  return wrap;
}

function button(text, className, action, iconName) {
  const node = element('button', `button ${className || ''}`, '');
  if (iconName) node.append(icon(iconName));
  node.append(document.createTextNode(text));
  if (action) node.addEventListener('click', action);
  return node;
}

function panel(title, subtitle) {
  const node = element('article', 'panel');
  const header = element('div', 'panel-heading');
  header.append(element('h2', 'panel-title', title));
  if (subtitle) header.append(element('span', 'muted small', subtitle));
  node.append(header);
  return node;
}

function progressCount(item, date = todayLocalISO()) {
  if (item.frequency === 'weekly' || item.frequency === 'monthly') {
    const progress = getHabitPeriodProgress(state, item, date);
    return { ...progress, label: item.frequency === 'weekly' ? 'esta semana' : 'este mes' };
  }
  return { count: state.completions[date]?.habits?.includes(item.id) ? 1 : 0, target: 1, label: 'hoy' };
}

function isDone(kind, itemId, date = todayLocalISO()) {
  return (state.completions[date]?.[kind] || []).includes(itemId);
}

function toggleCompletion(kind, item, checked) {
  const date = todayLocalISO();
  const alreadyCompleted = (state.completions[date]?.[kind] || []).includes(item.id);
  if (!checked || alreadyCompleted) return;
  state.completions[date] ||= { habits: [], nonNegotiables: [] };
  const day = state.completions[date];
  let earnedXp = 0;
  day.xpAwards ||= { habits: {}, nonNegotiables: {}, dailyBonus: null };
  day.xpAwards.habits ||= {};
  day.xpAwards.nonNegotiables ||= {};
  if (kind === 'habits') {
    if (item.frequency === 'weekly' || item.frequency === 'monthly') {
      earnedXp = recordPeriodHabitProgress(item, 1).earnedXp;
    } else {
      day[kind].push(item.id);
      const award = day.xpAwards.habits[item.id];
      if (!award) {
        earnedXp = xpForHabit(item, state.profile);
        day.xpAwards.habits[item.id] = { amount: earnedXp, active: true };
        day.xpByHabit ||= {};
        day.xpByHabit[item.id] = earnedXp;
        addXp(state, earnedXp, notifyEvent);
      } else if (award.active) earnedXp = award.amount;
      item.history ||= {};
      item.history[date] = true;
    }
  } else {
    day[kind].push(item.id);
    const award = day.xpAwards.nonNegotiables[item.id];
    if (!award) {
      earnedXp = xpForNonNegotiable(state);
      day.xpAwards.nonNegotiables[item.id] = { amount: earnedXp, active: true };
      day.xpByNonNegotiable ||= {};
      day.xpByNonNegotiable[item.id] = earnedXp;
      addXp(state, earnedXp, notifyEvent);
    } else if (award.active) earnedXp = award.amount;
    item.history ||= {};
    item.history[date] = true;
  }
  state.profile.lastActiveDate = date;
  state.heatmap[date] = { complete: true };
  const bonusXp = kind === 'nonNegotiables' || item.frequency === 'daily'
    ? updateDailyCompletionBonus(day)
    : 0;
  if (kind === 'habits') {
    if (item.frequency === 'weekly' || item.frequency === 'monthly') {
      const progress = getHabitPeriodProgress(state, item, date);
      toast(earnedXp
        ? `Objetivo completado · ${progress.count}/${progress.target} ${progress.label} · +${earnedXp} XP`
        : `Progreso guardado · ${progress.count}/${progress.target} ${progress.label} · la recompensa llega al completar el objetivo`);
    } else {
      toast(`Misión completada · +${earnedXp} XP${bonusXp ? ` · bonus +${Math.round(DAILY_COMPLETION_BONUS_RATE * 100)}%` : ''}`);
    }
  } else {
    toast(`No negociable completado · +${Math.round(NON_NEGOTIABLE_XP_RATE * 100)}% del XP requerido para este nivel${bonusXp ? ` · bonus +${Math.round(DAILY_COMPLETION_BONUS_RATE * 100)}%` : ''}`);
  }
  persist();
  renderAll();
}

function recordPeriodHabitProgress(item, requestedUnits) {
  const date = todayLocalISO();
  const before = getHabitPeriodProgress(state, item, date);
  const unitsToAdd = Math.min(Math.max(0, before.target - before.count), requestedUnits);
  if (!unitsToAdd) return { earnedXp: 0, count: before.count, target: before.target };

  state.completions[date] ||= { habits: [], nonNegotiables: [] };
  const day = state.completions[date];
  day.habits ||= [];
  day.habitUnits ||= {};
  item.periodTargets ||= {};
  item.periodTargets[before.periodKey] ||= before.target;
  const existingUnits = Number(day.habitUnits[item.id])
    || (day.habits.includes(item.id) ? 1 : 0);
  day.habitUnits[item.id] = existingUnits + unitsToAdd;
  if (!day.habits.includes(item.id)) day.habits.push(item.id);
  item.history ||= {};
  item.history[date] = true;

  const progress = { count: before.count + unitsToAdd, target: before.target, periodKey: before.periodKey };
  if (item.frequency === 'weekly') {
    item.weeklyProgress ||= {};
    item.weeklyProgress[progress.periodKey] = progress.count;
  } else {
    item.monthlyProgress ||= {};
    item.monthlyProgress[progress.periodKey] = progress.count;
  }

  let earnedXp = 0;
  item.periodAwards ||= {};
  if (progress.count >= progress.target && !item.periodAwards[progress.periodKey]) {
    earnedXp = xpForHabit(item, state.profile);
    item.periodAwards[progress.periodKey] = { amount: earnedXp, active: true };
    addXp(state, earnedXp, notifyEvent);
  }
  return { earnedXp, count: progress.count, target: progress.target };
}

function updateDailyCompletionBonus(day) {
  day.xpAwards ||= { habits: {}, nonNegotiables: {}, dailyBonus: null };
  const dailyHabits = state.habits.filter(habit => habit.active !== false && habit.frequency === 'daily');
  const nonNegotiables = state.nonNegotiables.filter(item => item.active !== false);
  const requiredCount = dailyHabits.length + nonNegotiables.length;
  const allComplete = requiredCount > 0
    && dailyHabits.every(habit => day.habits.includes(habit.id))
    && nonNegotiables.every(item => day.nonNegotiables.includes(item.id));
  const award = day.xpAwards.dailyBonus;
  if (allComplete && !award) {
    const amount = xpForDailyCompletionBonus(state);
    day.xpAwards.dailyBonus = { amount, active: true, claimed: true };
    addXp(state, amount, notifyEvent);
    return amount;
  }
  return 0;
}

function renderHome() {
  const root = document.getElementById('view-home');
  root.replaceChildren();
  const rank = getRankByLevel(state.profile.level);
  const xpPercent = state.profile.level >= 100 ? 100 : clamp((state.profile.xp / state.profile.xpToNext) * 100, 0, 100);
  root.append(heading('Ventana de Estado', 'PROTOCOLO ACTIVO'));
  const player = element('section', 'player-card panel');
  const levelLine = element('div', 'player-top');
  const levelBlock = element('div');
  levelBlock.append(element('span', 'eyebrow', 'NIVEL ACTUAL'), element('div', 'level-number', String(state.profile.level)));
  const rankBadge = element('div', `rank-badge ${state.profile.level === 100 ? 'monarch' : ''}`);
  rankBadge.style.setProperty('--rank-color', rank.color);
  rankBadge.append(element('span', 'eyebrow', 'RANGO'), element('strong', '', rank.name));
  levelLine.append(levelBlock, rankBadge);
  const xpRow = element('div', 'xp-label');
  xpRow.append(element('span', '', 'EXPERIENCIA'), element('span', '', `${state.profile.xp} / ${state.profile.xpToNext} XP`));
  const xpTrack = element('div', 'xp-track');
  const xpFill = element('span', 'xp-fill');
  xpFill.style.width = `${xpPercent}%`;
  xpTrack.append(xpFill);
  const streaks = element('div', 'metrics-row');
  streaks.append(metric('Racha actual', `${state.profile.streak} días`), metric('Mejor racha', `${state.profile.bestStreak} días`), metric('Renacimientos', String(state.profile.rebirths)));
  player.append(levelLine, xpRow, xpTrack, streaks);
  root.append(player);
  if (state.profile.level >= 100) {
    const awakenButton = button('DESPERTAR / REINICIAR NIVEL', 'button-primary awaken-button', confirmAwaken, 'crown');
    awakenButton.setAttribute('aria-label', 'Despertar y reiniciar el nivel');
    root.append(awakenButton);
  }
  if (state.weeklySkill.current.skills.length) {
    const multipleSkills = state.weeklySkill.current.skills.length > 1;
    const skillPanel = panel(multipleSkills ? 'Habilidades de la semana' : 'Habilidad de la semana', weekRangeLabel(state.weeklySkill.current.weekKey));
    skillPanel.classList.add('weekly-skill-home-panel');
    state.weeklySkill.current.skills.forEach(skill => skillPanel.append(renderHomeSkillButton(skill)));
    root.append(skillPanel);
  }
  if (state.dailyWarnings?.length) root.append(renderDailyWarnings());
  const missionPanel = panel('Misiones de hoy', todayLocalISO());
  const dailyItems = state.habits.filter(habit => habit.active !== false && habit.frequency === 'daily');
  const weeklyItems = state.habits.filter(habit => habit.active !== false && habit.frequency === 'weekly');
  const monthlyItems = state.habits.filter(habit => habit.active !== false && habit.frequency === 'monthly');
  const nonNeg = state.nonNegotiables.filter(item => item.active !== false);
  const date = todayLocalISO();
  const weekKey = getWeekKey(parseDateKey(date));
  const usedFlexDays = state.weeklyFlexibility?.[weekKey]?.usedDays?.length || 0;
  const doneDailyCount = dailyItems.filter(item => isDone('habits', item.id, date)).length;
  const minimumDailyCount = Math.ceil(dailyItems.length * DAILY_FLEX_THRESHOLD);
  const flexStatus = element('div', 'flexibility-status');
  flexStatus.append(
    element('strong', '', `Flexibilidad semanal · ${usedFlexDays}/${FLEX_DAYS_PER_WEEK} días usados`),
    element('span', 'muted small', dailyItems.length
      ? `${doneDailyCount}/${dailyItems.length} hábitos diarios hoy. En un día flexible basta con ${minimumDailyCount}/${dailyItems.length}; todos los no negociables siguen siendo obligatorios.`
      : 'Los días flexibles aplican cuando hay hábitos diarios; todos los no negociables siguen siendo obligatorios.')
  );
  missionPanel.append(flexStatus);
  missionPanel.append(element('h3', 'eyebrow mission-group-label', 'NO NEGOCIABLES'));
  if (nonNeg.length) {
    const orderedNonNegotiables = nonNeg
      .map((item, index) => ({ item, index, completed: isDone('nonNegotiables', item.id, date) }))
      .sort((a, b) => Number(a.completed) - Number(b.completed) || a.index - b.index);
    orderedNonNegotiables.forEach(({ item }) => missionPanel.append(renderQuest(item, 'nonNegotiables', true, 'non-negotiables')));
  }
  else missionPanel.append(emptyText('Aún no has definido misiones no negociables.'));
  missionPanel.append(element('h3', 'eyebrow mission-group-label', 'HÁBITOS DIARIOS'));
  if (dailyItems.length) appendCategorizedHabitQuests(missionPanel, dailyItems);
  else missionPanel.append(emptyText('No hay hábitos diarios activos.'));
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 12);
  missionPanel.append(element('p', 'muted small daily-bonus-hint', `Bonus diario: ${Math.round(DAILY_COMPLETION_BONUS_RATE * 100)}% del requisito de XP del nivel actual al completar todos los hábitos diarios y no negociables. Solo se obtiene una vez por día.`));
  root.append(missionPanel);
  root.append(renderHomePeriodPanel('weekly', 'Hábitos semanales', 'CIERRE DOMINGO', weeklyItems));
  root.append(renderHomePeriodPanel('monthly', 'Hábitos mensuales', `CIERRE ${dateLabel(todayLocalISO(monthEnd)).toLocaleUpperCase('es-ES')}`, monthlyItems));
  const addRow = element('div', 'action-row');
  addRow.append(button('Añadir hábito', 'button-secondary', () => openHabitForm()), button('Añadir no negociable', 'button-secondary', () => openNonNegotiableForm()));
  root.append(addRow);
}

function renderHomeSkillButton(skill) {
  const skillCard = button('', 'weekly-skill-home', () => navigate('weekly-skill'), 'brain');
  skillCard.setAttribute('aria-label', `Habilidad de la semana: ${skill.title}. Abrir habilidades`);
  const skillCopy = element('span', 'weekly-skill-home-copy');
  skillCopy.append(element('span', 'eyebrow', 'ENFOQUE SEMANAL'), element('strong', '', skill.title));
  skillCard.append(skillCopy);
  return skillCard;
}

function renderHomePeriodPanel(period, title, deadline, items) {
  const section = panel(title, deadline);
  section.classList.add('home-period-panel');
  if (items.length) appendCategorizedHabitQuests(section, items);
  else section.append(emptyText(`No hay ${period === 'weekly' ? 'hábitos semanales' : 'hábitos mensuales'} activos.`));
  return section;
}

function appendCategorizedHabitQuests(container, items) {
  const knownCategories = state.categories
    .map(category => ({
      category,
      habits: items.filter(habit => habit.categoryId === category.id)
    }))
    .filter(group => group.habits.length);
  const uncategorized = items.filter(habit => !state.categories.some(category => category.id === habit.categoryId));
  if (uncategorized.length) knownCategories.push({ category: null, habits: uncategorized });

  for (const { category, habits } of knownCategories) {
    const group = element('section', 'habit-category-group home-habit-category-group');
    group.dataset.orderGroup = `${habits[0].frequency}:${category?.id || 'uncategorized'}`;
    const categoryHeading = element('h3', 'habit-category-heading');
    if (category) {
      const marker = element('span', 'category-dot');
      marker.style.backgroundColor = category.color;
      categoryHeading.append(marker, element('span', '', category.name));
    } else {
      categoryHeading.append(element('span', '', 'Sin categoría'));
    }
    group.append(categoryHeading);
    const orderedHabits = habits
      .map((habit, index) => ({ habit, index, completed: isHomeHabitCompleted(habit) }))
      .sort((a, b) => Number(a.completed) - Number(b.completed) || a.index - b.index);
    orderedHabits.forEach(({ habit }) => appendHabitQuest(group, habit));
    container.append(group);
  }
}

function isHomeHabitCompleted(habit, date = todayLocalISO()) {
  if (habit.frequency === 'daily') return isDone('habits', habit.id, date);
  const progress = getHabitPeriodProgress(state, habit, date);
  return progress.count >= progress.target;
}

function renderWeeklySkill() {
  const root = document.getElementById('view-weekly-skill');
  root.replaceChildren();
  root.append(heading('Habilidad de la semana', 'ENTRENAMIENTO DEL CAZADOR'));
  const current = state.weeklySkill.current;
  const currentPanel = panel('Enfoques actuales', weekRangeLabel(current.weekKey));
  currentPanel.append(button('Añadir habilidad', 'button-primary', () => openWeeklySkillForm(), 'brain'));
  const canMarkCompleted = parseDateKey(todayLocalISO()).getDay() === 0;
  if (current.skills.length) {
    for (const skill of current.skills) currentPanel.append(renderWeeklySkillCard(skill, false, canMarkCompleted));
  } else {
    currentPanel.append(emptyText('Todavía no has añadido una habilidad para esta semana.'));
  }
  root.append(currentPanel);
  const previousWeekKey = getWeekKey(parseDateKey(current.weekKey));
  const previousMonday = parseDateKey(previousWeekKey);
  previousMonday.setDate(previousMonday.getDate() - 7);
  const previousKey = todayLocalISO(previousMonday);
  const previous = state.weeklySkill.history.find(entry => entry.weekKey === previousKey);
  const previousPanel = panel('Habilidades de la semana pasada', weekRangeLabel(previousKey));
  if (previous?.skills.length) previous.skills.forEach(skill => previousPanel.append(renderWeeklySkillCard(skill, true)));
  else previousPanel.append(emptyText('Todavía no hay habilidades guardadas para la semana pasada.'));
  root.append(previousPanel);
}

function renderWeeklySkillCard(skill, readOnly, canMarkCompleted = false) {
  const card = element('article', 'weekly-skill-card');
  card.append(element('h3', 'weekly-skill-title', skill.title));
  card.append(element('p', 'muted weekly-skill-description', skill.description || 'Sin descripción.'));
  if (readOnly) {
    card.append(element('p', `weekly-skill-status ${skill.completed ? 'completed' : 'pending'}`,
      skill.completed ? 'HABILIDAD COMPLETADA' : 'PENDIENTE · TRASLADADA A ESTA SEMANA'));
  } else if (canMarkCompleted) {
    const completion = checkboxControl('Completé esta habilidad esta semana', skill.completed === true);
    completion.wrapper.classList.add('weekly-skill-completion');
    completion.input.addEventListener('change', () => {
      skill.completed = completion.input.checked;
      persist();
      renderWeeklySkill();
      toast(skill.completed ? 'Habilidad marcada como completada.' : 'Se actualizó el estado de la habilidad.');
    });
    card.append(completion.wrapper);
  } else {
    card.append(element('p', 'muted small weekly-skill-deadline', 'El domingo podrás marcar si completaste esta habilidad.'));
  }
  if (!readOnly && skill.carriedFromWeek) {
    card.append(element('p', 'muted small weekly-skill-carried', 'Pendiente de la semana anterior; se conservará hasta completarla.'));
  }
  if (!readOnly) {
    const actions = element('div', 'item-actions');
    actions.append(
      button('Editar', 'button-small', () => openWeeklySkillForm(skill)),
      button('Eliminar', 'button-small danger-text', () => confirmAction(`¿Eliminar la habilidad “${skill.title}”?`, () => {
        state.weeklySkill.current.skills = state.weeklySkill.current.skills.filter(item => item.id !== skill.id);
        persist();
        renderWeeklySkill();
      }))
    );
    card.append(actions);
  }
  return card;
}

function openWeeklySkillForm(existing) {
  const form = element('form', 'modal-form weekly-skill-form');
  const title = inputControl('Habilidad que quieres aprender', 'text', existing?.title || '', true);
  title.input.maxLength = 120;
  title.input.placeholder = 'Ej. Cocinar recetas saludables';
  const description = textareaControl('Descripción y plan de aprendizaje', existing?.description || '');
  description.input.maxLength = 2000;
  description.input.placeholder = '¿Qué quieres aprender y cómo vas a practicarlo esta semana?';
  form.append(title.wrapper, description.wrapper);
  showModal(existing ? 'Editar habilidad semanal' : 'Añadir habilidad semanal', form, existing ? 'Guardar cambios' : 'Guardar habilidad', () => {
    const cleanTitle = title.input.value.trim();
    if (!cleanTitle) {
      toast('Escribe el nombre de la habilidad que quieres aprender.');
      return false;
    }
    const skill = {
      id: existing?.id || id('skill'),
      title: cleanTitle.slice(0, 120),
      description: description.input.value.trim().slice(0, 2000),
      completed: existing?.completed === true,
      ...(existing?.carriedFromWeek ? { carriedFromWeek: existing.carriedFromWeek } : {})
    };
    if (existing) Object.assign(existing, skill);
    else state.weeklySkill.current.skills.push(skill);
    persist();
    renderWeeklySkill();
    toast(existing ? 'Cambios guardados.' : 'Habilidad añadida.');
    return true;
  });
}

function weekRangeLabel(weekKey) {
  if (!weekKey) return '';
  const monday = parseDateKey(weekKey);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return `${dateLabel(todayLocalISO(monday))} – ${dateLabel(todayLocalISO(sunday))}`;
}

function metric(label, value) {
  const box = element('div', 'metric');
  box.append(element('span', 'muted small', label), element('strong', '', value));
  return box;
}

function renderQuest(item, kind, mandatory = false, homeOrderGroup = '') {
  const periodProgress = kind === 'habits' && (item.frequency === 'weekly' || item.frequency === 'monthly')
    ? getHabitPeriodProgress(state, item)
    : null;
  const completedToday = isDone(kind, item.id);
  const completedPeriod = Boolean(periodProgress && periodProgress.count >= periodProgress.target);
  const checked = completedToday || completedPeriod;
  const row = element('label', `quest-row ${mandatory ? 'mandatory' : ''} ${checked ? 'completed' : ''}`);
  row.dataset.homeOrderKey = `${kind}:${item.id}`;
  row.dataset.homeOrderGroup = homeOrderGroup;
  row.dataset.homeCompleted = String(periodProgress ? completedPeriod : completedToday);
  const checkbox = element('input', 'quest-check');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.disabled = checked;
  checkbox.setAttribute('aria-label', completedPeriod
    ? `${item.name}, objetivo cumplido este periodo`
    : completedToday ? `${item.name}, completado hoy` : `Completar ${item.name}`);
  checkbox.addEventListener('change', () => toggleCompletion(kind, item, checkbox.checked));
  const mark = element('span', 'custom-check');
  const content = element('span', 'quest-content');
  content.append(element('strong', '', item.name));
  if (item.description) content.append(element('span', 'muted small', item.description));
  const meta = element('span', 'quest-meta');
  if (mandatory) {
    meta.append(element('span', 'mandatory-badge', 'OBLIGATORIO'));
    meta.append(element('span', 'muted small', `+${Math.round(NON_NEGOTIABLE_XP_RATE * 100)}% del XP requerido para este nivel`));
  }
  else {
    if (periodProgress) {
      const label = item.frequency === 'weekly' ? 'esta semana' : 'este mes';
      meta.append(element('span', 'period-count', `${periodProgress.count}/${periodProgress.target}`), element('span', 'muted tiny', label));
    }
    meta.append(element('span', 'muted small', `+${xpForHabit(item, state.profile)} XP`));
  }
  row.append(checkbox, mark, content, meta);
  return row;
}

function appendHabitQuest(container, item) {
  const row = element('div', 'period-quest-row');
  row.append(renderQuest(item, 'habits', false, container.dataset.orderGroup));
  container.append(row);
}

function renderPenaltyModal() {
  const root = document.getElementById('modal-root');
  root.replaceChildren();
  const overlay = element('div', 'penalty-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'penalty-title');
  overlay.setAttribute('aria-describedby', 'penalty-description');
  overlay.setAttribute('aria-live', 'assertive');
  overlay.tabIndex = -1;
  const content = element('section', 'penalty-dialog');
  content.append(icon('warning', 'penalty-symbol'));
  const periodPenalty = state.penalties.missedList.some(name => /\((semanal|mensual)\)$/.test(name));
  const title = element('h1', '', periodPenalty
    ? '[SISTEMA] No completaste tus misiones del periodo. Misión de penalización activada.'
    : '[SISTEMA] No cumpliste tus misiones diarias. Misión de penalización activada.');
  title.id = 'penalty-title';
  const description = element('p', 'penalty-description', 'Completa todas las misiones de castigo para continuar. Este protocolo no se puede cerrar.');
  description.id = 'penalty-description';
  content.append(title, description);
  if (state.penalties.missedList.length) {
    content.append(element('p', 'penalty-missed', `Misiones incumplidas: ${state.penalties.missedList.join(', ')}`));
  }
  if (state.punishmentTasks.length) {
    const completedCount = state.punishmentTasks.filter(task => state.penalties.completedTasks.includes(task.id)).length;
    content.append(element('p', 'penalty-progress', `${completedCount} de ${state.punishmentTasks.length} tareas completadas`));
    const list = element('div', 'punishment-list penalty-modal-list');
    for (const task of state.punishmentTasks) {
      const row = element('label', 'punishment-row');
      const check = element('input');
      check.type = 'checkbox';
      check.checked = state.penalties.completedTasks.includes(task.id);
      check.disabled = check.checked;
      check.setAttribute('aria-label', `Completar tarea de castigo: ${task.text}`);
      check.addEventListener('change', () => {
        completePenaltyTasks(state, task.id, check.checked);
        persist();
        renderCurrent();
      });
      row.append(check, element('span', '', task.text));
      list.append(row);
    }
    content.append(list);
  } else {
    content.append(
      element('p', 'penalty-missing-tasks', 'No hay tareas de castigo configuradas. Restablece las tareas para completar el protocolo y continuar.'),
      button('RESTABLECER TAREAS DE CASTIGO', 'button-primary', () => {
        state.punishmentTasks = ['30 flexiones', '10 min lectura', 'Ducha fría'].map(text => ({ id: id('punishment'), text }));
        state.penalties.completedTasks = [];
        persist();
        renderCurrent();
      })
    );
  }
  overlay.append(content);
  root.append(overlay);
  document.querySelector('.app-shell').inert = true;
  document.body.classList.add('penalty-open');
  overlay.querySelector('input:not([disabled]), button:not([disabled])')?.focus();
}

function keepPenaltyModalLocked(event) {
  if (!state?.penalties.active) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key !== 'Tab') return;
  const overlay = document.querySelector('.penalty-overlay');
  const focusable = [...overlay.querySelectorAll('input:not([disabled]), button:not([disabled])')];
  if (!focusable.length) {
    event.preventDefault();
    overlay.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!overlay.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function renderDailyWarnings() {
  const box = element('section', 'daily-warning-list');
  box.setAttribute('aria-live', 'polite');
  box.setAttribute('aria-label', 'Avisos de misiones incompletas');
  for (const warning of state.dailyWarnings) {
    const card = element('article', `daily-warning ${warning.type === 'penalty' ? 'daily-warning-penalty' : ''}`);
    const message = warning.type === 'penalty'
      ? warning.reason === 'period'
        ? `ADVERTENCIA: Quedó sin completar al menos una misión semanal o mensual antes del cierre del periodo (${warning.date}). Se activó el castigo y una penalización de XP.`
        : `ADVERTENCIA: El día ${warning.date} quedó incompleto. No alcanzaste el mínimo diario, faltó un no negociable o agotaste tus días flexibles; debes cumplir las tareas de castigo.`
      : `ADVERTENCIA: El día ${warning.date} quedó incompleto. Se usó un día de flexibilidad; te quedan ${warning.remainingFlexDays} de ${FLEX_DAYS_PER_WEEK} esta semana.`;
    card.append(element('p', '', message));
    card.append(button('Entendido', 'button-small', () => {
      state.dailyWarnings = state.dailyWarnings.filter(item => item.id !== warning.id);
      persist();
      renderHome();
    }));
    box.append(card);
  }
  return box;
}

function renderHabits() {
  const root = document.getElementById('view-habits'); root.replaceChildren();
  root.append(heading(currentHabitSection === 'categories' ? 'Categorías' : 'Mis hábitos', currentHabitSection === 'categories' ? 'ORDEN DE TUS MISIONES' : 'REGISTRO DE MISIONES'));
  const tabs = element('div', 'habits-tabs');
  const missionsTab = button('MIS HÁBITOS', `habits-tab ${currentHabitSection === 'missions' ? 'active' : ''}`, () => { currentHabitSection = 'missions'; renderHabits(); }, 'check');
  const categoriesTab = button('CATEGORÍAS', `habits-tab ${currentHabitSection === 'categories' ? 'active' : ''}`, () => { currentHabitSection = 'categories'; renderHabits(); }, 'tag');
  missionsTab.setAttribute('aria-pressed', String(currentHabitSection === 'missions'));
  categoriesTab.setAttribute('aria-pressed', String(currentHabitSection === 'categories'));
  tabs.append(missionsTab, categoriesTab);
  root.append(tabs);
  if (currentHabitSection === 'categories') {
    renderCategoriesSection(root);
    return;
  }
  const toolbar = element('div', 'toolbar');
  const frequency = selectControl('Frecuencia', [['all', 'Todas las frecuencias'], ['daily', 'Diario'], ['weekly', 'Semanal'], ['monthly', 'Mensual']], currentFrequency);
  frequency.addEventListener('change', () => { currentFrequency = frequency.value; renderHabits(); });
  const categories = selectControl('Categoría', [['all', 'Todas las categorías'], ...state.categories.map(c => [c.id, c.name])], currentCategory);
  categories.addEventListener('change', () => { currentCategory = categories.value; renderHabits(); });
  toolbar.append(frequency.fieldWrapper, categories.fieldWrapper, button('Nuevo hábito', 'button-primary', () => openHabitForm(), 'check'));
  root.append(toolbar);
  const habits = state.habits.filter(item => (currentFrequency === 'all' || item.frequency === currentFrequency) && (currentCategory === 'all' || item.categoryId === currentCategory));
  if (!habits.length) root.append(emptyPanel('Sin misiones por ahora', 'Crea un hábito para empezar a ganar experiencia.'));
  const frequencies = [
    ['daily', 'Hábitos diarios'],
    ['weekly', 'Hábitos semanales'],
    ['monthly', 'Hábitos mensuales']
  ];
  for (const [frequencyKey, frequencyTitle] of frequencies) {
    if (currentFrequency !== 'all' && currentFrequency !== frequencyKey) continue;
    const frequencyHabits = habits.filter(habit => habit.frequency === frequencyKey);
    if (!frequencyHabits.length) continue;
    const frequencyGroup = element('details', 'habit-frequency-group panel');
    frequencyGroup.open = habitFrequencyOpen[frequencyKey];
    frequencyGroup.addEventListener('toggle', () => { habitFrequencyOpen[frequencyKey] = frequencyGroup.open; });
    const frequencySummary = element('summary', 'habit-frequency-summary');
    const missionCount = frequencyHabits.length;
    frequencySummary.append(element('strong', '', frequencyTitle), element('span', 'habit-frequency-count', `${missionCount} ${missionCount === 1 ? 'misión' : 'misiones'}`));
    frequencyGroup.append(frequencySummary);
    for (const category of state.categories) {
      const categoryHabits = frequencyHabits.filter(habit => habit.categoryId === category.id);
      if (!categoryHabits.length) continue;
      const categoryGroup = element('section', 'habit-category-group');
      const categoryHeading = element('h3', 'habit-category-heading');
      const categoryMarker = element('span', 'category-dot');
      categoryMarker.style.backgroundColor = category.color;
      categoryHeading.append(categoryMarker, element('span', '', category.name));
      categoryGroup.append(categoryHeading);
      categoryHabits.forEach(habit => categoryGroup.append(habitCard(habit)));
      frequencyGroup.append(categoryGroup);
    }
    const uncategorized = frequencyHabits.filter(habit => !state.categories.some(category => category.id === habit.categoryId));
    if (uncategorized.length) {
      const categoryGroup = element('section', 'habit-category-group');
      categoryGroup.append(element('h3', 'habit-category-heading', 'Sin categoría'));
      uncategorized.forEach(habit => categoryGroup.append(habitCard(habit)));
      frequencyGroup.append(categoryGroup);
    }
    root.append(frequencyGroup);
  }
  root.append(element('h2', 'list-heading', 'No negociables'));
  root.append(button('Nuevo no negociable', 'button-secondary', () => openNonNegotiableForm(), 'shield'));
  if (!state.nonNegotiables.length) root.append(emptyText('Todavía no hay no negociables.'));
  state.nonNegotiables.forEach(item => root.append(nonNegotiableCard(item)));
}

function habitCard(habit) {
  const card = element('article', 'item-card panel');
  const main = element('div', 'item-main');
  const cat = state.categories.find(category => category.id === habit.categoryId);
  const marker = element('span', 'category-dot'); marker.style.backgroundColor = cat?.color || '#7c3aed';
  const title = element('div');
  title.append(element('h2', 'item-title', habit.name));
  title.append(element('p', 'muted small', `${cat?.name || 'Sin categoría'} · ${frequencyLabel(habit)} · ${difficultyLabel(habit)} · +${xpForHabit(habit, state.profile)} XP`));
  if (habit.description) title.append(element('p', 'muted item-description', habit.description));
  const progress = progressCount(habit);
  const progressLabel = `${progress.count}/${progress.target} ${progress.label}`;
  title.append(element('p', 'period-progress', progressLabel));
  main.append(marker, title);
  const actions = element('div', 'item-actions');
  const active = element('span', `status-chip ${habit.active === false ? 'paused' : ''}`, habit.active === false ? 'PAUSADO' : 'ACTIVO');
  actions.append(active, button('Editar', 'button-small', () => openHabitForm(habit)), button(habit.active === false ? 'Activar' : 'Pausar', 'button-small', () => { habit.active = habit.active === false; persist(); renderHabits(); }));
  actions.append(button('Eliminar', 'button-small danger-text', () => confirmAction(`¿Eliminar el hábito “${habit.name}”?`, () => { state.habits = state.habits.filter(item => item.id !== habit.id); persist(); renderHabits(); })));
  card.append(main, actions);
  return card;
}

function nonNegotiableCard(item) {
  const card = element('article', 'item-card panel mandatory-card');
  const main = element('div', 'item-main');
  main.append(icon('shield', 'shield-icon'), element('div', '', ''));
  main.lastChild.append(element('h2', 'item-title', item.name), element('span', 'mandatory-badge', 'OBLIGATORIO'));
  if (item.description) main.lastChild.append(element('p', 'muted small', item.description));
  const actions = element('div', 'item-actions');
  actions.append(button('Editar', 'button-small', () => openNonNegotiableForm(item)));
  actions.append(button('Eliminar', 'button-small danger-text', () => confirmAction(`¿Eliminar el no negociable “${item.name}”?`, () => { state.nonNegotiables = state.nonNegotiables.filter(value => value.id !== item.id); persist(); renderHabits(); })));
  card.append(main, actions); return card;
}

function renderCategoriesSection(root) {
  root.append(element('p', 'muted small category-section-intro', 'Organiza y personaliza las categorías de tus misiones.'));
  root.append(button('Crear categoría', 'button-primary', () => openCategoryForm(), 'tag'));
  if (!state.categories.length) root.append(emptyPanel('Sin categorías', 'Crea una categoría para organizar tus misiones.'));
  for (const category of state.categories) {
    const card = element('article', 'category-card panel');
    const header = element('div', 'category-card-head');
    const marker = element('span', 'category-dot large'); marker.style.backgroundColor = category.color;
    header.append(marker, element('h2', 'item-title', category.name), icon(category.icon || 'tag', 'category-icon'));
    const count = state.habits.filter(h => h.categoryId === category.id).length;
    const actions = element('div', 'item-actions');
    actions.append(element('span', 'muted small', `${count} hábitos`), button('Editar', 'button-small', () => openCategoryForm(category)));
    actions.append(button('Eliminar', 'button-small danger-text', () => deleteCategory(category)));
    card.append(header, actions); root.append(card);
  }
}

function renderStats() {
  const root = document.getElementById('view-stats'); root.replaceChildren();
  root.append(heading('Estadísticas', 'REGISTRO DEL CAZADOR'));
  const summary = element('div', 'stats-grid');
  const rank = getRankByLevel(state.profile.level);
  summary.append(metric('Racha actual', `${state.profile.streak} días`), metric('Mejor racha', `${state.profile.bestStreak} días`), metric('Nivel / rango', `${state.profile.level} · ${rank.name}`), metric('Renacimientos', String(state.profile.rebirths)));
  root.append(summary);
  const categories = panel('Cumplimiento por categoría');
  state.categories.forEach(category => {
    const relevant = state.habits.filter(h => h.categoryId === category.id);
    const total = relevant.length;
    const done = relevant.filter(h => isDone('habits', h.id)).length;
    const percent = total ? Math.round(done / total * 100) : 0;
    const row = element('div', 'category-stat');
    row.append(element('span', '', category.name), element('span', 'muted small', `${percent}%`));
    const track = element('div', 'mini-track'); const fill = element('span'); fill.style.width = `${percent}%`; fill.style.backgroundColor = category.color; track.append(fill);
    categories.append(row, track);
  });
  root.append(categories);
  const heat = panel('Actividad · últimos 42 días');
  const grid = element('div', 'heatmap');
  const today = parseDateKey(todayLocalISO());
  for (let offset = 41; offset >= 0; offset--) {
    const date = new Date(today); date.setDate(today.getDate() - offset);
    const key = todayLocalISO(date);
    const completed = Boolean(state.heatmap[key]?.complete || state.completions[key]);
    const cell = element('span', `heat-cell ${completed ? 'filled' : ''}`);
    cell.title = `${dateLabel(key)}${completed ? ' · actividad' : ''}`;
    cell.setAttribute('aria-label', cell.title);
    grid.append(cell);
  }
  heat.append(grid); root.append(heat);
  const history = panel('Historial de niveles');
  const entries = [...state.levelHistory].slice(-12).reverse();
  if (!entries.length) history.append(emptyText('Aún no hay ascensos registrados.'));
  entries.forEach(entry => {
    const row = element('div', 'history-row');
    row.append(element('strong', '', `Nivel ${entry.level}`), element('span', 'muted small', `${entry.rank || getRankByLevel(entry.level).name} · ${entry.date}`));
    history.append(row);
  });
  root.append(history);
}

function renderShadows() {
  const root = document.getElementById('view-shadows'); root.replaceChildren();
  const unlocked = state.shadows.filter(shadow => shadow.unlocked);
  const locked = state.shadows.filter(shadow => !shadow.unlocked);
  root.append(heading('Armario de Sombras', 'EJÉRCITO DEL MONARCA'));
  const progress = panel('Legión reunida', `${unlocked.length}/${state.shadows.length}`);
  const track = element('div', 'xp-track'); const fill = element('span', 'xp-fill');
  fill.style.width = `${state.shadows.length ? unlocked.length / state.shadows.length * 100 : 0}%`; track.append(fill);
  progress.append(track); root.append(progress);
  root.append(element('h2', 'list-heading', 'DESBLOQUEADAS'));
  if (!unlocked.length) root.append(emptyText('Las sombras aguardan el primer Despertar.'));
  unlocked.forEach(shadow => root.append(shadowCard(shadow, false)));
  root.append(element('h2', 'list-heading', 'BLOQUEADAS'));
  locked.forEach(shadow => root.append(shadowCard(shadow, true)));
}

function shadowCard(shadow, locked) {
  const card = element('article', `shadow-card panel ${locked ? 'shadow-locked' : 'shadow-unlocked'}`);
  card.style.setProperty('--shadow-glow', shadow.glow);
  const crest = element('div', 'shadow-crest');
  crest.append(icon(locked ? 'lock' : 'shadows', 'shadow-icon'));
  const details = element('div', 'shadow-details');
  const line = element('div', 'shadow-name-line');
  line.append(element('h3', '', shadow.name), element('span', 'tier-badge', shadow.tier));
  details.append(line, element('p', 'shadow-title', shadow.title), element('p', 'muted small', shadow.description));
  if (locked) details.append(element('p', 'unlock-hint', 'Se desbloqueará al realizar el Despertar al alcanzar el Nivel 100'));
  else details.append(element('span', 'unlocked-meta', `LIBERADA · Renacimiento ${shadow.rebirthNumber || 1}`));
  card.append(crest, details);
  return card;
}

function renderSettings() {
  const root = document.getElementById('view-settings'); root.replaceChildren();
  root.append(heading('Ajustes', 'CONFIGURACIÓN DEL SISTEMA'));
  const motion = panel('Accesibilidad');
  const reduce = checkboxControl('Reducir movimiento', state.settings.reduceMotion);
  reduce.input.addEventListener('change', () => { state.settings.reduceMotion = reduce.input.checked; persist(); document.body.classList.toggle('reduce-motion', state.settings.reduceMotion); });
  motion.append(reduce.wrapper); root.append(motion);
  const punishments = panel('Tareas de castigo', 'Edita las tareas que aparecerán durante una penalización.');
  state.punishmentTasks.forEach(task => {
    const row = element('div', 'setting-task-row');
    const text = element('span', '', task.text);
    row.append(text, button('Editar', 'button-small', () => editPunishment(task)), button('Eliminar', 'button-small danger-text', () => confirmAction(`¿Eliminar “${task.text}”?`, () => { state.punishmentTasks = state.punishmentTasks.filter(item => item.id !== task.id); persist(); renderSettings(); })));
    punishments.append(row);
  });
  punishments.append(button('Añadir tarea de castigo', 'button-secondary', () => editPunishment(), 'check')); root.append(punishments);
  const data = panel('Datos locales', 'Tus datos permanecen en este dispositivo.');
  data.append(button('Exportar datos JSON', 'button-secondary', exportData), fileImportControl());
  data.append(button('BORRAR TODOS LOS DATOS', 'button-danger', deleteAllData));
  root.append(data);
  root.append(element('p', 'muted small footnote', 'SISTEMA guarda el progreso en localStorage del navegador. Exporta una copia de seguridad antes de cambiar de dispositivo.'));
}

function selectControl(labelText, options, selected) {
  const wrapper = element('label', 'field');
  wrapper.append(element('span', 'field-label', labelText));
  const select = element('select', 'input');
  select.setAttribute('aria-label', labelText);
  options.forEach(([value, label]) => {
    const option = element('option', '', label); option.value = value; option.selected = value === selected; select.append(option);
  });
  wrapper.append(select);
  select.fieldWrapper = wrapper;
  return select;
}

function inputControl(labelText, type = 'text', value = '', required = false) {
  const wrapper = element('label', 'field');
  wrapper.append(element('span', 'field-label', labelText));
  const input = element('input', 'input'); input.type = type; input.value = value; input.required = required;
  wrapper.append(input); return { wrapper, input };
}

function textareaControl(labelText, value = '') {
  const wrapper = element('label', 'field'); wrapper.append(element('span', 'field-label', labelText));
  const textarea = element('textarea', 'input'); textarea.rows = 3; textarea.value = value; wrapper.append(textarea); return { wrapper, input: textarea };
}

function checkboxControl(labelText, checked) {
  const wrapper = element('label', 'toggle-row'); const input = element('input');
  input.type = 'checkbox'; input.checked = checked; wrapper.append(input, element('span', '', labelText)); return { wrapper, input };
}

function openHabitForm(existing) {
  const form = element('form', 'modal-form');
  const name = inputControl('Nombre de la misión', 'text', existing?.name || '', true);
  const description = textareaControl('Descripción opcional', existing?.description || '');
  const category = selectControl('Categoría', state.categories.map(c => [c.id, c.name]), existing?.categoryId || state.categories[0]?.id || '');
  const frequency = selectControl('Frecuencia', [['daily', 'Diario'], ['weekly', 'Semanal'], ['monthly', 'Mensual']], existing?.frequency || 'daily');
  const difficulty = selectControl('Dificultad', [['easy', 'Fácil'], ['medium', 'Media'], ['hard', 'Difícil']], existing?.difficulty || 'medium');
  const getTargetDefault = value => {
    if (existing?.frequency === value) return value === 'weekly' ? Number(existing.weeklyTarget) || 1 : Number(existing.monthlyTarget) || 1;
    return value === 'weekly' ? 3 : 8;
  };
  const target = inputControl('Objetivo semanal (veces)', 'number', getTargetDefault(frequency.value));
  target.input.min = '1'; target.input.max = '99';
  const active = checkboxControl('Misión activa', existing?.active !== false);
  const xpExplanation = element('p', 'muted small field-help', 'XP automático por dificultad y frecuencia: diario 1×, semanal 2× y mensual 3× la recompensa base (fácil 10%, media 15%, difícil 25% del XP para subir de nivel). En objetivos semanales y mensuales, la recompensa se entrega una sola vez al alcanzar el objetivo completo. La recompensa escala con tu nivel y no se puede editar.');
  const deadlineHint = element('p', 'muted small field-help');
  form.append(name.wrapper, description.wrapper, category.fieldWrapper, frequency.fieldWrapper, difficulty.fieldWrapper, xpExplanation, deadlineHint, target.wrapper, active.wrapper);
  let targetFrequency = frequency.value;
  const updateTargetField = () => {
    const selectedFrequency = frequency.value;
    const hasTarget = selectedFrequency === 'weekly' || selectedFrequency === 'monthly';
    target.wrapper.hidden = !hasTarget;
    target.input.required = hasTarget;
    target.wrapper.querySelector('.field-label').textContent = selectedFrequency === 'monthly'
      ? 'Objetivo mensual (veces)'
      : 'Objetivo semanal (veces)';
    if (targetFrequency !== selectedFrequency) {
      target.input.value = String(getTargetDefault(selectedFrequency));
      targetFrequency = selectedFrequency;
    }
    target.wrapper.querySelectorAll('.target-hint').forEach(hint => hint.remove());
    if (selectedFrequency === 'weekly') {
      target.wrapper.append(element('span', 'muted small target-hint', 'Ejemplo: completar 3 veces antes de que termine la semana.'));
      deadlineHint.textContent = 'Cumple el objetivo antes de que cierre la semana el domingo.';
    } else if (selectedFrequency === 'monthly') {
      target.wrapper.append(element('span', 'muted small target-hint', 'Ejemplo: completar 8 veces durante el mes.'));
      const lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 12);
      deadlineHint.textContent = `Cumple el objetivo mensual antes del ${dateLabel(todayLocalISO(lastDay))}.`;
    } else deadlineHint.textContent = 'Completa esta misión cada día.';
    if (existing && existing.frequency === selectedFrequency && hasPeriodProgress(existing)) {
      target.wrapper.append(element('span', 'muted small target-hint', `El objetivo de este periodo ya está fijado en ${getHabitPeriodProgress(state, existing).target}; los cambios aplicarán al siguiente periodo.`));
    }
  };
  frequency.addEventListener('change', updateTargetField);
  updateTargetField();
  showModal(existing ? 'Editar hábito' : 'Crear hábito', form, 'Guardar misión', () => {
    const selectedFrequency = frequency.value;
    const habit = {
      ...(existing || {}), id: existing?.id || id('habit'), name: name.input.value.trim(), description: description.input.value.trim(),
      categoryId: category.value, frequency: selectedFrequency, difficulty: difficulty.value,
      active: active.input.checked, history: existing?.history || [], weeklyProgress: existing?.weeklyProgress || {}, monthlyProgress: existing?.monthlyProgress || {}
    };
    delete habit.xp;
    delete habit.reminderTime;
    if (selectedFrequency === 'weekly') habit.weeklyTarget = Number(target.input.value) || 1;
    else delete habit.weeklyTarget;
    if (selectedFrequency === 'monthly') habit.monthlyTarget = Number(target.input.value) || 1;
    else delete habit.monthlyTarget;
    if (!habit.name || !habit.categoryId) { toast('Completa el nombre y crea o selecciona una categoría.'); return false; }
    if (existing) Object.assign(existing, habit); else state.habits.push(habit);
    if (currentView === 'habits') habitFrequencyOpen[selectedFrequency] = true;
    persist(); renderCurrent(); return true;
  });
}

function hasPeriodProgress(habit) {
  return (habit.frequency === 'weekly' || habit.frequency === 'monthly')
    && getHabitPeriodProgress(state, habit).count > 0;
}

function openNonNegotiableForm(existing) {
  const form = element('form', 'modal-form');
  const name = inputControl('Nombre del compromiso', 'text', existing?.name || '', true);
  const description = textareaControl('Descripción opcional', existing?.description || '');
  form.append(name.wrapper, description.wrapper);
  showModal(existing ? 'Editar no negociable' : 'Nuevo no negociable', form, 'Guardar compromiso', () => {
    if (!name.input.value.trim()) { toast('Escribe un nombre para el compromiso.'); return false; }
    const item = { ...(existing || {}), id: existing?.id || id('non-negotiable'), name: name.input.value.trim(), description: description.input.value.trim(), active: true, history: existing?.history || {} };
    if (existing) Object.assign(existing, item); else state.nonNegotiables.push(item);
    persist(); renderCurrent(); return true;
  });
}

function openCategoryForm(existing) {
  const form = element('form', 'modal-form');
  const name = inputControl('Nombre', 'text', existing?.name || '', true);
  const color = inputControl('Color', 'color', existing?.color || '#8b5cf6');
  const categoryIcon = selectControl('Icono geométrico', [['brain', 'Mente'], ['pulse', 'Físico'], ['coin', 'Economía'], ['star', 'Espiritual'], ['people', 'Social'], ['heart', 'Salud'], ['tag', 'General']], existing?.icon || 'tag');
  form.append(name.wrapper, color.wrapper, categoryIcon.fieldWrapper);
  showModal(existing ? 'Editar categoría' : 'Crear categoría', form, 'Guardar categoría', () => {
    if (!name.input.value.trim()) { toast('Escribe un nombre para la categoría.'); return false; }
    const item = { ...(existing || {}), id: existing?.id || id('category'), name: name.input.value.trim(), color: color.input.value, icon: categoryIcon.value };
    if (existing) Object.assign(existing, item); else state.categories.push(item);
    persist(); renderHabits(); return true;
  });
}

function deleteCategory(category) {
  const associated = state.habits.filter(habit => habit.categoryId === category.id);
  if (!associated.length) {
    confirmAction(`¿Eliminar la categoría “${category.name}”?`, () => { state.categories = state.categories.filter(item => item.id !== category.id); persist(); renderHabits(); });
    return;
  }
  const form = element('div', 'modal-form');
  form.append(element('p', '', `“${category.name}” tiene ${associated.length} hábitos. Elige cómo continuar.`));
  const target = selectControl('Reasignar a categoría', state.categories.filter(item => item.id !== category.id).map(item => [item.id, item.name]), '');
  const reassign = button('Reasignar hábitos y eliminar categoría', 'button-primary', () => {
    if (!target.value) { toast('Crea otra categoría antes de reasignar.'); return; }
    associated.forEach(habit => { habit.categoryId = target.value; });
    state.categories = state.categories.filter(item => item.id !== category.id); persist(); closeModal(); renderHabits();
  });
  const remove = button('Eliminar categoría y sus hábitos', 'button-danger', () => {
    state.habits = state.habits.filter(habit => habit.categoryId !== category.id);
    state.categories = state.categories.filter(item => item.id !== category.id); persist(); closeModal(); renderHabits();
  });
  const cancel = button('Cancelar', 'button-secondary', closeModal);
  form.append(target.fieldWrapper, reassign, remove, cancel);
  showModal('Eliminar categoría', form, null);
}

function editPunishment(task) {
  const form = element('form', 'modal-form');
  const text = inputControl('Texto de la tarea', 'text', task?.text || '', true); form.append(text.wrapper);
  showModal(task ? 'Editar tarea' : 'Añadir tarea', form, 'Guardar', () => {
    if (!text.input.value.trim()) { toast('Escribe el texto de la tarea.'); return false; }
    if (task) task.text = text.input.value.trim(); else state.punishmentTasks.push({ id: id('punishment'), text: text.input.value.trim() });
    persist(); renderSettings(); return true;
  });
}

function showModal(title, content, submitText, onSubmit) {
  const root = document.getElementById('modal-root'); root.replaceChildren();
  const backdrop = element('div', 'modal-backdrop');
  const dialog = element('section', 'modal panel'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', title);
  const header = element('div', 'modal-header'); header.append(element('h2', '', title), button('Cerrar', 'icon-button', closeModal));
  dialog.append(header, content);
  if (submitText) {
    const footer = element('div', 'modal-actions');
    footer.append(button('Cancelar', 'button-secondary', closeModal));
    const submit = button(submitText, 'button-primary', () => {
      if (content instanceof HTMLFormElement && !content.reportValidity()) return;
      if (onSubmit() !== false) closeModal();
    });
    if (content instanceof HTMLFormElement) submit.type = 'button';
    footer.append(submit); dialog.append(footer);
    if (content instanceof HTMLFormElement) content.addEventListener('submit', event => { event.preventDefault(); submit.click(); });
  }
  backdrop.append(dialog); backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });
  root.append(backdrop);
  dialog.querySelector('input, select, button')?.focus();
}

function closeModal() { document.getElementById('modal-root').replaceChildren(); }

function confirmAction(message, action, confirmLabel = 'Confirmar') {
  const content = element('p', 'modal-message', message);
  showModal('Confirmación', content, confirmLabel, () => { closeModal(); action(); return false; });
}

function confirmAwaken() {
  const text = element('p', 'modal-message', 'Has alcanzado el trono. Al despertar volverás al nivel 1 y liberarás la siguiente sombra bloqueada.');
  showModal('[SISTEMA] Despertar', text, 'DESPERTAR', () => {
    const shadow = awaken(state); persist();
    closeModal();
    showEpicOverlay(shadow ? `[SISTEMA] Has despertado... Una Sombra ha sido liberada: ${shadow.name} - ${shadow.title}` : '[SISTEMA] Has despertado... Toda la legión está reunida.');
    renderHome(); return true;
  });
}

export function showEpicOverlay(message, type = 'shadow') {
  epicQueue = [];
  epicShowing = false;
  displayEpicOverlay(message, type);
}

function displayEpicOverlay(message, type, onClose = () => {}) {
  const root = document.getElementById('modal-root'); root.replaceChildren();
  const overlay = element('div', `epic-overlay ${type === 'rank' ? 'rank-overlay' : ''}`);
  overlay.setAttribute('role', 'alert'); overlay.setAttribute('aria-live', 'assertive');
  const aura = element('div', 'epic-aura');
  const content = element('div', 'epic-content');
  content.append(element('p', 'eyebrow', type === 'level' ? 'ASCENSO DETECTADO' : type === 'rank' ? 'ASCENSO DE RANGO' : 'EXTRACCIÓN COMPLETADA'));
  content.append(element('h2', '', type === 'level' ? 'LEVEL UP' : message));
  let closed = false;
  const dismiss = button('CONTINUAR', 'button-primary', () => {
    if (closed) return;
    closed = true; closeModal(); onClose();
  });
  content.append(dismiss); overlay.append(aura, content); root.append(overlay); dismiss.focus();
  window.setTimeout(() => {
    if (!closed && root.contains(overlay)) { closed = true; closeModal(); onClose(); }
  }, 6500);
}

function showNextEpicEvent() {
  if (epicShowing || !epicQueue.length) return;
  epicShowing = true;
  const next = epicQueue.shift();
  displayEpicOverlay(next.message, next.type, () => {
    epicShowing = false;
    showNextEpicEvent();
  });
}

export function showLevelEvent(event) {
  if (event.type === 'level') {
    epicQueue.push({ message: 'LEVEL UP', type: 'level' });
    if (!state.settings.reduceMotion && navigator.vibrate) navigator.vibrate(150);
  } else if (event.type === 'rank') epicQueue.push({ message: event.rank, type: 'rank' });
  showNextEpicEvent();
}

function exportData() {
  try {
    const date = new Date();
    const stamp = `${todayLocalISO(date)}-${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = element('a'); link.href = url; link.download = `sistema-export-${stamp}.json`; link.click();
    URL.revokeObjectURL(url); toast('Copia de seguridad exportada.');
  } catch (error) { console.error('[SISTEMA] Falló la exportación.', error); toast('No se pudo exportar el archivo.'); }
}

function fileImportControl() {
  const wrapper = element('label', 'button button-secondary file-button');
  wrapper.append(document.createTextNode('Importar datos JSON'));
  const input = element('input', 'sr-only'); input.type = 'file'; input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !parsed.profile || !Array.isArray(parsed.categories) || !Array.isArray(parsed.habits) || !Array.isArray(parsed.nonNegotiables) || (Number(parsed.schemaVersion || 0) >= 1 && !Array.isArray(parsed.shadows))) throw new Error('El archivo no contiene una estructura SISTEMA válida.');
      const shadowCount = Array.isArray(parsed.shadows) ? parsed.shadows.filter(item => item.unlocked).length : 0;
      const summary = `Niveles/historial: ${parsed.profile.level || 1} / ${(parsed.levelHistory || []).length}. Hábitos: ${parsed.habits.length}. No negociables: ${parsed.nonNegotiables.length}. Categorías: ${parsed.categories.length}. Sombras desbloqueadas: ${shadowCount}.`;
      const msg = element('p', 'modal-message', `Importar sobrescribirá el progreso actual. ${summary}`);
      showModal('Revisar importación', msg, 'Confirmar importación', () => {
        try {
          const migrated = migrate(parsed);
          localStorage.setItem('sistema_v1', JSON.stringify(migrated));
          window.location.reload();
        } catch (error) { console.error('[SISTEMA] No se pudieron aplicar los datos importados.', error); toast('No se pudieron importar los datos.'); return false; }
      });
    } catch (error) { console.error('[SISTEMA] Falló la importación.', error); toast(error.message || 'No se pudo leer el archivo.'); }
    input.value = '';
  });
  wrapper.append(input); return wrapper;
}

function deleteAllData() {
  confirmAction('[SISTEMA] Esto borrará TODOS los datos. ¿Estás seguro?', () => {
    closeModal();
    confirmAction('[SISTEMA] Esta acción NO se puede deshacer. Confirmar borrado.', () => {
      try { localStorage.removeItem('sistema_v1'); window.location.reload(); }
      catch (error) { console.error('[SISTEMA] No se pudieron borrar los datos.', error); toast('No se pudieron borrar los datos locales.'); }
    }, 'BORRAR DEFINITIVAMENTE');
  }, 'Continuar');
}

function emptyText(text) { return element('p', 'empty-text', text); }
function emptyPanel(title, description) {
  const box = element('div', 'empty-state panel');
  box.append(element('h2', '', title), element('p', 'muted', description)); return box;
}

function frequencyLabel(habit) { return { daily: 'diario', weekly: 'semanal', monthly: 'mensual' }[habit.frequency] || 'diario'; }
function difficultyLabel(habit) { return { easy: 'fácil', medium: 'media', hard: 'difícil' }[habit.difficulty] || 'media'; }

function toast(message) {
  const root = document.getElementById('toast-root'); root.replaceChildren(element('div', 'toast-message', message));
  window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => root.replaceChildren(), 3600);
}
