# Cloudways + Git — what happens next (small steps)

## Already done on this machine (nothing for you to repeat)

- Your latest ShipOrKick code was **committed** and **`git push`’d to** `https://github.com/gozerzone/shiporkick.git` **branch `main`**.
- **`dist/` is not in Git** (on purpose — it is in `.gitignore`). The server must **run `npm run build`** after each pull and **publish `dist/` into the real web root** (`public_html`), or the live site will never change.

---

## Diagnosis (if View Source still has NO `viewport-fit`)

That means **GitHub is ahead of what `shiporkick.com` is serving**.

- **GitHub `main` is correct.** Example: the source `index.html` on GitHub includes `viewport-fit=cover` (open  
  `https://raw.githubusercontent.com/gozerzone/shiporkick/main/index.html` in a browser and search for `viewport-fit`).
- **Your domain is still serving an old built file** from **`public_html`** (old `index.html` + old `/assets/index-….js`).

So: **Cloudways “Git deploy success” is not updating `public_html` with a fresh Vite build.** Usually the deploy only **pulled** the repo somewhere else, or pulled but **never ran `npm run build` + copy `dist/`**.

You need **Step 3a → 3b** below.

---

## Step 1 — Pull the new code on Cloudways (you do this)

1. Log in to **Cloudways**.
2. Open the **same application** that serves **shiporkick.com** (not a different app by mistake).
3. In the left sidebar, click **“Deployment via GIT”** (or the name closest to that).
4. Find the button that means **deploy / pull latest** (often **“Pull”**, **“Deploy”**, or **“Update deployment”**). Click it once.
5. Wait until it finishes (**success**). If it fails, copy the **error text** (you can paste it in chat later).

**Checkpoint:** You should see a new deployment log entry with today’s time.

---

## Step 2 — Confirm the live site is reading the new `index.html` (you do this)

1. On your phone or laptop, open **`https://shiporkick.com/`**.
2. Use **“View Page Source”** (not Inspect Element’s Network tab — actual HTML source).
3. Search the page for: **`viewport-fit`**

**What you want to see**

- A line like: `content="width=device-width, initial-scale=1, viewport-fit=cover"`
- A line like: `http-equiv="Cache-Control"` with `no-cache`

**If you still see only**

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

…and **no** `viewport-fit`, then **the web root was not updated** with a fresh build from the new Git code. Go to **Step 3a**.

---

## Step 3a — Find where the live site really lives (you do this, ~5 minutes)

Do this so we know **which folder** must get `dist/`.

### Option A — Cloudways File Manager (easiest)

1. Cloudways → **your ShipOrKick application**.
2. Open **“Application Management”** (or **“Access Details”**) and launch **File Manager** / **“Launch SSH Terminal”** area — you need the path that contains **`public_html`** for this app.
3. In File Manager, open **`public_html`**.
4. Click **`index.html`** → **Edit** or **Download**.
5. Search inside that file for **`viewport-fit`**.
   - **If it is missing** here too, then **`public_html/index.html` was never replaced** after your Git deploy. That confirms the problem is **build / copy**, not your laptop.

### Option B — SSH (if you use the terminal)

1. Cloudways → **Master Credentials** / **SSH** → connect with the credentials they show.
2. Run:

   ```bash
   cd ~/applications && ls
   ```

   You should see one folder per app (odd-looking name). `cd` into the folder that is **this** ShipOrKick app (if unsure, repeat the steps below in each until you find `shiporkick` / `package.json`).

3. Then:

   ```bash
   find . -maxdepth 4 -name index.html 2>/dev/null
   ```

4. For **each** path printed, run:

   ```bash
   head -15 ./PATH/TO/index.html
   ```

   The one that matches **what you see in the browser** (old viewport, old `/assets/index-…`) is the file Cloudways must **overwrite** when you deploy.

**Write down** the directory that contains that `index.html` (call it **WEBROOT**). Often it is `.../public_html`.

---

## Step 3a-node — Your server is on Node 18 (required: Node 22)

If `npm run build` prints **“Vite requires Node.js version 20.19+ or 22.12+”** or **`CustomEvent is not defined`**, the server’s default Node is **too old**.

**One-time setup (SSH as `master`, home directory):**

1. Install **nvm** (Cloudways-friendly, no sudo), then Node **22**:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   source ~/.bashrc
   nvm install 22
   nvm alias default 22
   node -v
   ```

   You want `node -v` to show **v22.x.x**.

2. If `nvm` is already installed, only run:

   ```bash
   source ~/.bashrc
   nvm install 22
   nvm use 22
   node -v
   ```

### SSH still shows Node 18 (`v18.x.x`) when you run `node -v`

Cloudways’ **non-interactive** SSH often **does not load `~/.bashrc`**, so **`nvm` is never initialized** and **`node`** resolves to the system binary (**Node 18**). The deploy hook is fine because **`cloudways-deploy.sh` sources `nvm.sh` itself**; your **manual** `npm run build` is not.

**Option A — one session (copy/paste before `npm run build`):**

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd /home/master/applications/qereqenxmn/public_html
nvm install   # reads .nvmrc (22) from the repo
nvm use
node -v
npm run build
```

**Option B — make every SSH login use Node 22:** append the same `NVM_DIR` + `source nvm.sh` block to **`~/.bashrc`**, then run **`nvm alias default 22`**. Ensure **`~/.bash_profile`** exists and contains **`[ -f ~/.bashrc ] && . ~/.bashrc`** (some hosts only run `.bash_profile` for SSH). Log out and back in; **`which node`** should be under **`~/.nvm/versions/node/`**.

