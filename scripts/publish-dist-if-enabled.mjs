/**
 * Invoked from npm postbuild. When SHIPORKICK_CLOUDWAYS_DEPLOY=1 (Cloudways hook), copies
 * dist/ into the web root so Apache serves hashed bundles. No-op locally when unset.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.env.SHIPORKICK_CLOUDWAYS_DEPLOY !== '1') {
  process.exit(0)
}

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'publish-dist.mjs')
const r = spawnSync(process.execPath, [script], { stdio: 'inherit', env: process.env })
process.exit(r.status ?? 1)
