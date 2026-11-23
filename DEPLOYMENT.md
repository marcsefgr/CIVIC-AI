# Production deployment checklist

The application is a PHP 8 + MySQL app with a built React frontend. Serve `public/` as the web document root and mount the frontend at `/app/`. Keep `.env`, `src/`, `database/`, and `storage/` outside the document root. Enable HTTPS before setting `APP_ENV=production`.

## Hosting requirements

- PHP 8 with PDO MySQL, Fileinfo, cURL, mbstring, GD, and Exif enabled
- MySQL 8 (or compatible) and permission to create/alter the application schema
- Apache with rewrite support, or equivalent routing for `/api/*` and `/app/`
- HTTPS, writable `storage/uploads/`, and a server-side environment file
- An approved AI provider whose terms allow the app's intended resident audience and personal-data processing

## Before launch

1. For local Laragon setup, copy `.env.local.example` to `.env` and set a Gemini key only if you intend to enable AI for synthetic demo reports. For production, create a dedicated database and least-privilege database user; do not use the Laragon `root` account.
2. Copy `.env.example` to the host's private environment configuration; set the actual HTTPS origin, database credentials, Gemini key/model, and conservative `AI_DAILY_CAP` and `AI_USER_DAILY_CAP` values. Never put the Gemini key in frontend code.
3. Keep `AI_PROCESSING_APPROVED=false` by default. For this project build, enable it only for an access-restricted group of adult reviewers (18+) using synthetic reports/photos, and only after confirming the configured Gemini service tier and terms. Never use real resident data in this project build. A later LGU deployment needs its own provider eligibility, billing, lawful-basis, privacy, and LGU/DPO approvals before any real personal data is sent.
4. For a new database, apply `database/001_schema.sql` through `006_login_rate_limits.sql` in order. For an existing CivicAI database, apply only migrations not already applied, or use the matching `database/check_setup.php --apply-...-migration` command for additive tables.
5. Run `corepack pnpm install --frozen-lockfile` and `corepack pnpm build` from `frontend/`; deploy the resulting `public/app/` files with the PHP app.
6. Create the initial admin with `php database/seed_admin.php "Admin Name" admin@example.org` on the host, then enter a unique password of at least 12 characters at the prompt.
7. Point the domain's document root to `public/`, enable HTTPS, set `APP_ENV=production`, and verify `APP_ORIGIN` exactly matches the deployed scheme and host. The domain root redirects to `/app/`.
8. Ensure `storage/uploads/` is writable by PHP but is not web-accessible. Set restrictive upload/storage quotas and configure encrypted backups with a tested restore process.
9. The project privacy notice intentionally leaves LGU controller, DPO/contact, retention, and rights fields blank. Before a real LGU deployment accepts personal data, complete and obtain approval for controller identity, official privacy contact, lawful basis, data recipients and cross-border processing, retention/deletion period, user-rights channel, and complaint instructions. Remove every bracketed placeholder.
10. Before live use, review account access, admin provisioning, audit/log retention, incident response, dependency updates, and data-subject request/deletion procedures with the LGU.

## Automatic AI flow

After a resident submits a report and the optional photo upload completes, the app automatically calls the owner-authorized triage endpoint. A failed upload does not discard the report; the text can still be triaged without the photo. Transient Gemini/network errors receive one automatic retry; persistent failures leave the report available for staff review and can be retried by an admin. Gemini suggestions never set the staff's final category, priority, or status. The signup UI asks users to read the project privacy notice and confirm they are adults; the API enforces the adult confirmation, while the privacy-read checkbox is client-side only. The report form instructs users to submit fictional test data, but the current report API does not enforce a per-report synthetic-data confirmation. Keep the project restricted to adult reviewers and synthetic data.

The admin review screen also runs a separate experimental photo-only classifier in the browser. It suggests only `Infrastructure` or `Sanitation` from its trained labels; it does not set priority or status, and uncertain results are withheld. It adds no backend service requirement. The Gemini flow above remains unchanged, and staff still make the final decision. Training data, methodology, and holdout metrics are documented in `ml/README.md` and `ml/training_report.json`.

The server omits the exact report location from Gemini prompts. Descriptions and uploaded photos are sent to the configured Gemini API when enabled. Google states Gemini API is a Paid Service only when called from a Cloud Project with active billing; unpaid use may be used to improve Google's products and may be reviewed by humans. Paid-service prompts and responses are not used to improve Google's products, but may be logged for a limited period for abuse monitoring and stored in countries where Google or its agents operate. Google's terms also prohibit using Gemini API as part of an app directed to, or likely to be accessed by, people under 18. The project UI requires self-confirmation that accounts are adult reviewers, but this is not robust age verification; restrict distribution to the adult reviewer group. See [Google's current terms](https://ai.google.dev/gemini-api/terms?hl=en).

## Account recovery and login throttling

The login endpoint limits failed attempts to five per 15-minute window for each hashed IP/email pair. It returns HTTP 429 while that pair is temporarily blocked. For operator-assisted password recovery, use the server console rather than a public reset form. In PowerShell, enter the new password at the secure prompt and run the CLI updater:

```powershell
$securePassword = Read-Host "New account password" -AsSecureString
$env:CIVIC_NEW_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
php database/reset_password.php admin@example.org
Remove-Item Env:CIVIC_NEW_PASSWORD
$securePassword = $null
```

The password is stored as a password hash. Replace the email with the account to recover.

## Current launch blockers

- Production hosting provider/domain and database have not been selected/configured in this workspace.
- The project build is ready to serve with synthetic data and adult reviewers, but its blank LGU privacy fields must be completed before any real-data deployment.
- Restrict project access to adult reviewers and synthetic data. Confirm the Gemini service tier/terms before enabling AI. Do not use real resident data; an eventual LGU deployment needs separate legal, privacy, provider, billing, security, and operational approval. Gemini Developer API terms may make it unsuitable for a public barangay audience that includes minors.
- Signup abuse controls and operational monitoring/backup setup still need an LGU-specific production review. Photo uploads are re-encoded with GD to strip embedded metadata; enable the required PHP extensions on the host.
