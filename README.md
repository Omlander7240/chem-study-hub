# Learnmaxxing

Static site built from the Studying Vault (Chemistry, CHEM 159). No server, no npm. Open `index.html` in a browser.

## Rebuild after editing the vault

```bash
python build.py "C:\Users\bmw27\Documents\Studying Vault"
```

`build.py` reads `Chemistry/` only, never writes to the vault, and writes `data.js` plus `files/source/` (PDFs).

## Files

- `build.py`: parses notes, practice questions, extra practice, flashcards, schedule, formula sheet.
- `app.js`: router, quiz engine, spaced repetition, stats, search. Progress lives in this browser's localStorage. Use Stats → Export to back it up.
- `styles.css`: light/dark theme.

## Quiz modes

- Quiz builder: pick chapters, question set (all, unseen, weak, due, flagged, practice, extra), count, order, practice or timed exam.
- Practice: multiple choice auto-grades. Open-ended: Space shows answer, then 1 Missed / 2 Partial / 3 Got it. Hint and Check-number buttons.
- Exam: timed, answers hidden, you grade each answer at the end.
- Flashcards: Again / Hard / Good / Easy scheduling.

Keys: Space show · 1/2/3 grade · Enter next · F flag · ←/→ in exam.
