# CivicAI

CivicAI is a community issue reporting project. Residents submit a description, location, and optional photo. Staff review reports and decide the final category, priority, and status.

AI suggestions are advisory. Staff make the final decisions. The project build is intended for adult reviewers and fictional synthetic report data.

## Project structure

- `frontend/` — React, TypeScript, Vite, and Tailwind UI
- `public/api/` — PHP API endpoints
- `src/` — PHP configuration and session authentication
- `database/` — schema, migrations, and setup utilities
- `storage/uploads/` — local uploaded photos; never commit its contents
- `ml/` — image model training script, report, and instructions
- `samples/` — synthetic evaluation manifest and sample photos
- `public/app/` — generated frontend build output; created by the build command

There is no Composer package manifest or PHP `vendor/` directory. The PHP backend uses PHP extensions provided by Laragon.

## Requirements

- Windows with Laragon
- Apache and MySQL enabled in Laragon
- PHP 8 or later with PDO MySQL, cURL, Fileinfo, mbstring, GD, and EXIF extensions enabled
- Node.js and Corepack
- Git
- `corepack pnpm` for frontend dependencies

## Get the project

Clone the shared repository, then open a terminal in the project directory:

```powershell
git clone <repository-url> civicai
cd civicai