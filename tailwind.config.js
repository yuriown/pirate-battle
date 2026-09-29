/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Phones in landscape are wide but very short: size by height, not width.
      screens: { short: { raw: '(max-height: 520px)' } },
    },
  },
  plugins: [],
};
