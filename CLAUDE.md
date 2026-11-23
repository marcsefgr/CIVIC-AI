# CivicAI — Project Plan & Status

> **INSTRUCTIONS FOR CLAUDE CODE (read this first)**
>
> This project is already partly built. Do **not** start from Phase 0 and do **not** redo anything marked ✅ below.
>
> 1. Read the **Status board** and find the first step that is not ✅. That is where work resumes.
> 2. Steps 9 and 10 are applied and verified. Steps marked 🟡 are delivered but not yet fully verified by the user (11 and 12 still need a mismatch test).
> 3. Before starting a step, check that every step above it is ✅ or 🟡. If a prerequisite is missing, say so instead of skipping ahead.
> 4. Never drop, rename or modify the old MySQL database `civicai` (it holds 7 rows of data from an earlier attempt). This project uses **`civicai_app`**.
> 5. Follow the **Rules** section. Do not weaken any security rule to make something work.
> 6. When you finish a step, update the Status board in this file (change the symbol and add a one-line note). Keep this file accurate.
> 7. If something here conflicts with what you see in the repo, trust the repo, tell the user, and fix this file.

Legend: ✅ done and tested · 🟡 partly done or awaiting user verification · ⬜ not started / not applied · 🔴 high / 🟠 medium / 🟢 low priority

---

## 1. What we are building

**CivicAI** — a community issue reporting app (semester course project). Residents submit a report (description, location, photo). The AI triages it; **barangay/LGU admin staff** review and confirm or override.

**Focus (decided):** admin-first AI triage. The AI suggests a category, priority and summary, and checks whether the description matches the photo. The admin always has the final say. Measuring how often admins override the AI is the project's accuracy metric.

**Decided:**
- Stack: React frontend + PHP API + MySQL, running on **Laragon (Windows)**.
- LLM: **Gemini API via a billed Google Cloud Project in production**, called only from the PHP backend.
- Deployment: production web hosting for real residents is intended; provider/domain and LGU approvals are still required before launch.

The original PRD (v1.0) said Flask + SQLite. The stack changed, so the PRD still needs updating (see step 2).

## 2. Status board

### Phase 0 — Decisions
| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | Lock focus: admin-first AI triage | 🔴 | ✅ decided |
| 2 | Lock stack: React + PHP + MySQL on Laragon | 🔴 | ✅ decided · ⬜ PRD still says Flask + SQLite and must be updated |
| 3 | Deployment target | 🟠 | 🟡 hosting provider/domain still to be selected |
| 4 | LLM provider | 🔴 | 🟡 Must confirm age eligibility, active billing, and LGU/DPO approval; Gemini may not fit a public barangay audience |

### Phase 1 — Foundation
| # | Task | Priority | Status |
|---|------|----------|--------|
| 5 | Laragon setup, repo layout, `.env`, MySQL schema as migration files | 🔴 | ✅ |
| 6 | Server-side auth and roles | 🔴 | ✅ tested |
| 7 | Frontend migration to the PHP API; remove backdoor, mock data and Supabase | 🔴 | 🟡 migrated and production bundle built; browser/API verification remains |
| 8 | Reports API (residents see own, admins see all) | 🔴 | ✅ tested |

### Phase 2 — Core feature
| # | Task | Priority | Status |
|---|------|----------|--------|
| 9 | Safe photo upload and owner/admin-only photo serving | 🔴 | ✅ applied and verified by user |
| 10 | Gemini triage call from the backend: strict JSON, category whitelist, manual fallback | 🔴 | 🟡 auto-starts after report submission; requires age eligibility, approved provider, active billing, and hosted verification |
| 11 | Store AI suggestions separately from admin's final values | 🔴 | ✅ verified: triage.php wrote `ai_*` only, `category`/`priority` untouched |
| 12 | Description-vs-photo mismatch flag, priority cap, needs human verification | 🟠 | 🟡 only the match case tested; mismatch/unclear/Urgent-cap need verification |

### Phase 3 — Make it trustworthy
| # | Task | Priority | Status |
|---|------|----------|--------|
| 13 | Admin review screen on real data, comments and status history | 🟠 | 🟡 implemented: comments endpoint, report history payload and live review UI; verification remains |
| 14 | Privacy notice and real error messages in the UI | 🟠 | 🟡 production-oriented draft; controller, DPO/contact, lawful basis, retention and rights details need LGU/DPO approval |
| 15 | Test set of 31 sample reports with photos to measure AI accuracy | 🟠 | 🟡 `samples/results.csv` has 31 rows: 18 done, 13 failed on Gemini 503/timeouts; rerun failed cases when service is available; synthetic photos only |
| 16 | Cheap checks: reused-photo hash, EXIF when present | 🟢 | ⬜ (hash is already stored in `report_photos.sha256`) |

