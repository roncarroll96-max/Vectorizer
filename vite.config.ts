/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Version info baked into the build: package version, commit and build date. */
function buildInfo() {
  const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
  let commit = process.env.GITHUB_SHA ?? '';
  if (!commit) {
    try { commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git checkout */ }
  }
  const repo = process.env.GITHUB_REPOSITORY;
  return {
    version,
    commit: commit.slice(0, 7),
    commitUrl: repo && commit ? `https://github.com/${repo}/commit/${commit}` : '',
    builtAt: new Date().toISOString(),
  };
}

// BASE_PATH lets GitHub Pages serve from /<repo>/; './' works for Netlify and most static hosts.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react()],
  define: { __BUILD_INFO__: JSON.stringify(buildInfo()) },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
