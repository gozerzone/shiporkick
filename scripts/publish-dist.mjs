/**
 * Copy Vite dist/ into the Apache web root (same directory as package.json by default).
 * Requires SHIPORKICK_CLOUDWAYS_DEPLOY=1 so local dev does not overwrite index.html by mistake.
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
if (distHtml.includes('/src/main')) {
  console.error('publish-dist: dist/index.html still references /src/main — aborting.')
  process.exit(1)
}
if (!distHtml.includes('/assets/')) {
  console.error('publish-dist: dist/index.html has no /assets/ — aborting.')
  process.exit(1)
}

fs.copyFileSync(distIndex, path.join(publishRoot, 'index.html'))

const outAssets = path.join(publishRoot, 'assets')
fs.rmSync(outAssets, { recursive: true, force: true })
fs.cpSync(path.join(distDir, 'assets'), outAssets, { recursive: true })

for (const name of [
  'runtime-config.json',
  'runtime-config.example.json',
  'favicon.svg',
  'icons.svg',
]) {
  const src = path.join(distDir, name)
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(publishRoot, name))
  }
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

console.log(`publish-dist: OK — published into ${publishRoot}`)
