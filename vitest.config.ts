import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  test: { // Add or modify the include pattern here
    globals: true,
    environment: 'node', // or 'jsdom' if you test browser-specific features
    coverage: {
      provider: 'v8', // or 'istanbul'
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [ // Add this section to exclude folders
        '**/__benchmark__/**',
        '**/docs/**', 
        '**/*.config.{js,ts,cjs,mjs}', // Exclude config files
        '**/dist/**', // Exclude build output
        '**/node_modules/**', 
        ".prettierrc.cjs"
      ],
    },
  },
  plugins: [tsconfigPaths()],
});