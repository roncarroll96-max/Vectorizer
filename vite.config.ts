/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// BASE_PATH lets GitHub Pages serve from /<repo>/; './' works for Netlify and most static hosts.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
