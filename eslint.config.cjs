const globals = require("globals");
const tseslint = require("typescript-eslint");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");

module.exports = tseslint.config(
  // Global ignores. node_modules is ignored by default in ESLint v9+.
  {
    ignores: [
      "dist/", // Ignoring build output
      "coverage/", // Ignoring coverage reports
      "__benchmark__/", // Ignoring benchmark files
      // Add other patterns like "**/generated/", etc. if needed
    ],
  },

  // Base TypeScript configuration using typescript-eslint's recommended set.
  // This applies the parser, plugin, and recommended rules for .ts files.
  ...tseslint.configs.recommended,

  // Customizations for your project's TypeScript files
  {
    files: ["src/**/*.ts"], // Crucially, specify which files this config applies to
    languageOptions: {
      // parser: tseslint.parser, // Already set by tseslint.configs.recommended
      parserOptions: {
        ecmaVersion: 2020, // As per your original config
        sourceType: "module", // As per your original config
        project: true, // Enable type-aware linting rules
        tsconfigRootDir: __dirname, // Assumes tsconfig.json is in the project root
      },
      globals: {
        ...globals.node, // For Node.js environment (from original env.node)
        ...globals.es2020, // For ES2020 features (from original env.es6 and ecmaVersion)
      },
    },
    rules: {
      // Add any project-specific rules here, overriding or extending the recommended set
      // e.g., "@typescript-eslint/no-explicit-any": "warn",
      '@typescript-eslint/no-explicit-any': 'off', // Turn off the rule

    },
  },

  // Prettier configuration. This should be last to override other formatting rules.
  eslintPluginPrettierRecommended
);