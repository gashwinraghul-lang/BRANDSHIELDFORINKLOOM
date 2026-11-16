ROLE
You are taking over a half-built project, "BrandShield.ai by Inkloom AI", from other AI tools (Antigravity, then earlier opencode edits). I am a beginner and cannot code, so do all the work yourself: create files, run commands, fix errors, and explain in plain language. Earlier tools reported things as working that were not. Trust only raw terminal output you produced yourself. Do not rewrite from scratch; keep what works and repair what is broken.

PRODUCT
A brand-governance platform that reviews content BEFORE publication against approved guidelines, approved facts, terminology and brand assets. It explains every finding with its source, suggests fixes without overriding humans, and supports roles (admin, manager, reviewer, creator, agency), comments, approvals, revision history, audit log, insights, and clear disclosure of AI use. It must also work with no AI key, using deterministic rule-based engines.

ENVIRONMENT (do not change)
- Windows, PowerShell 5: no && chaining, use separate commands or ;.
- Docker Desktop runs ONLY MySQL 8: docker compose up -d db, host port 3307 mapped to container 3306, database brandshield, user brandshield, password examplePass. docker-compose.yml must contain only the db service.
- Docker cannot download images or packages reliably on this network. The Node server and the client run directly on my PC, NOT in Docker. Never add a server, client or agent container.
- Server connects to MySQL at localhost:3307.
- Passwords: bcryptjs. Email: nodemailer with an Ethereal test account, falling back to console logging; signup must never fail because email failed.
- Groq API key goes only in server/.env as GROQ_API_KEY, never in the client, never printed.

STEP 1: AUDIT (change nothing yet)
1. List all files (excluding node_modules). Read server/package.json, every file in server/src, the migrations, scripts, docker-compose.yml, .env.example, and the client folder. For server/.env print variable NAMES only.
2. Check that every import points to a file that exists, every imported package is in package.json, and .env variable names match what the code reads (earlier truncation produced T_SECRET, OQ_API_KEY, TP_HOST, which should be JWT_SECRET, GROQ_API_KEY, SMTP_HOST).
3. Run docker compose ps, then SHOW TABLES and DESCRIBE for each table through docker compose exec db mysql. Note the stray test_tmp table and any missing tables or columns.
4. Try to start the server and show the raw output and /api/health.
5. Write STATUS.md with three lists: WORKS (proven by raw output), BROKEN, MISSING. Show it to me.

STEP 2: STABILISE THE FOUNDATION
1. Clean docker-compose.yml to db only. Fix .env and .env.example so names match the code. Generate strong random secrets.
2. Use a migration runner with a schema_migrations table. Never edit an applied migration; add new ones. Run migrations automatically at server start and fail loudly on error. Make sure these exist: organizations, users (BIGINT id, name, email_verified_at, status, last_login_at), memberships, email_tokens (store only a SHA-256 token_hash, used_at, 24h verification and 1h reset expiry), refresh_tokens, audit_log. Drop test_tmp.
3. Add GET /api/health returning status, database ("connected" or "error", checked with SELECT 1), aiEngine ("groq" or "deterministic"), uptime and timestamp.
4. Auth: signup (409 on duplicate email), login (generic error on wrong password), email verification, password reset, refresh rotation, logout, role middleware, organisation scoping on every query, login rate limiting, audit_log entries.
5. Root scripts: npm run dev starts MySQL (docker compose up -d db), the server with nodemon, and the client.
6. Tests with Vitest and Supertest.

PROOF REQUIRED before moving on (raw output only): docker compose ps, SHOW TABLES, /api/health, signup, duplicate signup (409), login with right and wrong password, SELECT from users and audit_log, and the test run.

RULES
1. Only import files that exist; recheck imports and package.json after each change.
2. After each step run the server, the tests and real requests, and show RAW output, not summaries. If something fails twice, stop and ask me with the exact error.
3. Commit with git after each step. Make sure .env is git-ignored and no secrets appear in logs or commits.
4. Do not say a step is done until the raw output proves it. Update STATUS.md.
5. When you need something from me (Groq key, Agentverse), give numbered click-by-click steps and name the exact file and variable. Never ask me to edit code.
6. Be honest about limits in the UI and README.

Start with STEP 1 now. When Steps 1 and 2 are proven, stop and wait for my next instructions.