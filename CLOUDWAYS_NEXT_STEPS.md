# Cloudways + Git — what happens next (small steps)

## Already done on this machine (nothing for you to repeat)

- Your latest ShipOrKick code was **committed** and **`git push`’d to** `https://github.com/gozerzone/shiporkick.git` **branch `main`** (commit after `abf46c7`).
- **`dist/` is not in Git** (on purpose — it is in `.gitignore`). The server must **build** after each pull, or you must use another CI step that builds and uploads `dist/`.

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

…and **no** `viewport-fit`, then **the web root was not updated** with a fresh build from the new Git code. Go to **Step 3**.

---

## Step 3 — Make sure Cloudways **builds Vite** and copies **`dist/`** to the web root (you do this; one-time unless already correct)

Cloudways “git success” often means **only `git pull`**. For this project you also need:

1. **Node 22+** available in the environment that runs your hook (Cloudways docs vary by stack).
2. After pull, from the **repo root** on the server, something equivalent to:
   - `npm ci`
   - `npm run build`  
     (with **`VITE_*`** variables set for production — same names as `.env.example`)
3. Then copy **everything inside `dist/`** into **`public_html`** (overwrite old `index.html` and `assets/`).

**Where to configure this in Cloudways**

- Still under **Deployment via GIT**, look for **“Deployment Hook”**, **“Post-deployment script”**, or **“Build / deploy commands”** (exact label varies).
- If you **cannot** find any place to run shell commands, open **Cloudways chat / ticket** and ask: *“Where do I add a post-deployment script to run `npm ci && npm run build` and sync `dist/` to `public_html` for this app?”*

**Checkpoint:** After the next deploy, **Step 2** should show `viewport-fit` in the HTML source.

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
