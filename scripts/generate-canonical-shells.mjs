// Post-build step: Angular is a pure client-rendered SPA (no SSR), so
// dist/index.html is served as-is for every route via Vercel's rewrite/
// cleanUrls, and it always carries the same static
// <link rel="canonical" href="https://hachinohenishibaseball.com/">.
// Search engines that don't wait for the client-side canonical update
// (set by SEOService) see every subpage canonicalized to the homepage.
//
// This script copies dist/index.html once per known route, rewriting only
// the canonical tag to that route's own URL, so the RAW HTML already has
// the correct canonical before any JS runs. Vercel's `cleanUrls: true`
// then serves e.g. dist/about.html for a request to /about.
//
// Route lists are derived from the same source data the app itself uses
// (not hardcoded here) to avoid the sitemap.xml drift we hit earlier.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST_DIR = resolve(ROOT, 'dist');
const BASE_URL = 'https://hachinohenishibaseball.com';

const STATIC_ROUTES = [
  '/about',
  '/match-results',
  '/support',
  '/contact',
  '/activities',
  '/alumni-activities',
  '/privacy-policy',
  '/game',
  '/game/homerun',
  '/game/pitching',
  '/game/catch',
];

function extractActivityIds() {
  const src = readFileSync(
    resolve(ROOT, 'src/components/activity-detail/activity-detail.component.ts'),
    'utf-8'
  );
  return [...src.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
}

function extractAlumniVoiceIds() {
  const json = JSON.parse(
    readFileSync(resolve(ROOT, 'src/assets/data/alumni-voices.json'), 'utf-8')
  );
  return json.map((voice) => voice.id);
}

const dynamicRoutes = [
  ...extractActivityIds().map((id) => `/activity/${id}`),
  ...extractAlumniVoiceIds().map((id) => `/alumni-voice/${id}`),
];

const routes = [...STATIC_ROUTES, ...dynamicRoutes];

const shellPath = join(DIST_DIR, 'index.html');
const shellHtml = readFileSync(shellPath, 'utf-8');
const CANONICAL_RE = /<link rel="canonical" href="[^"]*"\s*\/?>/;

if (!CANONICAL_RE.test(shellHtml)) {
  throw new Error(`generate-canonical-shells: no <link rel="canonical"> found in ${shellPath}`);
}

// Guard against a flash of unstyled content (FOUC). The app is a client-rendered
// SPA whose shell body is just <app-root>, so build-time critical-CSS extraction
// finds nothing to inline and instead defers the whole Tailwind bundle with
// `media="print" onload="this.media='all'"`. Angular then renders the full DOM
// before that CSS applies, and the raw, unstyled page shows for a moment.
// The stylesheet must stay render-blocking - see `inlineCritical: false` in
// angular.json. Fail the build if anything reintroduces the deferred form.
const DEFERRED_STYLESHEET_RE = /<link[^>]*rel="stylesheet"[^>]*href="styles-[^"]*\.css"[^>]*media="print"/;

if (DEFERRED_STYLESHEET_RE.test(shellHtml)) {
  throw new Error(
    'generate-canonical-shells: the app stylesheet is loaded with media="print" ' +
      '(non-render-blocking), which causes a flash of unstyled content on first load. ' +
      'Ensure optimization.styles.inlineCritical is false in angular.json.'
  );
}

let count = 0;
for (const route of routes) {
  const canonicalUrl = `${BASE_URL}${route}`;
  const html = shellHtml.replace(CANONICAL_RE, `<link rel="canonical" href="${canonicalUrl}">`);

  const outPath = `${join(DIST_DIR, route)}.html`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  count++;
}

console.log(`generate-canonical-shells: wrote ${count} canonical-corrected HTML shells for ${routes.length} routes.`);
