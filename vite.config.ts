import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages serves the project at https://<user>.github.io/lasertype/
  base: '/lasertype/',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Vitest blanks CSS by default; palette.test.ts reads the tokens via `?raw`.
    css: { include: [/tokens\.css/] },
  },
});