### Phase 4 — Polish (only if time allows)
| # | Task | Priority | Status |
|---|------|----------|--------|
| 17 | Routing and splitting the 1,833-line `App.tsx` | 🟢 | ⬜ |
| 18 | Email status notifications; remove UI promises until then | 🟢 | 🟡 unsupported notification promises removed from the UI; email delivery remains unimplemented |
| 19 | Filipino/Cebuano prompt tuning | 🟢 | ⬜ |

## 3. Environment

- OS: **Windows**. Laragon (Apache, MySQL 8.0.x, PHP 8.x). Terminal is the Laragon terminal (cmd-style).
- Project folder: `C:\laragon\www\civicai`, served at `http://civicai.test`.
- The Laragon virtual host points at the **project root**, not `public/`. A root `.htaccess` rewrites every request into `public/`, so `/api/health.php` maps to `public/api/health.php`, and `/.env` and `/src/...` return 404. **Do not delete that `.htaccess`.**
- Database: **`civicai_app`**, MySQL user `root`, empty password (Laragon default).
- `.env` (never commit, never print its values): `DB_HOST`, `DB_NAME` (`civicai_app`), `DB_USER`, `DB_PASS`, `APP_ORIGIN`, `GEMINI_API_KEY`, `GEMINI_MODEL`.
- `GEMINI_MODEL` is configuration, never hardcoded. Gemini model names change; one source listed the 2.5 models as scheduled for shutdown on 16 Oct 2026, so confirm the current model name in Google AI Studio.

## 4. Repo layout (backend, as built)

```
civicai/
  .env / .env.example / .gitignore / .htaccess
  database/
    001_schema.sql              # creates civicai_app + 5 tables
    002_one_photo_per_report.sql   # applied (step 9)
    003_ai_usage.sql            # applied (daily AI call counter)
    seed_admin.php              # CLI: creates an admin account
  src/
    config.php                  # env(), db() -> shared PDO
    auth.php                    # session, out(), input(), user(), require_login(), require_admin()
  public/api/
    health.php register.php login.php logout.php me.php
    reports.php report_review.php
    photo.php triage.php
  tools/eval_triage.php         # CLI accuracy run over samples/manifest.csv (step 15)
  storage/uploads/              # photos, outside web root, .htaccess denies all
  samples/                      # test photos + manifest.csv (step 15)
    manifest.csv                # 31 cases: id, path, expected category/priority/consistency
    valid/                      # clear, matching description+photo pairs
    mismatch/                   # description contradicts photo
    tricky/                     # ambiguous, low-light, multi-issue, etc.
```

## 5. Database (`civicai_app`)

- `users` (id, name, email unique, password_hash, role `resident|admin` default `resident`)
- `reports` (id, user_id, description, location_text, status, **final** `category`/`priority` NULL until an admin sets them, **AI** `ai_status`, `ai_category`, `ai_priority`, `ai_summary`, `ai_visible_issue`, `ai_consistency` `match|partial|mismatch|unclear`, `ai_confidence`, `ai_reason`, `needs_verification`, timestamps)
- `report_photos` (report_id, file_name = random UUID, mime, sha256). The **unique** constraint on `report_id` comes from migration 002.
- `comments` (report_id, user_id, body)
- `status_history` (report_id, user_id, from_status, to_status)

Enums: status `Submitted|In Review|In Progress|Resolved|Rejected`; category `Infrastructure|Public Safety|Sanitation|Environment|Public Spaces|Other`; priority `Low|Medium|High|Urgent`.
A report with `category = NULL` has not been reviewed by an admin.

## 6. API (built)

| Endpoint | Who | Notes |
|---|---|---|
| `GET /api/health.php` | anyone | DB connectivity + table list |
| `POST /api/register.php` `{name,email,password}` | anyone | Always creates a `resident`. A `role` in the body is ignored. |
| `POST /api/login.php` `{email,password}` | anyone | Same error for wrong email or password. Regenerates session ID. |
| `POST /api/logout.php` `{}` | signed in | |
| `GET /api/me.php` | signed in | |
| `GET /api/reports.php[?id=]` | signed in | Residents: own reports only and no AI internals; admins: all reports plus AI fields and resident names. Returns status history; admin responses also include internal comments. |
| `POST /api/reports.php` `{description,location}` | signed in | Logs first status. Returns `{id, code}`. |
| `POST /api/report_review.php` `{id, status?, category?, priority?}` | **admin** | Whitelisted values, transaction, logs status changes. |
| `POST /api/comments.php` `{report_id,body}` | **admin** | Adds an internal report comment (max 2000 chars). |
| `POST /api/photo.php` multipart `report_id` + `photo` | report owner | 5 MB max, JPEG/PNG/WebP by real content, one photo per report. |
| `GET /api/photo.php?id=` | owner or admin | Streams the image with `nosniff`. |

