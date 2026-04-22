/**
 * Vite copies `public/` into `dist/` after the HTML transform. A stray `public/index.html`
 * overwrites `dist/index.html` and leaves `/src/main.tsx` — publish-dist then aborts.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bad = path.join(root, 'public', 'index.html')

if (fs.existsSync(bad)) {
  console.error(
    'check-no-public-index-html: Remove public/index.html\n\n' +
      'Vite must use the root index.html only. A file at public/index.html is copied into dist/ last\n' +
      'and overwrites the built index (you keep /src/main.tsx and the live site breaks).\n\n' +
      'Fix: rm -f public/index.html   then: npm run build\n',
  )
  process.exit(1)
}
