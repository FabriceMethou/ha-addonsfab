Quick notes: shadcn/Tailwind experiment

- Purpose: Add Tailwind + Radix-backed components alongside existing MUI so you can try shadcn-style UI without removing MUI.
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

3. Open `http://localhost:5173/shadcn` to view the demo page that shows both MUI and shadcn components.

- What changed:
  - Added Tailwind/PostCSS config and `src/index.css` with Tailwind directives.
  - Added a small `src/components/shadcn` folder with a `Button` and `Dialog` (Radix).
  - Added `src/pages/ShadcnDemoPage.tsx` and a route at `/shadcn`.
  - Kept MUI and the rest of the app untouched.

Notes: You may prefer `pnpm` for faster installs. Tailwind and Radix packages were added to `package.json` — run install to fetch them.