**Why `npm ci` failed with “Missing … from lock file”**  
That often happens when **`npm ci` runs under an old npm/Node** or the server had a **stale** `package-lock.json`. After Node 22 is active, use **`npm install`** once in `public_html` (it updates `node_modules` to match the lock more forgivingly). On your laptop, `npm ci` already passes with Node 22+.

**Do not use** `rsync --delete dist/ ./` when the **whole Git repo** lives in `public_html` — it can delete `package.json`, `src/`, etc. Use the **copy commands** below instead.

---

## Step 3b — Add a deployment hook that builds Vite and publishes `dist/` (you do this)

**Prerequisite:** Either define **environment variables** in Cloudways for every `VITE_*` key you need (they are baked in at `npm run build`), **or** skip secrets in the panel and ship **`/runtime-config.json`** in **`public_html`** (same folder as `index.html`) so LiveKit + Supabase work **without** rebuilding when you only rotate keys. Copy `public/runtime-config.example.json` from the repo, rename to **`runtime-config.json`**, fill in **`VITE_LIVEKIT_TOKEN`**, **`VITE_LIVEKIT_ROOM`** (must match the JWT room), and your Supabase keys. The app loads this file on startup.

Then, under **Deployment via GIT**, find the field for a **shell script** that runs **after** git pull. Paste a script that matches **your layout**.

Every script should **load nvm** and **`nvm use 22`** before `npm`:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22
```

### Layout 1 — Git repo files live **directly** in `public_html` (your case: `qereqenxmn`)

Replace the folder name if yours differs. The repo ships **`cloudways-deploy.sh`**: it runs **`npm install` + `npm run build`**, then copies **`dist/`** into the real web root so `index.html` references **`/assets/…`** (a plain Git pull alone restores the dev `index.html` and blanks the site until this runs).

```bash
#!/bin/bash
set -e
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22

cd /home/master/applications/qereqenxmn/public_html
export SHIPORKICK_CLOUDWAYS_DEPLOY=1
bash ./cloudways-deploy.sh
```

### Layout 2 — Git repo is in a **subfolder** (e.g. `public_html/shiporkick/` has `package.json`)

```bash
#!/bin/bash
set -e
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22

cd /home/master/applications/YOUR_APP_FOLDER/public_html/shiporkick
export SHIPORKICK_CLOUDWAYS_DEPLOY=1
export SHIPORKICK_WEBROOT="$(pwd)/.."
bash ./cloudways-deploy.sh
```

### `bash: ./cloudways-deploy.sh: No such file or directory`

The server’s Git checkout is **older than** the commit that added `cloudways-deploy.sh`. From **`public_html`** run:

```bash
git fetch origin && git reset --hard origin/main
```

(or `git pull origin main` if you prefer a merge). Confirm with `ls cloudways-deploy.sh`, then run the hook again.

**If you already ran `npm run build` and only need to fix the live site right now** (no `git pull` yet), copy `dist/` into the web root manually:

```bash
cp -f dist/index.html ./index.html
rm -rf assets && cp -R dist/assets ./assets
test -f dist/.htaccess && cp -f dist/.htaccess ./.htaccess || true
```

**Hook without relying on the shell script** (after the repo has `scripts/publish-dist.mjs` from Git):

```bash
cd /home/master/applications/qereqenxmn/public_html
export SHIPORKICK_CLOUDWAYS_DEPLOY=1
npm install
npm run build
npm run publish:dist
```

### `EPERM` when copying `.htaccess`

Some Cloudways stacks **block overwriting** `public_html/.htaccess` from SSH/Node (immutable or platform-owned file). **`publish-dist` still completes** — it copies **`index.html`** and **`assets/`** first, then **warns** if `.htaccess` cannot be written. If the homepage is **blank** and the console shows module scripts with MIME type **`application/octet-stream`**, your web root is missing the **`AddType` / `Header set Content-Type`** rules for **`*.js`**. Copy the **`mod_mime` + `mod_headers` blocks** from the repo’s **`public/.htaccess`** into the existing **`public_html/.htaccess`** via **File Manager** (append or merge), or ask Cloudways to allow the deploy user to overwrite that file. You still need SPA rewrite rules from the same file for deep links.

### After saving the hook

1. Click **Deploy / Pull** once more.
2. Read the **deployment log**. If the hook fails, the log usually shows **`npm: command not found`** (Node not installed for that user) or **`Permission denied`** (run **Reset Permissions** in Application Settings, then redeploy — Cloudways docs mention this for `npm`).

**Checkpoint:** **Step 2** again — View Source on `https://shiporkick.com` must show **`viewport-fit`**.

---

## Step 3c — If there is no hook field anywhere

Open **Cloudways live chat / ticket** and paste this one sentence:

> “My Node/Vite app deploys from GitHub but only `git pull` runs. I need a post-deployment script to run `npm ci && npm run build` in my repo path and `rsync` the `dist/` folder into `public_html`. Which UI field should I use on Flexible, and what is the correct absolute path for this application?”

They will give you the exact path string for your server.

---

## Step 4 — Your routine from now on (you do this each time you change the app)

On your Mac, in the project folder:

```bash
git status
git add -A
git commit -m "describe your change"
git push origin main
```

Then in Cloudways: **pull / deploy** again (Step 1).

**Rule of thumb:** If you only edit files locally but **never commit + push**, GitHub (and Cloudways) **cannot** see those edits.

---

## If you get stuck

Reply with:

1. Whether **Step 2** shows `viewport-fit` or not.
2. A **screenshot or copy-paste** of your **deployment hook / script** (remove any secrets).
3. Whether Cloudways shows **Node** version anywhere for that application.

Then we can narrow it to “hook wrong” vs “wrong folder” vs “wrong app” in one more round.
