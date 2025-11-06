/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./index.tsx",
    "./src/**/*.{html,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'sans-jp': ['Noto Sans JP', 'sans-serif'],
        'serif-jp': ['Noto Serif JP', 'serif'],
        'oswald': ['Oswald', 'sans-serif'],
      },
      colors: {
        background: '#F8F8F7',
        text: '#333333',
      },
    },
  },
  plugins: [],
}


