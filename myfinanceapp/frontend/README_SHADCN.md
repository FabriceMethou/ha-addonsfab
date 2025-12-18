Quick notes: shadcn/Tailwind experiment

- Purpose: Tailwind + Radix-backed components (originally sat alongside MUI; the app now uses shadcn/Tailwind by default).
- How to run locally:

1. From `frontend/` install deps:

```bash
npm install
# or
pnpm install
```

2. Start dev server:

```bash
npm run dev
```

3. Open `http://localhost:5173/shadcn` to view the shadcn component demo page.

- What changed:
  - Added Tailwind/PostCSS config and `src/index.css` with Tailwind directives.
  - Added a small `src/components/shadcn` folder with a `Button` and `Dialog` (Radix).
  - Added `src/pages/ShadcnDemoPage.tsx` and a route at `/shadcn`.

Notes: You may prefer `pnpm` for faster installs. Tailwind and Radix packages were added to `package.json` — run install to fetch them.
