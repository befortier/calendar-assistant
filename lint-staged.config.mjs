/** @type {import('lint-staged').Config} */
export default {
  // Frontend: run from app workspace so ESLint finds the config and tsconfig
  "app/src/**/*.{ts,tsx}": (files) =>
    `cd app && eslint --fix --max-warnings=0 ${files.join(" ")}`,

  // Backend: run from server workspace so ESLint finds the config and tsconfig
  "server/src/**/*.ts": (files) =>
    `cd server && eslint --fix --max-warnings=0 ${files.join(" ")}`,
};
