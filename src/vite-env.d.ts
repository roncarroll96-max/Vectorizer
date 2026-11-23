/** Injected by vite.config.ts at build time. */
declare const __BUILD_INFO__: {
  version: string;
  /** Short commit hash, or '' outside a git checkout. */
  commit: string;
  /** Link to the commit on GitHub (only for CI builds). */
  commitUrl: string;
  /** ISO timestamp of the build. */
  builtAt: string;
};
