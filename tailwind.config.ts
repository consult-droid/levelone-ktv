import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B0B0F',
        surface: '#131319',
        raised: '#1B1B23',
        line: '#2A2A35',
        purple: { DEFAULT: '#7C3AED', soft: '#8B5CF6' },
        lilac: '#C084FC',
        light: '#F4F4F8',
        gray: { cool: '#6B7280' },
        room: { purple: '#8B5CF6', romance: '#EC4899', moon: '#3B82F6' },
      },
      fontFamily: { sans: ['var(--font-montserrat)', 'Montserrat', 'system-ui', 'sans-serif'] },
      boxShadow: { glow: '0 0 40px -12px rgba(124,58,237,0.55)' },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
};
export default config;
