 

import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  resolve: {
    alias: {
      '@urban-toolkit/autk-core': resolve(__dirname, '../autk-core/src/index.ts'),
    },
  },
  plugins: [dts()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'autk-plot',
    },
    copyPublicDir: false,
    emptyOutDir: true,
    sourcemap: true
  },
});
