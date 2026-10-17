import { load, save } from './js/storage.js';
import { processPendingDays } from './js/gamification.js';
import { initUI, showLevelEvent, showEpicOverlay, updateState } from './js/ui.js';
import { todayLocalISO } from './js/utils.js';

let state = load();

function persist() {
  state.profile.lastActiveDate = todayLocalISO();
  save(state);
}

function handleEvent(event) {
  showLevelEvent(event);
}

function start() {
  const previousDate = state.profile.lastProcessedDate;
  processPendingDays(state, todayLocalISO(), handleEvent);
  if (previousDate !== state.profile.lastProcessedDate) persist();
  initUI(state, persist, handleEvent);
  document.body.classList.toggle('reduce-motion', state.settings.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  if (!state.settings.onboardingDone) showOnboarding();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .catch(error => console.error('[SISTEMA] No se pudo registrar el Service Worker.', error));
  }
}

function showOnboarding() {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop';
  const dialog = document.createElement('section'); dialog.className = 'modal panel onboarding';
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'onboarding-title');
  const title = document.createElement('p'); title.className = 'eyebrow'; title.id = 'onboarding-title'; title.textContent = '[SISTEMA] Iniciando protocolo...';
  const messages = document.createElement('div'); messages.className = 'onboarding-lines';
  ['[SISTEMA] Define tus misiones no negociables...', '[SISTEMA] Cada día completo fortalece tu nivel...', '[SISTEMA] La disciplina es tu única habilidad...'].forEach(text => {
    const line = document.createElement('p'); line.textContent = text; messages.append(line);
  });
  const accept = document.createElement('button'); accept.className = 'button button-primary'; accept.textContent = 'ACEPTAR MISIÓN';
  accept.addEventListener('click', () => {
    state.settings.onboardingDone = true; persist(); root.replaceChildren(); updateState(state);
  });
  dialog.append(title, messages, accept); backdrop.append(dialog); root.replaceChildren(backdrop); accept.focus();
}

start();
