/**
 * Build script for frontend using esbuild
 * Produces self-contained static files in dist/
 * Pass --watch for hot-reload dev mode
 */
import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, 'src');
const dist = join(__dirname, 'dist');
const isWatch = process.argv.includes('--watch');

// Ensure dist directory
mkdirSync(dist, { recursive: true });

const esbuildConfig = {
  entryPoints: [join(src, 'main.tsx')],
  bundle: true,
  outfile: join(dist, 'bundle.js'),
  format: 'iife',
  globalName: 'App',
  jsx: 'automatic',
  jsxImportSource: 'react',
  loader: { '.tsx': 'tsx', '.ts': 'ts' },
  define: { 'process.env.NODE_ENV': isWatch ? '"development"' : '"production"' },
  minify: !isWatch,
  target: 'es2020',
  plugins: [{
    name: 'html-writer',
    setup(build) {
      build.onEnd(() => { writeHtml(); });
    },
  }],
};

function writeHtml() {
  let html = readFileSync(join(__dirname, 'index.html'), 'utf-8');
  html = html.replace(
    '<script type="module" src="/src/main.tsx"></script>',
    '<script src="bundle.js"></script>'
  );
  writeFileSync(join(dist, 'index.html'), html);
}

function report() {
  const size = readFileSync(join(dist, 'bundle.js')).length;
  console.log(`  bundle.js (${(size / 1024).toFixed(1)}KB)`);
}

async function main() {
  if (isWatch) {
    const ctx = await esbuild.context(esbuildConfig);
    await ctx.watch();
    writeHtml();
    console.log('Watching frontend for changes...\n');
  } else {
    await esbuild.build(esbuildConfig);
    writeHtml();
    console.log('Frontend built!');
    report();
  }
}

main().catch(e => { console.error('Build failed:', e); process.exit(1); });
