// esbuild.js — build script for the extension host

const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',

  platform: 'node',
  external: ['vscode'],

  format: 'cjs',
  sourcemap: !isProduction,
  minify: isProduction,
};

if (isWatch) {
  esbuild.context(options).then(ctx => {
    ctx.watch();
    console.log('[esbuild] watching for changes...');
  });
} else {
  esbuild.build(options).then(() => {
    console.log('[esbuild] build complete');
  }).catch(() => process.exit(1));
}
