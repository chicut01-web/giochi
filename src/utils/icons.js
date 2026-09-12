// High-Definition Scalable Vector Icons (Piuccia Games 2.0)
// Uniform 24x24 stroke-based Lucide/Feather gaming-tailored icon system

function svg(paths, { size = 20, className = '', color = 'currentColor', strokeWidth = 2, fill = 'none' } = {}) {
  const cls = className ? ` class="${className}"` : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${cls}>${paths}</svg>`;
}

export const icons = {
  // Navigation & Match Controls
  arrowLeft: (opts) => svg('<path d="M19 12H5M12 19l-7-7 7-7"/>', opts),
  flag: (opts) => svg('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>', opts),
  doorExit: (opts) => svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>', opts),
  abandon: (opts) => svg('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>', opts),

  // Audio & Settings
  volume2: (opts) => svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>', opts),
  volumeX: (opts) => svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>', opts),
  bookOpen: (opts) => svg('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>', opts),
  clock: (opts) => svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', opts),
  target: (opts) => svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>', opts),

  // Users, Profiles & AI
  user: (opts) => svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', opts),
  users: (opts) => svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', opts),
  bot: (opts) => svg('<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/>', opts),
  crown: (opts) => svg('<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>', opts),
  trophy: (opts) => svg('<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H8v4h8v-4h-1c-.55 0-1-.45-1-1v-2.34"/><path d="M6 4h12a2 2 0 0 1 2 2v3a8 8 0 0 1-8 8 8 8 0 0 1-8-8V6a2 2 0 0 1 2-2z"/>', opts),
  chart: (opts) => svg('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>', opts),

  // Social & Modals
  search: (opts) => svg('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', opts),
  inbox: (opts) => svg('<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>', opts),
  mail: (opts) => svg('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>', opts),
  lock: (opts) => svg('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', opts),
  key: (opts) => svg('<path d="m21 2-2 2m-1.5 1.5L16 7l-1.5-1.5L13 7l-1.5-1.5L10 7a6 6 0 1 0 2 2l8.5-8.5a1.5 1.5 0 0 0-2.12-2.12z"/>', opts),
  logOut: (opts) => svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>', opts),
  logIn: (opts) => svg('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>', opts),
  smartphone: (opts) => svg('<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>', opts),

  // Generic UI
  play: (opts) => svg('<polygon points="5 3 19 12 5 21 5 3"/>', { ...opts, fill: 'currentColor' }),
  sparkles: (opts) => svg('<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>', opts),
  check: (opts) => svg('<polyline points="20 6 9 17 4 12"/>', opts),
  close: (opts) => svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', opts),
  trash: (opts) => svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', opts),
  refresh: (opts) => svg('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', opts),

  // Traditional Card Suits (Neapolitan / Italian)
  denari: (opts) => svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5" stroke-dasharray="2 2"/><polygon points="12 8 13.2 10.8 16 11.2 14 13.1 14.5 16 12 14.5 9.5 16 10 13.1 8 11.2 10.8 10.8 12 8" fill="currentColor"/>', { ...opts, color: opts?.color || '#f5c542' }),
  coppe: (opts) => svg('<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M12 14v4"/><path d="M8 20h8"/><path d="M5 7h2"/><path d="M17 7h2"/>', { ...opts, color: opts?.color || '#e74c3c' }),
  spade: (opts) => svg('<path d="M12 2l4 7-2 2-2-1-2 1-2-2 4-7z"/><path d="M12 12v9"/><path d="M8 17h8"/>', { ...opts, color: opts?.color || '#4a90e2' }),
  bastoni: (opts) => svg('<path d="m5 19 14-14"/><path d="m7 17 1-3 3 1-1 3z"/><path d="m14 10 1-3 3 1-1 3z"/><path d="M19 5a2 2 0 0 0-2-2L5 17a2 2 0 0 0 2 2z"/>', { ...opts, color: opts?.color || '#2ecc71' })
};
