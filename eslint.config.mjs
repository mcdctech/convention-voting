import js from "@eslint/js";
import love from "eslint-config-love";
import pino from "eslint-plugin-pino";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import sortExports from "eslint-plugin-sort-exports";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.strict,
  {
    ...love,
    languageOptions: {
      parserOptions: {
        project: [
          "./tsconfig.json",
          "./packages/*/tsconfig.json",
          "./packages/client/tsconfig.app.json",
          "./packages/client/tsconfig.node.json",
        ],
      },
    },
  },
  {
    plugins: {
      pino: pino,
    },
    rules: {
      "pino/correct-args-position": "error",
    },
  },
  {
    plugins: {
      "sort-exports": sortExports,
    },

    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },

      parserOptions: {
        project: [
          "./tsconfig.json",
          "./packages/*/tsconfig.json",
          "./packages/client/tsconfig.app.json",
          "./packages/client/tsconfig.node.json",
        ],
      },
    },

    rules: {
      "@typescript-eslint/no-magic-numbers": [
        "error",
        {
          detectObjects: false,
          ignoreEnums: true,
        },
      ],

      // Disable max-lines project-wide - can be addressed in refactoring later
      "max-lines": "off",

      // Unlike some code bases we explicitly do not want to use default exports.
      "import/prefer-default-export": "off",
      "import/no-default-export": "error",

      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "object",
            "type",
          ],
          "newlines-between": "never",
        },
      ],

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          caughtErrors: "none",
          argsIgnorePattern: "^_",
        },
      ],

      // Warn on console usage but don't error
      "no-console": "warn",
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: [
            "./tsconfig.json",
            "./packages/*/tsconfig.json",
            "./packages/client/tsconfig.app.json",
            "./packages/client/tsconfig.node.json",
          ],
        },
        node: true,
      },
    },
  },
  // Vue-specific configuration
  ...pluginVue.configs["flat/recommended"],
  {
    files: ["packages/client/**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        project: [
          "./packages/client/tsconfig.app.json",
          "./packages/client/tsconfig.node.json",
        ],
        extraFileExtensions: [".vue"],
      },
    },
    rules: {
      // Vue files often use default exports
      "import/no-default-export": "off",
      // Prettier handles all formatting in Vue templates
      "vue/html-indent": "off",
      "vue/script-indent": "off",
      "vue/max-attributes-per-line": "off",
      "vue/first-attribute-linebreak": "off",
      "vue/html-closing-bracket-newline": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/multiline-html-element-content-newline": "off",
      "vue/html-self-closing": "off",
    },
  },
  {
    files: ["**/index.ts"],

    rules: {
      "sort-exports/sort-exports": [
        "error",
        {
          sortDir: "asc",
          ignoreCase: true,
        },
      ],
      // Indexes shouldn't care about the nature of the exports they are collating
      "@typescript-eslint/consistent-type-exports": "off",
    },
  },
  {
    files: ["**/*test.ts", "**/*.spec.ts", "**/*.integration.test.ts"],

    rules: {
      // Forcing return type definitions in our ad-hoc test functions is not worth
      // the added effort / verbosity.
      "@typescript-eslint/explicit-function-return-type": "off",

      // Tests use hard coded numbers in lots of places, and that's OK for now.
      "@typescript-eslint/no-magic-numbers": "off",

      // Jest hoists mock statements, so sometimes we need to define mock functions
      // that are used in mocks BEFORE the import block.  There may be a better
      // approach to this, but for now it is how we do it and so the rule must go.
      "import/first": "off",

      // The way we organize tests our test files can be very long since we're comprehensive.
      // We could refactor, potentially, but even then I imagine that a line limit is not
      // going to be useful in this context.
      "max-lines": "off",

      // Tests are already 2-3 levels deep in nested callbacks, so we update this rule to 5 instead of 3.
      "max-nested-callbacks": ["error", 5],
    },
  },
  // Vite and Vitest config files require default exports
  {
    files: ["**/vite.config.ts", "**/vitest.config.ts"],
    rules: {
      "import/no-default-export": "off",
    },
  },
  // Vite type definition files require triple slash references
  {
    files: ["**/vite-env.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
      "import/no-default-export": "off",
    },
  },
  // Vue Router type compatibility issue in main.ts
  {
    files: ["packages/client/src/main.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
  {
    ignores: [
      "dist/**",
      "build/**",
      "node_modules/**",
      "*.config.js",
      "*.config.mjs",
      "packages/*/dist/**",
      "packages/*/build/**",
    ],
  },
  // Prettier must be last to disable all conflicting rules
  prettier,
];
