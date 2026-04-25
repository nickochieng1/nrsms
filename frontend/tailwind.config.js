/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#f4f8f7',
          100: '#e3edeb',   // #E3EDEB secondary accent
          200: '#c0d6d2',
          300: '#8db8b3',
          400: '#5b9590',
          500: '#347470',
          600: '#1a1a1a',   // button bg  — dark but not pure black so hover is visible
          700: '#111111',   // button hover / sidebar active item
          800: '#080808',   // sidebar hover
          900: '#000000',   // sidebar bg / login bg — pure black
        },
      },
    },
  },
  plugins: [],
}
