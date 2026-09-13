// jāgriti design tokens — see design_handoff_jagriti_rebrand/README.md
export const lightColors = {
  white: '#FFFFFF',
  background: '#F8F8FC',
  backgroundAlt: '#EAEAF4',
  surface: '#FFFFFF',
  border: '#E4E5F1',
  borderStrong: '#DDE0EC',

  textPrimary: '#232538',
  textSecondary: '#8A8DA3',
  textMuted: '#9497AC',
  textPlaceholder: '#B5B8CC',

  primary: '#5A6FC4',
  primaryLight: '#7C8FD9',
  primaryTint: '#EEF0FB',
  primaryTintStrong: '#F1F2FA',

  success: '#3E9C74',
  successTint: '#E7F5EE',
  successBorder: '#BFE6D3',

  danger: '#D96570',
  dangerTint: '#FBEAEC',

  amber: '#D9A544',
  amberTint: '#FBF2E2',
  amberBorder: '#F0DDAE',

  purple: '#7C6FD9',
  purpleTint: '#EEEBFB',

  orange: '#D97757',
  orangeTint: '#FBEAE2',
} as const;

// jāgriti dark theme — see design_handoff_jagriti_rebrand/jagriti-dark.dc.html
export const darkColors: typeof lightColors = {
  white: '#FFFFFF',
  background: '#0F0F16',
  backgroundAlt: '#20202E',
  surface: '#1C1C28',
  border: '#2C2C3A',
  borderStrong: '#38384A',

  textPrimary: '#F2F2F7',
  textSecondary: '#A6A9C4',
  textMuted: '#B7B9D0',
  textPlaceholder: '#6E7090',

  primary: '#5A6FC4',
  primaryLight: '#7C8FD9',
  primaryTint: '#262A4A',
  primaryTintStrong: '#20202E',

  success: '#3E9C74',
  successTint: '#1F3830',
  successBorder: '#2C5842',

  danger: '#D96570',
  dangerTint: '#3A2530',

  amber: '#D9A544',
  amberTint: '#3A3020',
  amberBorder: '#4A3E28',

  purple: '#7C6FD9',
  purpleTint: '#2C2A45',

  orange: '#D97757',
  orangeTint: '#3A2A20',
};

// Default export kept for any not-yet-migrated call site — prefer useTheme() in components.
export const colors = lightColors;

export type ThemeColors = typeof lightColors;
export type ThemeName = 'light' | 'dark';

export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semiBold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extraBold: 'Manrope_800ExtraBold',
} as const;
