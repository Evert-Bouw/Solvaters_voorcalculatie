import { CoreSettings } from '../types';

type ThemeSettings = {
  core: CoreSettings;
};

function hexToRgbChannelString(hex: string): string | null {
  const normalized = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

const STANDARD_THEME_COLORS = {
  brand50: '#eff6ff',
  brand100: '#dbeafe',
  brand600: '#2563eb',
  brand700: '#1d4ed8',
  appBg: '#f1f5f9',
  panelBg: '#ffffff',
  mutedBg: '#f8fafc',
  panelBorder: '#e2e8f0',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
};

const DARK_THEME_COLORS = {
  brand50: '#172554',
  brand100: '#1e3a8a',
  brand600: '#3b82f6',
  brand700: '#60a5fa',
  appBg: '#0f172a',
  panelBg: '#111827',
  mutedBg: '#1f2937',
  panelBorder: '#334155',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
};

export function resolveThemeColors(settings: ThemeSettings) {
  if (settings.core.uiThemeMode === 'standard_dark') return DARK_THEME_COLORS;
  if (settings.core.uiThemeMode === 'custom') return { ...STANDARD_THEME_COLORS, ...settings.core.uiColors };
  return STANDARD_THEME_COLORS;
}

export function applyThemeColors(settings: ThemeSettings) {
  const root = document.documentElement;
  const colors = resolveThemeColors(settings);

  const brand50 = hexToRgbChannelString(colors.brand50);
  const brand100 = hexToRgbChannelString(colors.brand100);
  const brand600 = hexToRgbChannelString(colors.brand600);
  const brand700 = hexToRgbChannelString(colors.brand700);
  const appBg = hexToRgbChannelString(colors.appBg);
  const panelBg = hexToRgbChannelString(colors.panelBg);
  const mutedBg = hexToRgbChannelString(colors.mutedBg);
  const panelBorder = hexToRgbChannelString(colors.panelBorder);
  const textPrimary = hexToRgbChannelString(colors.textPrimary);
  const textSecondary = hexToRgbChannelString(colors.textSecondary);

  if (brand50) root.style.setProperty('--brand-50-rgb', brand50);
  if (brand100) root.style.setProperty('--brand-100-rgb', brand100);
  if (brand600) root.style.setProperty('--brand-600-rgb', brand600);
  if (brand700) root.style.setProperty('--brand-700-rgb', brand700);
  if (appBg) root.style.setProperty('--app-bg-rgb', appBg);
  if (panelBg) root.style.setProperty('--panel-bg-rgb', panelBg);
  if (mutedBg) root.style.setProperty('--muted-bg-rgb', mutedBg);
  if (panelBorder) root.style.setProperty('--panel-border-rgb', panelBorder);
  if (textPrimary) root.style.setProperty('--text-primary-rgb', textPrimary);
  if (textSecondary) root.style.setProperty('--text-secondary-rgb', textSecondary);

  root.setAttribute('data-ui-theme', settings.core.uiThemeMode);
}
