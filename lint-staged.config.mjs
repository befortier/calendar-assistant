/** @type {import('lint-staged').Config} */
export default {
  // Frontend: run from app workspace so ESLint finds the config and tsconfig.
  // Paths are quoted to handle any path containing spaces.
  "app/src/**/*.{ts,tsx}": (files) =>
    `cd app && eslint --fix --max-warnings=0 ${files.map((f) => `"${f}"`).join(" ")}`,

  // Backend: run from server workspace so ESLint finds the config and tsconfig.
  // Paths are quoted to handle any path containing spaces.
  "server/src/**/*.ts": (files) =>
    `cd server && eslint --fix --max-warnings=0 ${files.map((f) => `"${f}"`).join(" ")}`,
};
