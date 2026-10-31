# Project instructions

Read automatically at the start of every chat in this repo (same mechanism as
`CLAUDE.md`). Committed to Git, so it applies to every checkout, in Desktop,
Web, CLI and Cloud. Keep it short and specific: checkable rules get followed,
vague preferences get ignored.

## Output style

Keep chat replies short — this is a standing preference for every chat. Lead
with the result, then bullets. No restating the request, no walkthroughs of
steps that are already visible, no recapping what the user can read in a diff.
Long-form sections only when the user asks for a report.

## Commits and pushes

- **Commit and push every change automatically.** Do not leave work sitting
  uncommitted waiting to be asked: finish the edit, commit it with a message
  that says why, and push to the remote the same turn.
- **Still write the `CHANGELOG.md` entry** for anything user-visible (see
  Rules) *before* committing. That entry is the human-readable undo path, so
  an automatic commit can always be rolled back deliberately — `git log`
  alone does not explain how.
- **Never force-push and never rewrite history** to make a push succeed. If a
  push is rejected (diverged branch, no write access), stop and say so plainly
  instead of working around it.

## Vision

**Learnmaxxing** — a website that helps students study, with AI help. People
should be able to walk in with any syllabus and actually learn from it, not
just look at it. It is a real product: it has to be accessible to everyone,
flexible enough that students can shape it to how they actually study, and it
has to make money. Everything below serves those three goals.

## Resume here

Read this before touching code. If the user says **"pick up where we left
off"**, ask the questions below in order (one batch, then wait) instead of
guessing: this list is only as fresh as the last chat that updated it.

1. **What changed outside this file?** Anything shipped, half-built or
   abandoned since the list below was written — app, vault, deploy?
2. **What is next?** The first open item, or a new priority above it?
3. **What is already decided for it?** Host, database, auth, payments, price —
   name what is settled and what is still open, so nothing gets invented.
4. **What must not change?** Files, branches, uncommitted work, live data.
5. **Does it touch money, accounts or AI?** If yes, a server exists first
   (product rule 6); say so rather than faking it in the browser.

Then: update this section, propose one next task, and start it. Do not write a
plan longer than the task. When a task lands, update the list and **Current
state** in the same change — a stale list is worse than none.

### Current state — 2026-10-31

Static site, no backend. The rename to Learnmaxxing is done in the working tree
but **uncommitted** (`git status` shows `index.html`, `app.js`, `README.md`,
`CHANGELOG.md` modified, `AGENTS.md` untracked); branch
`freebuff/50b973c5dac19b8790da0db4`, last commit `4be098c`. Free study features
work. Nothing is paid yet, and there is no server to pay from.

### To-do

`[ ]` open · `[~]` started (say where) · `[x]` done (with date). Mark items
done, never delete them; the record is how the next chat knows what happened.

- [ ] **Commit the rename.** `index.html`, `app.js`, `README.md`,
  `CHANGELOG.md` and `AGENTS.md` exist only on this branch — a fresh clone or
  another machine still says "Chem Study Hub".
- [ ] **Pick the backend and write it down here.** Host, database, auth,
  payments. Required before any AI or billing work: static GitHub Pages cannot
  hold a key or check entitlement.
- [ ] **State the free/paid line in writing**: which AI abilities are paid and
  what stays free forever (product rule 1). Decide before building a paywall.
- [ ] **AI proxy**: server-side calls, per-user limits, entitlement checked on
  every request, no key in client JS.
- [ ] **Accounts, once they exist**: migrate `localStorage` progress with a
  fallback read — never silently drop it (see Rules).
- [ ] **Customization audit**: find visible UI that cannot be changed from
  Look & layout, then add the control or record the exemption here (rule 2).
- [ ] **Accessibility pass**: contrast in every palette, focus rings, 320px,
  `prefers-reduced-motion`, screen-reader headings. Not yet verified end to
  end (rule 4).
- [ ] **Study methods**: multiple choice, flashcards with SRS, open-ended,
  timed exam and upload-to-quiz exist; the next method must plug into the
  shared card model without edits to the others (rule 3).