| `POST /api/triage.php` `{report_id}` | report owner or admin | Automatic after submission; writes `ai_*` only; owner gets limited response, admin gets full result. Requires confirmed billed Gemini; daily cap (`AI_DAILY_CAP`). |

## 7. Frontend (migration in progress)

The supplied Figma Make prototype is now in `frontend/`. Its Supabase auth/data client, admin backdoor, role selector, mock reports, fake photo upload, fixed resident identity, and notification toggles were removed. The client uses PHP session auth and `/api/...` endpoints; report IDs and roles come from the server. Reports automatically request triage after submission/photo upload. Admin review shows suggestions, can retry failures, and supports final category/priority/status, admin-only comments, and status history. AI never sets final admin values. Resident screens only show their own reports and status history; AI internals remain admin-only.

Run `corepack pnpm build` from `frontend/` to write the app to `public/app/`; locally open `http://civicai.test/app/`. In development Vite proxies `/api` to `http://civicai.test`. See `DEPLOYMENT.md` for production requirements.

The production-oriented privacy notice describes automatic Gemini processing, photo metadata, access controls, advisory suggestions, limited safety logging, and possible cross-border processing. Bracketed controller/DPO/retention/rights details remain and must be filled and approved by the LGU before accepting real reports.

## 8. Next step detail — step 10 (Gemini triage)

Design agreed with the user:

- Called **server-side only** from PHP. Key stays in `.env`. Never expose it to the browser.
- One multimodal call with the description + photo. Require **strict JSON** back: `category`, `priority`, `summary`, `visible_issue`, `consistency` (`match|partial|mismatch|unclear`), `confidence`, `reason`.
- Validate the response server-side: whitelist category and priority against the enums, clamp lengths, reject anything malformed.
- Treat the description and any text inside the photo as **data, not instructions** (prompt-injection defence).
- Write results into the `ai_*` columns only. Never write the admin-final `category`/`priority`.
- On any failure set `ai_status = 'failed'` and let the admin triage manually. A failed AI call must never block report submission.
- Step 12 logic (same call): on `mismatch` or `unclear` set `needs_verification = 1` and cap the AI priority (neither the text nor the photo alone may push a report to Urgent). **Never auto-reject.** Mismatch details and reasons stay admin-only; staff can ask a resident for another photo after review.
- Production gate: real resident content is sent only when `AI_PROCESSING_APPROVED=true` is configured after confirming service eligibility, active Cloud Billing, and LGU/DPO approval. The exact report location is omitted; the description and optional photo are sent.
- **Trigger (current user direction):** automatically request triage after report creation and optional photo upload. `triage.php` accepts only the report owner or an admin, atomically claims a pending/failed report to avoid duplicate spend, and keeps suggestions separate from final admin values. Admins can retry failures.

## 9. Rules (do not break)

- **SQL:** prepared statements only. Never interpolate user input. Column names in dynamic `UPDATE`s come from server-side whitelists.
- **Roles:** always read from the database per request. Never trust a role, id or price from the client.
- **POST endpoints:** JSON only via `input()` (except multipart photo upload). Cookies are `HttpOnly` + `SameSite=Lax`; production sets `Secure` through `APP_ENV=production` and must run over HTTPS.
- **Uploads:** validate real content, random names, stored outside `public/`, served only through an authorised endpoint.
- **Residents must never see AI internals** (mismatch flags, reasons, confidence).
- **Secrets:** never print, log or commit `.env` values or the Gemini key.
- **Code style:** the user strongly prefers concise, minimal code that meets the requirements without verbose helper structures. Match the existing style in `src/auth.php` and `public/api/`.
- Windows quirk: when giving the user terminal commands, give one command per block (pasting several on one line has broken things before), and use `\"` for JSON quotes with `curl`.

## 10. Known gaps and cleanup

- Login/signup abuse controls, account recovery, photo metadata removal, production monitoring, backup restore, and hosting hardening still need review before real public use.
- Once step 9 is applied, photo metadata (EXIF, possibly GPS) is kept; admins can see it. The privacy notice (step 14) must disclose it and explain the AI processing path.
- Comments and status history endpoints are implemented for step 13. No email notifications are implemented; their unsupported UI claims were removed.
- Throwaway test accounts exist: `t@test.com` (resident) and `u2@test.com` (resident). Test report id 1 belongs to `t@test.com`. **Delete these before the demo.**
- Create the initial production admin using the interactive `database/seed_admin.php` CLI; it accepts only the first admin and requires a 12+ character password.
- The PRD (v1.0) must be updated to PHP + MySQL + paid Gemini processing and the production deployment plan.

## 11. Step 9 — photo upload (APPLIED, kept for reference)

