import { defineConfig } from "vitest/config";

const isFixtureGenerator = process.env.GENERATE_FIXTURES === "1";

export default defineConfig({
  test: {
    include: isFixtureGenerator
      ? ["tests/fixtures/generate-fixtures.test.ts"]
      : ["tests/**/*.test.ts"],
    exclude: isFixtureGenerator
      ? ["**/node_modules/**"]
      : [
          "**/node_modules/**",
          "**/tests/fixtures/generate-fixtures.test.ts",
          "**/tests/fixtures/sync-python-vectors.test.ts",
        ],
  },
});
