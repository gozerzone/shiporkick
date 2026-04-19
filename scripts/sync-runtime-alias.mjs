/**
 * Post-build: duplicate runtime-config.json as shiporkick-runtime.json so hosts that 404
 * the primary name still serve config (Cloudways / nginx quirks).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const primary = path.join(dist, 'runtime-config.json')
const alias = path.join(dist, 'shiporkick-runtime.json')

if (fs.existsSync(primary)) {
  fs.copyFileSync(primary, alias)
}
