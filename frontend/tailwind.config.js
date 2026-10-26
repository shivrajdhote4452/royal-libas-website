/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        royal: {
          maroon: {
            DEFAULT: '#5B111A',
            dark: '#3A080F',
            light: '#7C1C29',
          },
          gold: {
            DEFAULT: '#C59B27',
            light: '#EAD186',
            dark: '#9A7718',
          },
          ivory: {
            DEFAULT: '#FAF7F2',
            dark: '#F0E9DF',
          },
        },
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