Already applied and verified; do not re-apply. Create or change exactly these three things, then run the tests below. Keep the code as written.

### 11.1 Migration: `database/002_one_photo_per_report.sql`

```sql
USE civicai_app;
ALTER TABLE report_photos ADD UNIQUE (report_id);
```

Run it on the user's machine: `mysql -u root < database\002_one_photo_per_report.sql`

### 11.2 New file: `public/api/photo.php`

```php
<?php
require __DIR__ . '/../../src/auth.php';
$u = require_login();
$dir = __DIR__ . '/../../storage/uploads/';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rid = (int)($_POST['report_id'] ?? 0);
    $s = db()->prepare('SELECT id FROM reports WHERE id = ? AND user_id = ?');
    $s->execute([$rid, $u['id']]);
    if (!$s->fetch()) out(['error' => 'Report not found'], 404);

    $f = $_FILES['photo'] ?? null;
    if (!$f || $f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) out(['error' => 'Upload failed'], 400);
    if ($f['size'] > 5 * 1024 * 1024) out(['error' => 'Photo must be 5 MB or less'], 413);
    // Trust the file's content, not its name or the browser-sent type
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true) || !getimagesize($f['tmp_name']))
        out(['error' => 'JPEG, PNG or WebP images only'], 415);

    $h = bin2hex(random_bytes(16));
    $name = substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20);
    try {
        db()->prepare('INSERT INTO report_photos (report_id, file_name, mime, sha256) VALUES (?, ?, ?, ?)')
            ->execute([$rid, $name, $mime, hash_file('sha256', $f['tmp_name'])]);
    } catch (PDOException $e) {
        out(['error' => 'Report already has a photo'], 409);
    }
    $pid = (int)db()->lastInsertId();
    if (!move_uploaded_file($f['tmp_name'], $dir . $name)) {
        db()->prepare('DELETE FROM report_photos WHERE id = ?')->execute([$pid]);
        out(['error' => 'Could not save photo'], 500);
    }
    out(['id' => $pid], 201);
}

// Serve a photo only to its owner or an admin
$s = db()->prepare('SELECT p.file_name, p.mime, r.user_id FROM report_photos p JOIN reports r ON r.id = p.report_id WHERE p.id = ?');
$s->execute([(int)($_GET['id'] ?? 0)]);
$p = $s->fetch();
if (!$p || ($u['role'] !== 'admin' && $p['user_id'] != $u['id'])) out(['error' => 'Not found'], 404);
header('Content-Type: ' . $p['mime']);
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=3600');
readfile($dir . $p['file_name']);
```

### 11.3 Edit `public/api/reports.php` (expose the photo id)

In the `$cols` string, change `r.ai_summary, r.created_at` to:

```
r.ai_summary, (SELECT p.id FROM report_photos p WHERE p.report_id = r.id LIMIT 1) AS photo_id, r.created_at
```

### 11.4 What step 9 guarantees

Only the report's owner can attach a photo. Files over 5 MB are rejected. The real file content decides the type (JPEG, PNG or WebP that decodes as an image), never the filename or the browser-sent type. Files are saved under a random name in `storage/uploads/`, outside the web root. A SHA-256 hash is stored for the later duplicate-photo check. A photo is served only to its owner or an admin, with `nosniff`. One photo per report, enforced by the unique key. Photo metadata is not stripped.

### 11.5 Tests (the user runs these one command at a time)

Accounts: `t.txt` / `u2.txt` / `a.txt` are curl cookie files for the test resident, the second resident and the admin. Report id 1 belongs to the test resident and has no photo yet.

1. `curl -i http://civicai.test/.env` → first line must be **404**.
2. Fake image: `echo hello> fake.jpg`, then `curl -b t.txt -F "report_id=1" -F "photo=@fake.jpg" http://civicai.test/api/photo.php` → `{"error":"JPEG, PNG or WebP images only"}`.
3. Real JPEG: `curl -b t.txt -F "report_id=1" -F "photo=@C:\path\to\photo.jpg" http://civicai.test/api/photo.php` → `{"id":1}`.
4. Repeat test 3 → `{"error":"Report already has a photo"}`.
5. Owner downloads: `curl -b t.txt -o owner.jpg "http://civicai.test/api/photo.php?id=1"` → opens as the photo.
6. Other resident: `curl -b u2.txt "http://civicai.test/api/photo.php?id=1"` → `{"error":"Not found"}`.
7. `curl -b a.txt http://civicai.test/api/reports.php` → report 1 shows `"photo_id":1`.

If a PHP error mentions `finfo`, the `fileinfo` extension is off: enable it in Laragon (PHP → Extensions) and reload Apache.

When all seven pass, update step 9 in the Status board to ✅ and move on to step 10.