## Product rules (non-negotiable)

1. **The AI is the paid product.** Everything that is free today stays free
   and stays genuinely usable — notes, reading, quizzes, flashcards, your own
   uploads. Never move an existing free feature behind the paywall; sell the
   *new* capability (AI explaining, generating, grading, tutoring), not access.
2. **Flexibility is the headline feature.** Around 90% of what a student sees
   should be changeable from inside the app, visually, with no code edit and
   no developer: tabs, dashboard widgets, order, palette, font, density,
   photo/quote, quiz defaults, study method, shortcuts. Every customization
   needs a **reset to default** and a default that already looks good.
   New UI is guilty until proven customizable: add the control, or record the
   exemption (and why) in this file.
3. **Study methods are first-class, plural.** A student picks the method, not
   the other way round: multiple choice, open-ended recall, timed exam,
   flashcards with spaced repetition, upload-to-quiz, and whatever comes next.
   One shared card/question model. Adding a method must not require editing
   every other method.
4. **Accessible is a requirement, not a polish pass.** Keyboard-reachable
   everything, visible focus, labelled controls, AA contrast in *every*
   palette, no colour-only signals, readable at 320px, honours
   `prefers-reduced-motion`, and screen-reader-sane headings. A feature that
   fails this is not done.
5. **Revenue without dark patterns.** Honest pricing, cancel as easy as
   subscribe, no fake urgency, no deliberately broken free tier, no surprise
   charges. Students are the customers; treat them like it.
6. **Never trust the client for money.** Entitlement and usage limits are
   checked server-side on every AI call. No API key ever ships to the browser.

## Rules

- Never edit `data.js` by hand; it is generated by `build.py`.
- Never write to the Studying Vault; `build.py` reads `Chemistry/` only.
- **Today** this is a plain static site: no server, no build step, no npm.
  Anything that needs a backend — accounts, billing, AI calls — must add one
  properly, and this file gets updated in the same change that introduces it.
  Do not fake it with a client-side key.
- Secrets live in environment variables / the host's secret store, never in
  the repo, never in client JS, never echoed in chat or logs.
- Plain-JS house style: small modules, `esc()` for anything interpolated into
  HTML, no framework and no TypeScript without a decision recorded here.
- Study progress stays in `localStorage` (key `learnmaxxing.v1`) until
  accounts exist; if accounts land, migrate that data, never silently drop it.
- User-visible changes update `CHANGELOG.md`: what changed, why, and how to
  undo it.
- **Resume here** is kept current: open list, `Current state` and decisions in
  the same change that moves them.
- Product copy says **Learnmaxxing** everywhere: title, brand, nav, docs,
  storage keys. "Chem Study Hub" is gone; don't reintroduce it. Renames happen
  in one pass, never half-done.

## Project facts

- **Is:** Learnmaxxing, currently a static study site built from the Studying
  Vault (Chemistry, CHEM 159). Open `index.html` in a browser.
- **Rebuild data:** `python build.py "C:\Users\bmw27\Documents\Studying Vault"`
  writes `data.js` and `files/source/` (PDFs).
- **Layout:** `build.py` parses the vault; `app.js` holds router, quiz engine,
  spaced repetition, stats, search and the Look & layout page; `library.js` is
  the upload/conversion pipeline (docx, pptx, pdf.js, Google Docs clipboard);
  `ui.js` holds tabs, widgets, palettes, fonts; `styles.css` is the themed
  CSS with `--` custom properties.
- **Generated:** `data.js`, `files/source/`. Regenerate rather than hand-edit.
- **Deploy:** GitHub Pages (`.nojekyll`), so paths stay relative and
  case-exact. A paid AI feature needs a real host, billing and a server-side
  proxy — plan that move before shipping the paywall.
- **Persistence:** `learnmaxxing.v1` in `localStorage` (progress, uploads,
  layout, palette, font). Old `chem-study-hub.v1` saves are read once and
  migrated on save — keep that fallback until it is safe to drop. Stats →
  Export is the backup path.

## Keys

Space show answer · 1/2/3 grade · Enter next · F flag · ←/→ in exam.
