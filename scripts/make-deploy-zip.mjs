/**
 * Builds a zip of dist/ layout suitable for extracting into Cloudways public_html
 * when application SSH is unavailable (use File Manager → Upload → Extract).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const distDir = path.join(root, 'dist')
const staging = path.join(root, '.deploy-zip-staging')
const outZip = path.join(root, 'shiporkick-webroot.zip')

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('make-deploy-zip: run `npm run build` first (dist/index.html missing).')
  process.exit(1)
}

fs.rmSync(staging, { recursive: true, force: true })
fs.mkdirSync(staging, { recursive: true })
fs.cpSync(distDir, staging, { recursive: true })

fs.rmSync(outZip, { force: true })

try {
  execFileSync('zip', ['-r', '-q', outZip, '.'], { cwd: staging, stdio: 'inherit' })
} catch {
  console.error(
    'make-deploy-zip: the `zip` CLI was not found. On macOS it is preinstalled; on Windows use WSL or install Info-ZIP, then re-run.',
  )
  fs.rmSync(staging, { recursive: true, force: true })
  process.exit(1)
}

fs.rmSync(staging, { recursive: true, force: true })

const stat = fs.statSync(outZip)
console.log(
  `make-deploy-zip: wrote ${outZip} (${Math.round(stat.size / 1024)} KB)\n` +
    'Upload this zip in Cloudways File Manager → open public_html → Upload → Extract here (overwrite).',
)
