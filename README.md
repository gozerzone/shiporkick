# ShipOrKick

Battle out for the best and longest work streak. Get it done.

## Stack

- Vite + React + TypeScript
- Tailwind v4 (`@tailwindcss/vite`)
- LiveKit (`livekit-client`, `@livekit/components-react`)
- Supabase (`@supabase/supabase-js`)

## Requirements

- **Node.js 22+** (see `.nvmrc`; `package.json` `engines` enforces this for tooling that respects it)

## Local development

```bash
npm install
cp .env.example .env
# Fill VITE_* keys in .env, then:
npm run dev
```

Apply SQL in `supabase/migrations/` in your Supabase project (SQL Editor or Supabase CLI).

## Build

```bash
npm run build
```

## Deploy static site (e.g. Cloudways)

This app is a **static front-end** after build. Cloudways “PHP default” pages appear when **nothing from `dist/` is in the document root** (or the wrong folder is set).

1. **Build** on your machine (or CI):

   ```bash
   npm ci
   npm run build
   ```

2. **Upload only the contents of `dist/`** (not the whole repo) into your site’s **web root** — on Cloudways that is usually `public_html` for that application (or the **Primary Domain** folder shown in the app).

   You must see **`index.html`** at the root of that folder, plus `assets/`, etc.

3. **Remove or rename** the default `index.php` (or other placeholder) if it is still there and takes precedence over `index.html` (depends on server “DirectoryIndex” order; if the PHP page still wins, delete/rename `index.php`).

4. **Apache**: `public/.htaccess` is copied into `dist/` on build so client-side routes work. If your stack is **Nginx-only**, add an equivalent `try_files $uri $uri/ /index.html;` in the vhost for that domain (Cloudways: Application Settings / Nginx settings or support doc for your stack).

5. **Environment**: Vite bakes `VITE_*` at **build time**. For production keys, set them on the machine that runs `npm run build`, or use your CI secrets, then rebuild and re-upload `dist/`.

If you still see a PHP page after uploading `dist/`, the domain is almost certainly still mapped to **another application** or **another folder** — in Cloudways, open that domain’s application and confirm **Deployment Path / public_html** matches where you uploaded the files.
