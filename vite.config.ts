import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const GUEST_SHELL_RE =
  /\s*<script\b[^>]*\bsrc=["']https:\/\/images\.aiwaves\.tech\/alteru\/guest-shell\.js["'][^>]*>\s*<\/script>/gi;

// Crazy Games rejects an AlterU login wall. Strip guest-shell only from that
// build; `npm run build` (default mode) keeps the script in index.html.
function stripGuestShellPlugin(): Plugin {
  return {
    name: 'strip-alteru-guest-shell',
    transformIndexHtml(html) {
      return html.replace(GUEST_SHELL_RE, '');
    },
  };
}

// The watermark module imports its stylesheet as a side effect, so Rollup
// keeps that CSS even after the unused React element is tree-shaken.
// Replace the module in the guest build before that import is followed.
function stripGuestWatermarkPlugin(): Plugin {
  return {
    name: 'strip-alteru-watermark',
    enforce: 'pre',
    transform(_code, id) {
      if (!id.includes('/src/BlockParty/AlteruWatermark.tsx')) return null;
      return 'export function AlteruWatermark(){return null}\n';
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Relative base so the bundle loads inside a Crazy Games (or Pages) iframe
  // regardless of the host path.
  base: './',
  resolve: { alias: { '@shared': path.resolve(__dirname, 'src/shared') } },
  plugins: [
    react(),
    ...(mode === 'crazygames' ? [stripGuestShellPlugin(), stripGuestWatermarkPlugin()] : []),
  ],
  css: {
    preprocessorOptions: {
      less: { javascriptEnabled: true },
    },
  },
  build: {
    outDir: mode === 'crazygames' ? 'dist-crazygames' : 'dist',
    emptyOutDir: true,
  },
}));
