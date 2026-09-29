import { fileURLToPath } from 'node:url';

// Explicit path: the config must resolve no matter which directory the build is started from.
export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) },
    autoprefixer: {},
  },
};
