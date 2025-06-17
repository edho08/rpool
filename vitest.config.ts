import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  test: { // Add or modify the include pattern here
    globals: true,
    environment: 'node', // or 'jsdom' if you test browser-specific features
    coverage: {
      provider: 'v8', // or 'istanbul'
      reporter: ['text', 'json', 'html'],
    },
  },
  plugins: [tsconfigPaths()],
});