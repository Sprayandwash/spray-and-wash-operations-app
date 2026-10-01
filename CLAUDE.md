# Repo instructions for Claude

## Feedback/bug-report sessions — always wait for the explicit go-ahead

During any feedback/bug-report session with Brendan, do not start
implementing, committing, pushing or building anything — not even a fix
phrased as a direct instruction ("rename this", "change this colour") —
until Brendan explicitly confirms he is finished giving feedback and gives
the go-ahead to proceed.

- Acknowledge/log each item as it comes in, but treat the whole batch as
  queued until that explicit go-ahead.
- A single item on its own, however directly worded, is NOT the go-ahead —
  this applies even to imperative-phrased direct instructions, not just
  open-ended feedback or bug reports.
- Once Brendan says he's finished and gives the go-ahead, proceed through
  the full pipeline for the queued batch as normal.

Confirmed directly by Brendan on 1 Oct 2026, after a direct instruction
(recolouring the Training Matrix switch) was mistakenly treated as
immediately buildable mid-feedback-session. This is a standing rule for
every future session, not a one-off — see also
`docs/testing/ACCESS-AND-RECOVERY-HANDOVER.md` → "New-chat start checklist"
item 9, which carries the same rule.

## Local staging preview — PowerShell one-liner

Before giving Brendan *any* command to preview a staging build locally, read
**`docs/STAGING-BROWSER-TESTING.md` → "Local UI testing handoff (Step 8-9A)"**
first. It contains the exact, already-agreed one-liner:

```powershell
"http://127.0.0.1:4174" | Set-Clipboard; npx.cmd --yes http-server . -p 4174 -c-1 -o
```

Rules, confirmed directly by Brendan — do not deviate from these without him
explicitly asking for a change:

- Give **only** this single line. Do not prepend `Expand-Archive`, `cd`, or any
  other setup command to it — extraction/navigating into the folder is a
  separate step Brendan does himself before running this line.
- Do not change the port (`4174`), switch `npx.cmd` to plain `npx` (plain
  `npx` resolves to a PowerShell script that his execution policy blocks),
  drop the `-o` or `-c-1` flags, or rewrap it into a multi-line script.
- If a genuinely new need comes up (different port, different tool), ask
  Brendan first and then update `docs/STAGING-BROWSER-TESTING.md` with the
  new agreed line — don't just start giving a different one.

This has already caused repeated back-and-forth once (round 8, Sep/Oct 2026)
when a combined extract+serve command was given instead of the plain
one-liner above. Check the doc section first, every time, to avoid repeating
that.
