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
            DEFAULT: '#5E1224',
            dark: '#3A080F',
            light: '#7D1B32',
            surface: '#FBF4F5',
          },
          gold: {
            DEFAULT: '#B58A3C',
            light: '#D4AF67',
            dark: '#8C6726',
            pale: '#F7F1E5',
          },
          ivory: {
            DEFAULT: '#FCF8F0',
            dark: '#F3E9DA',
          },
          silk: {
            DEFAULT: '#F3E9DA',
            light: '#F8F3EB',
          },
          ink: {
            DEFAULT: '#2B1B1E',
            muted: '#6B5E62',
            light: '#3D2A2E',
          },
          taupe: {
            DEFAULT: '#8C6F5B',
            light: '#A88D79',
          },
        },
      },
      fontFamily: {
        serif: ['Playfair Display', 'Cinzel', 'Georgia', 'serif'],
        sans: ['Inter', 'DM Sans', 'system-ui', 'sans-serif'],
        ui: ['DM Sans', 'Montserrat', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
