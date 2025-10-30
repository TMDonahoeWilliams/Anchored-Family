# Anchored Family – Meal Planner MVP (Web-first)

A cost-efficient starter repo built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, and **Supabase**.  
It ships a small MVP: pantry CRUD, recipe search by ingredients (Spoonacular proxy), grocery list, and simple auth/household.

## Quick Start

### 1) Prereqs
- Node 18+ and pnpm (or npm/yarn)
- Supabase account (free) → create a project at https://app.supabase.com/
- Spoonacular API key (free tier) → https://spoonacular.com/food-api

### 2) Clone & Install
```bash
pnpm install
# or: npm install / yarn
```

### 3) Environment Variables
Copy `.env.example` → `.env.local` and fill in values:

```
# App
NEXT_PUBLIC_APP_NAME=Anchored Family
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=optional-for-scripts

# Spoonacular (proxy server route uses this)
SPOONACULAR_API_KEY=your-spoonacular-api-key
```

### 4) Initialize Database
- In the Supabase SQL editor, run everything in `supabase/schema.sql`.
- In **Authentication → Providers**, enable **Email** (magic link or password).

### 5) Dev
```bash
pnpm dev
# visit http://localhost:3000
```

### 6) Deploy
- **Vercel**: connect repo → set env vars → deploy.
- **Supabase**: ensure URL + anon key match prod project.

### 7) Mobile later
- Solidify PWA (manifest + icons).
- Wrap with **Capacitor** when ready for App Store/Play.

## Project Structure
```
app/                 # App Router pages & API routes
components/          # UI components
lib/                 # clients & utilities (supabase, types)
supabase/            # SQL schema & policies
public/              # icons and PWA assets
styles/              # Tailwind globals
```

---

## Notes
- This is intentionally minimal; expand tables/UX as you grow.
- Security: Row Level Security (RLS) policies provided as a base—adjust to your needs.
- Replace any placeholder UI with your brand (logo, colors).
