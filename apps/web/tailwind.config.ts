import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['var(--font-inter)', 'system-ui', 'sans-serif'] },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        panel: 'hsl(var(--panel))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
          raised: 'hsl(var(--card-raised))',
        },
        border: { DEFAULT: 'hsl(var(--border))', soft: 'hsl(var(--border-soft))' },
        input: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
        muted: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--muted-foreground))' },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          hover: 'hsl(var(--primary-hover))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        brand: { DEFAULT: 'hsl(var(--brand))', soft: 'hsl(var(--brand-soft))' },
        ai: {
          DEFAULT: 'hsl(var(--ai))',
          hover: 'hsl(var(--ai-hover))',
          soft: 'hsl(var(--ai-soft))',
        },
        success: 'hsl(var(--success))',
        'success-soft': 'hsl(var(--success-soft))',
        warning: 'hsl(var(--warning))',
        'warning-soft': 'hsl(var(--warning-soft))',
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          strong: 'hsl(var(--danger-strong))',
        },
        info: 'hsl(var(--info))',
        // Mantido por compatibilidade: nunca é a mesma cor de --primary.
        destructive: {
          DEFAULT: 'hsl(var(--danger))',
          foreground: 'hsl(var(--background))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'var(--radius-card)',
        '2xl': '1rem',
      },
      keyframes: {
        'acordeao': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
      },
    },
  },
  plugins: [animate],
};
export default config;
