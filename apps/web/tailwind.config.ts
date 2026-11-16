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
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
        muted: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--muted-foreground))' },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          hover: 'hsl(var(--primary-hover))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        ai: { DEFAULT: 'hsl(var(--ai))', hover: 'hsl(var(--ai-hover))' },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        destructive: { DEFAULT: 'hsl(var(--primary-hover))', foreground: 'hsl(var(--primary-foreground))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: '0.75rem',
      },
    },
  },
  plugins: [animate],
};
export default config;
