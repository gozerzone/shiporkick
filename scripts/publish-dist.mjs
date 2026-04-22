/**
 * Copy Vite dist/ into the Apache web root (same directory as package.json by default).
 * Requires SHIPORKICK_CLOUDWAYS_DEPLOY=1 so local dev does not overwrite index.html by mistake.
 * On Cloudways, this is invoked from npm postbuild (via publish-dist-if-enabled.mjs) after vite build.
 *
 * Order matters: refresh `assets/` *before* replacing `index.html`, otherwise visitors briefly
 * get new HTML pointing at new hashed bundles that are not on disk yet (white page).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

if (process.env.SHIPORKICK_CLOUDWAYS_DEPLOY !== '1') {
  console.error(
    'publish-dist: refusing to copy (set SHIPORKICK_CLOUDWAYS_DEPLOY=1 on the server).',
  )
  process.exit(1)
}

const publishRoot = process.env.SHIPORKICK_WEBROOT
  ? path.resolve(process.env.SHIPORKICK_WEBROOT)
  : root

const distDir = path.join(root, 'dist')
const distIndex = path.join(distDir, 'index.html')

if (!fs.existsSync(distIndex)) {
  console.error('publish-dist: dist/index.html missing — run npm run build first.')
  process.exit(1)
}

const distHtml = fs.readFileSync(distIndex, 'utf8')
/** True if a real Vite *dev* module entry is present (not string literals in our inline boot script). */
function distHasDevModuleEntry(html) {
  return (
    /<script[^>]*\btype=["']module["'][^>]*\bsrc=["']\/src\/main/.test(html) ||
    /<script[^>]*\bsrc=["']\/src\/main[^>]*\btype=["']module/.test(html)
  )
}
if (distHasDevModuleEntry(distHtml)) {
  console.error(
    'publish-dist: dist/index.html still has a dev module script (src=/src/main…). Build misconfigured or public/index.html overwrote dist — aborting.',
  )
  process.exit(1)
}
if (!distHtml.includes('/assets/')) {
  console.error('publish-dist: dist/index.html has no /assets/ — aborting.')
  process.exit(1)
}

const outIndex = path.join(publishRoot, 'index.html')
const outAssets = path.join(publishRoot, 'assets')

try {
  fs.rmSync(outAssets, { recursive: true, force: true })
  fs.cpSync(path.join(distDir, 'assets'), outAssets, { recursive: true })
} catch (err) {
  const code = err && typeof err === 'object' && 'code' in err ? err.code : ''
  console.error(
    `publish-dist: cannot refresh assets/ (${String(code)}). ` +
      'On Cloudways, SSH as the APPLICATION user (Access Details), not master_…',
  )
  process.exit(1)
}

/** Cloudways: `master_*` SSH often cannot write files owned by the application user in public_html. */
function copyIndexToWebRoot() {
  try {
    fs.copyFileSync(distIndex, outIndex)
    return
  } catch (first) {
    try {
      fs.writeFileSync(outIndex, fs.readFileSync(distIndex))
      return
    } catch (second) {
      const code =
        (first && typeof first === 'object' && 'code' in first && first.code) ||
        (second && typeof second === 'object' && 'code' in second && second.code) ||
        ''
      console.error(
        `publish-dist: cannot write index.html (${String(code)}).\n` +
          'On Cloudways, SSH as the APPLICATION user (Access Details → Application credentials —\n' +
          'username like your app id, not "master_..."), then run this script again.\n' +
          'Or copy dist/index.html to the web root in File Manager while logged in as the app owner.',
      )
      process.exit(1)
    }
  }
}

copyIndexToWebRoot()

/** Best-effort only: Cloudways `master_*` often cannot overwrite app-owned config in public_html. */
function tryCopyOptionalRootFile(name) {
  const src = path.join(distDir, name)
  if (!fs.existsSync(src)) return
  const dest = path.join(publishRoot, name)
  try {
    fs.copyFileSync(src, dest)
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : ''
    console.warn(
      `publish-dist: could not copy ${name} (${String(code)}). ` +
        'Core bundle is already published. Fix: SSH as application user, chmod/chown, or upload this file manually.',
    )
  }
}

for (const name of [
  'runtime-config.json',
  'shiporkick-runtime.json',
  'runtime-config.example.json',
  'favicon.svg',
  'icons.svg',
]) {
  tryCopyOptionalRootFile(name)
}

const distHtaccess = path.join(distDir, '.htaccess')
const outHtaccess = path.join(publishRoot, '.htaccess')
if (fs.existsSync(distHtaccess)) {
  try {
    fs.copyFileSync(distHtaccess, outHtaccess)
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : ''
    console.warn(
      `publish-dist: could not write .htaccess (${String(code)}). ` +
        'Cloudways often locks the web-root file; SPA rewrite rules may already exist. App bundle was published.',
    )
  }
}

const published = fs.readFileSync(path.join(publishRoot, 'index.html'), 'utf8')
if (!published.includes('/assets/')) {
  console.error('publish-dist: published index.html has no /assets/.')
  process.exit(1)
}

const assetRefs = new Set(
  [...published.matchAll(/["'](\/assets\/[^"']+)["']/g)].map((m) => m[1]),
)
for (const ref of assetRefs) {
  const rel = ref.startsWith('/') ? ref.slice(1) : ref
  const fp = path.join(publishRoot, rel)
  if (!fs.existsSync(fp)) {
    console.error(
      `publish-dist: index.html references ${ref} but that file is missing under ${publishRoot}.`,
    )
    process.exit(1)
  }
}

console.log(`publish-dist: OK — published into ${publishRoot}`)
