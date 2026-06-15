import { ViteDevServer, defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export function pluginWatchNodeModules(modules: string[]) {
  const pattern = `/node_modules\\/(?!${modules.join('|')}).*/`;
  return {
    name: 'watch-node-modules',
    configureServer: (server: ViteDevServer): void => {
      server.watcher.options = {
        ...server.watcher.options,
        ignored: [new RegExp(pattern), '**/.git/**'],
      };
    },
  };
}

export default defineConfig({
  plugins: [
    glsl(),
    pluginWatchNodeModules([
      '@urban-toolkit/autk-core',
      '@urban-toolkit/autk-map',
      '@urban-toolkit/autk-db',
      '@urban-toolkit/autk-plot',
      '@urban-toolkit/autk-compute',
    ]),
  ],
  optimizeDeps: {
    exclude: [
      '@urban-toolkit/autk-core',
      '@urban-toolkit/autk-map',
      '@urban-toolkit/autk-db',
      '@urban-toolkit/autk-plot',
      '@urban-toolkit/autk-compute',
    ],
  },

  server: {
    fs: {
      allow: ['..'],
    },
    // @ts-ignore
    open: process.env.PLAYWRIGHT ? false : (process.env.VITE_OPEN || '/src/autk-plot/table-click.html'),
    cors: {
      origin: '*',
      allowedHeaders: 'Range, Content-Type, Authorization',
      exposedHeaders: 'Content-Range',
    },
  },
});
