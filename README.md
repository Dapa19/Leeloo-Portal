# Leeloo Portal

Leeloo Portal is a client portal for a creative studio. The MVP includes agency and client accounts, private projects, deliverables, immutable design versions, review comments, revision requests, version-specific approvals, final delivery, activity history, and protected file downloads.

## Stack

- `client/`: React, Vite, TypeScript, React Router, Tailwind CSS, React Hook Form, Zod, Lucide, and Sonner.
- `server/`: Express 5 and TypeScript REST API, with Zod validation, bcrypt password hashing, Prisma ORM, and its SQLite driver adapter.
- `server/prisma/`: SQLite data model, migrations, and an explicit development seed.
- `server/src/storage.ts`: local storage adapter boundary for design and final files.

The API stores opaque session IDs as hashes in SQLite. The browser receives only an `HttpOnly`, `SameSite=Strict` cookie. Mutations use a CSRF token held in memory by the client and sent in a request header. The API checks roles and project membership before returning project data or files.

## Requirements

- Node.js 20.19+ or 22.12+.
- SQLite (included through the local database file; no database server is required).

## Local setup

1. Copy `.env.example` to `.env` in the project root. Its `DATABASE_URL` points to `server/leeloo.db`; SQLite creates the file when migrations run.
2. Install packages and generate the Prisma client:

   ```sh
   npm install
   npm run db:generate
   ```

3. Apply the committed migration:

   ```sh
   npm run db:migrate
   ```

   To change the Prisma schema during development, create a named migration with `npm run db:migrate -w server -- --name <migration-name>`.

4. Optionally add fictional development data:

   ```sh
   npm run db:seed
   ```

5. Start Vite and the API together:

   ```sh
   npm run dev
   ```

   The agency portal is at `http://localhost:5173/agency/login`; the client portal is at `http://localhost:5173/client/login`; the API is at `http://localhost:4000`. The site root opens the agency sign-in, which links to client sign-in.

The demo seed refuses to run when `NODE_ENV=production`. It is never run automatically.

## Development demo accounts

All seeded accounts use the fictional development password `LeelooDemo2026!`:

| Role | Email |
| --- | --- |
| Agency admin | `studio@leeloo.dev` |
| Client | `maya@example.dev` |
| Client | `noah@example.dev` |

The seed is idempotent for these accounts and sample projects. Change or remove the demo credentials before using any shared environment.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `file:./leeloo.db` | SQLite database file used by Prisma (relative to the server workspace). |
| `PORT` | `4000` | API listener port. |
| `NODE_ENV` | `development` | Enables secure cookies and proxy handling in production; blocks the demo seed in production. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Exact allowed browser origin for credentialed CORS and mutation origin checks. |
| `SESSION_TTL_DAYS` | `14` | Session lifetime in days. |
| `MAX_UPLOAD_MB` | `100` | Maximum size of each uploaded file. |
| `UPLOAD_DIR` | `./uploads` | Local private file storage directory. It is excluded from Git. |

## Database and scripts

- `npm run db:generate` regenerates Prisma Client after schema changes.
- `npm run db:migrate -w server -- --name <migration-name>` creates/applies a development migration.
- `npm run db:seed` explicitly inserts local demo data.
- `npm run build` builds both the API and the web client.
- `npm test` runs API policy tests and the client test suite.
- `npm run test:integration` runs API integration tests when `TEST_DATABASE_URL` points to a disposable migrated SQLite file. Prepare and run it from the repository root with:

  ```sh
  DATABASE_URL="file:./prisma/test.db" npm run db:migrate -w server
  TEST_DATABASE_URL="file:./prisma/test.db" npm run test:integration -w server
  ```

Do not point integration tests at production or important local data: the integration suite creates and removes fixture records.

## Uploads and production notes

Local uploads are stored outside the public web root, with generated storage keys. The API checks extension, file signature, maximum size, account role, and project membership. Supported file types are JPEG, PNG, WebP, PDF, and MP4. File downloads always pass through the authenticated API.

The storage provider interface lives in `server/src/storage.ts`; replacing `LocalStorage` with an S3-compatible provider does not require changing project or review logic. Set `UPLOAD_DIR` to persistent private storage for local or single-host deployments. SQLite is a good fit for local development and single-instance deployments. For production, use a persistent volume and backups for the database file, durable private object storage, HTTPS, and the exact public web origin. SQLite is not intended for horizontally scaled API instances sharing a local disk. Build with `npm run build`; when starting the server with `NODE_ENV=production`, it serves the generated client bundle and API from the same origin. Run `prisma migrate deploy` as a release step; never use `db:seed` in production.

The MVP intentionally has no public registration, email delivery, invitation links, image annotations, or real-time chat. Admins create client accounts and share credentials through their own secure process. Activity and approval records persist in SQLite.
