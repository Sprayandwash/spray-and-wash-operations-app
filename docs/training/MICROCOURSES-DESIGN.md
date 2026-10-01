# Training module — micro-courses design

**Status:** Design only. Nothing in this document has been built. Captures the architecture agreed with Brendan on 1 Oct 2026, for a later build phase.
**Scope:** In-app micro-courses for suitable catalog items in the Training & Qualifications module — a linked video, written material, and a short quiz, taken directly in the app rather than evidenced by an uploaded certificate.
**Candidate catalog items** (from prior discussion, subject to change): chemical handling, asbestos awareness, manual handling, high-pressure water safety, exclusion-zone/traffic management on site.

This design extends the existing module rather than replacing any of it. Everything below assumes the current schema and UI patterns already in `operations-v4.js`: the `operations_training_courses` / `operations_training_people` / `operations_training_matrix` / `operations_training_records` / `operations_training_record_files` tables, the `source_key` convention already used to mark a record as system-generated (e.g. `height_inspector_qualifications`), and the `<details class="ops-card ops-collapsible">` pattern already used for each course section on a person's Training record.

## 1. Storage architecture

### `operations_training_courses` — new columns

| Column | Type | Purpose |
|---|---|---|
| `is_microcourse` | boolean | Marks a catalog item as having in-app content, in addition to (or instead of) manual evidence upload. |
| `video_url` | text | A linked YouTube video. No file storage needed for this — it's embedded by URL. |
| `content_body` | text (markdown) | The written training material shown before the quiz. |
| `pass_mark_percent` | integer | Minimum score to pass. |
| `max_attempts` | integer | Number of attempts allowed before the course locks and requires a Training Manager reset. Must be set (not left unlimited) per the agreed retake policy — see §4. |
| `content_version` | integer, default 1 | Bumped whenever the video, material, or quiz questions are edited. Drives whether existing passes stay valid — see §4. |

### `operations_training_quiz_questions` (new table)

`id`, `course_id`, `content_version`, `question_text`, `question_type` (`single_choice` / `multi_choice` / `true_false`), `options` (jsonb), `correct_answer` (jsonb), `display_order`.

Scoped to `content_version` so editing a course's quiz doesn't silently change the question set behind an in-progress attempt, and so old attempts remain interpretable against the question set they were actually taken against.

### `operations_training_quiz_attempts` (new table)

`id`, `person_id`, `course_id`, `content_version`, `attempt_number`, `started_at`, `submitted_at`, `score_percent`, `passed` (boolean), `answers` (jsonb snapshot of what was submitted).

Attempts are append-only — never edited, mirroring how the rest of the training module treats its audit trail. `attempt_number` is scoped per person/course/content_version and is what the `max_attempts` lockout checks against.

### Completion write-through

A passing attempt auto-writes (upserts) into the existing `operations_training_records` table, using `source_key = 'microcourse:<course_id>'`. This reuses the exact gating already built for Height-Equipment-synced records: the record becomes read-only to manual edits and evidence upload, and the UI shows it as system-generated rather than self-reported. `expiry_date` is computed from `completed_date + validity_period_months`, exactly as it is for every other course today — no special-casing needed anywhere downstream (reminders, the register report, SiteWise export).

### File storage

No new Supabase Storage bucket is required for the video (URL only). If written material later needs attached files (a diagram, a PDF) beyond markdown text, the `asset-files` bucket added for maintenance manuals is explicitly modelled on the training-evidence bucket already and gives a ready template (same RLS shape, same `kind/id/timestamp-filename` path convention) for a future `course-content` bucket — not needed for the initial build.

## 2. Display

### Admin "Training" tab — team member record

A micro-course still renders as its own collapsible course section on the person's record (`<details class="ops-card ops-training-course">`), identical to every other course today, with a small "Micro-course" badge added next to the existing Internal/External type label in the summary line. Inside the expanded section:

