# ShipOrKick

Battle out for the best and longest work streak. Get it done.

## Stack

- Vite + React + TypeScript
- Tailwind v4 (`@tailwindcss/vite`)
- LiveKit (`livekit-client`, `@livekit/components-react`)
- Supabase (`@supabase/supabase-js`)

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
