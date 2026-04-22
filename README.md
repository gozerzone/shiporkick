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

Apply SQL in `supabase/migrations/` **in filename order** in the Supabase **SQL Editor** (or `supabase db push`):

1. `20260417_accountability_engine.sql` — `profiles`, `sessions`, RLS, realtime  
2. `20260417_sessions_vouch_count.sql` — `vouch_count` on `sessions`  
3. `20260417_accountability_bonds.sql` — bounty columns + `bounty_tips`  
4. `20260417_foul_button_rpc.sql` — foul RPC + `foul_events`  
5. `20260422_leaderboard_public_read.sql` — anon can read active sessions for the leaderboard  

The UI does **not** yet create a `sessions` row when you go live; until that exists, the leaderboard can be empty even when SQL is applied. Optional smoke test in **SQL Editor**:

```sql
insert into public.profiles (username) values ('test_streamer') returning id;
-- paste returned id:
insert into public.sessions (user_id, task_description, current_health, vouch_count)
values ('PASTE_PROFILE_UUID', 'Smoke test quest', 100, 0);
```

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

## Deploy via Git (Cloudways pulls from GitHub/GitLab/Bitbucket)

Do this **once**, then every deploy is `git push` (plus whatever Cloudways runs on pull).

### 1. Host the repo remotely

- Create a **GitHub** (or GitLab / Bitbucket) repository.
- From your laptop, add the remote and push your default branch (usually `main`):

  ```bash
  git remote add origin https://github.com/YOU/shiporkick.git   # if not already set
  git push -u origin main
  ```

- Never commit **`.env`** (secrets). Only `.env.example` stays in Git. Production `VITE_*` values must be supplied where the **build** runs (step 3).

### 2. Connect Cloudways to that repo

In the Cloudways panel: open the **correct application** for this site → **Deployment via Git** (wording can vary slightly).

- Authorize Cloudways to your Git provider if asked.
- Choose the repository and branch (e.g. `main`).
- Set the deployment path Cloudways documents for that app (often the app folder whose **`public_html`** is the web root).

### 3. Build on the server after each pull

This project is **Vite**: the live site must be the contents of **`dist/`** after `npm run build`. Cloudways should run a **post-pull / deployment hook** that, at minimum:

1. Uses **Node.js 22+** (install or `nvm` in the hook if your stack allows it).
2. Runs `npm ci` then `npm run build` with **`VITE_*` environment variables set** in that environment (Cloudways UI for env vars, or `export` in the hook — same names as `.env.example`).
3. Copies **`dist/`** into **`public_html`** (replace old `index.html` and `assets/` so hashed filenames stay in sync).

Exact paths and hook syntax depend on your Cloudways stack; if their template only runs `composer install`, replace that with the Node + copy steps above or use **GitHub Actions** to build and rsync `dist/` over SSH (alternative).

### 4. After setup

- Each release: commit locally, **`git push origin main`**, then trigger or wait for Cloudways to pull (webhook or “Pull / Deploy” in the panel).
- Hard-refresh once if you previously used aggressive caching; see `.htaccess` rules for `index.html` vs hashed assets.