- Quiz attempt history (attempt number, date, score, pass/fail) in place of — or alongside — the existing manual record table.
- A "Preview course" action for the Training Manager/Admin to review the video and material without it counting as an attempt.
- A "Reset attempts" action, visible once a person is locked out after `max_attempts`, which clears the lockout (does not delete attempt history).
- The content-edit entry point (video URL, material, quiz questions) lives on the course catalog detail page (`trainingCourseDetailHtml`), consistent with how course metadata is already edited today — not on the person's record.

### Employee "My Training" tab

The course row keeps its existing shell — name, type, status pill, expiry — matching the "minimum info only" principle already applied there. Only the action control changes, swapped the same way a synced Height Equipment record already swaps its action control for a "Synced" note instead of an upload button:

| Status | Action shown |
|---|---|
| Not started | "Start course" |
| In progress (material opened, quiz not submitted) | "Resume" |
| Failed, attempts remaining | "Retake" (shows attempts remaining) |
| Locked (attempts exhausted) | "Locked — contact your Training Manager" (no retry action) |
| Passed | "View result" (read-only summary; no evidence upload, matching synced-record behaviour) |

## 3. Access and launch flow

A new in-app view, not a separate page in the site sense — consistent with the rest of the SPA's single-file view-switching model. Flow: video → material → "Take the quiz" → questions → submit → immediate pass/fail feedback.

- **On pass:** writes the attempt, auto-creates/updates the `operations_training_records` row per §1, and returns the employee to My Training showing the new status.
- **On fail, attempts remaining:** shows the score and lets them retake immediately (no cooldown — see §4).
- **On fail, attempts exhausted:** shows the score and the "contact your Training Manager" message; the course locks until an Admin/Training Manager resets it.
- **Admin preview:** the same view, opened from the course catalog or a person's record in a read-only "preview" mode that never writes an attempt — lets the Training Manager check their own content before anyone takes it live.

## 4. Decisions already made (1 Oct 2026)

These three were open questions in the first draft of this design and have since been confirmed by Brendan:

1. **Retakes:** limited attempts, then locked pending a Training Manager reset. (The exact number of attempts — e.g. 3 — still needs picking before build; `max_attempts` on the course makes it configurable per course rather than fixed app-wide, so it doesn't have to be a single global number if that's preferred.)
2. **Content versioning:** Training Manager decides per edit. Saving an edit that changes the video, material, or quiz prompts: *"Keep existing passes valid, or require everyone to retake on the new version?"* That choice needs to be recorded against the version bump (e.g. whether `content_version` N's passes remain honoured once version N+1 exists), so the status calculation in My Training and on the admin record knows whether an old pass still counts.
3. **Completion approval:** auto-completed on pass, no review step — consistent with how Height-Equipment-synced records already behave.

## 5. Open items for a later pass

Not blocking this design, but worth deciding before or during build:

- Default/per-course `max_attempts` value.
- Whether quiz questions are shown one at a time or all on one page.
- Whether question order and/or option order is randomized per attempt.
- Whether a cooldown period is wanted between attempts in addition to the attempt limit (not requested, but worth confirming it's genuinely not wanted).
- Whether a completion should produce a simple in-app "certificate" view/PDF for the person's own records, separate from the SiteWise evidence package question (micro-courses are internal/self-assessed, so it's worth confirming whether SiteWise accepts them at all or whether they stay purely internal).
- How reminders plug in once built: a micro-course's expiring completion is just another row in `operations_training_records` with an `expiry_date`, so the future reminder system (`operations_notifications`) would only need one new `event_type` (e.g. `training_expiring`) and a generator scanning that table — no micro-course-specific reminder logic.

## 6. Explicitly out of scope for this design

- The reminder/notification system itself (tracked separately; this design only confirms micro-course completions will feed it without special-casing).
- A `course-content` storage bucket for attached files beyond the video URL and markdown material (only needed if written material later requires file attachments).
- Any change to the existing manual evidence-upload path for non-micro-course items — that stays exactly as it is today.
