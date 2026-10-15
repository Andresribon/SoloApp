const paths = {
  home: '<path d="M3 10.5 12 3l9 7.5v10H5v-8h14"/>',
  check: '<path d="m4 12 5 5L20 6"/><path d="M4 4h5M4 20h5"/>',
  tag: '<path d="M3 4h9l9 9-8 8-10-10z"/><circle cx="8" cy="9" r="1"/>',
  stats: '<path d="M4 20h17M6 17V9m6 8V4m6 13v-6"/>',
  shadows: '<path d="m12 3 3 5 5-2-2 6 3 4-6 1-3 4-3-4-6-1 3-5-1-5 5 2z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="m19 13 2 1-2 4-2-1-2 1v2H9v-2l-2-1-2 1-2-4 2-1v-2l-2-1 2-4 2 1 2-1V4h6v2l2 1 2-1 2 4-2 1z"/>',
  shield: '<path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="m8 12 3 3 5-6"/>',
  warning: '<path d="m12 3 10 18H2z"/><path d="M12 9v5m0 3v.1"/>',
  crown: '<path d="m3 8 5 4 4-8 4 8 5-4-2 12H5z"/><path d="M6 17h12"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  brain: '<path d="M12 4a4 4 0 0 0-7 3 4 4 0 0 0 0 7 4 4 0 0 0 7 3z"/><path d="M12 4a4 4 0 0 1 7 3 4 4 0 0 1 0 7 4 4 0 0 1-7 3zM12 4v16m-4-11 4 2m4 1-4 2"/>',
  pulse: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-.7-1.7-1-3-1-1.7 0-2.8.8-2.8 2s.8 1.7 2.7 2l.8.1c1.5.2 2.3.8 2.3 1.9s-1.1 2-3 2c-1.3 0-2.4-.4-3.2-1.2M12 5.5v13"/>',
  star: '<path d="m12 3 2.6 5.4 5.9.8-4.3 4.2 1 6-5.2-2.8-5.2 2.8 1-6-4.3-4.2 5.9-.8z"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1zm12-9a3 3 0 1 0 0-6m1 9a5 5 0 0 1 5 5"/>',
  heart: '<path d="M20.8 8.7c0 5.1-8.8 11.2-8.8 11.2S3.2 13.8 3.2 8.7A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.7z"/>'
};

export function icon(name, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const template = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const parser = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${paths[name] || paths.check}</svg>`, 'image/svg+xml');
  for (const node of parser.documentElement.childNodes) template.append(document.importNode(node, true));
  svg.append(template);
  return svg;
}

export function categoryIcon(name) {
  return icon(name, 'category-icon');
}
