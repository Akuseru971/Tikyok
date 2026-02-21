import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#090b10',
        panel: 'rgba(20,24,36,0.65)',
        text: '#e7ecff',
        muted: '#9aa3bf',
        accent: '#7c9cff'
      },
      backdropBlur: {
        soft: '8px'
      }
    }
  },
  plugins: []
};

export default config;
