# Production Code Review

## 1. Executive Summary

Production readiness: **2/10**  
Maintainability: **3/10**  
Security: **1/10**  
Architecture: **3/10**

Top 5 blocking problems:
1. Hardcoded real secrets in repo (`ecosystem.config.cjs`).
2. Webhook auth fail-open when `META_APP_SECRET` is missing.
3. Unauthenticated Telegram send endpoint allows arbitrary bot usage.
4. CI/CD and runtime are inconsistent/broken (Docker + multiple entrypoints).
5. Data layer is incoherent (TypeORM + Drizzle + Prisma references).

## 2. Critical Issues

### C1
- Severity: `critical`
- File/path: `ecosystem.config.cjs:14`
- Problem: Hardcoded production secrets committed to VCS.
- Why dangerous: Immediate credential compromise.
- Recommendation: Rotate all leaked secrets, purge git history, move to secret manager/env only.

### C2
- Severity: `critical`
- File/path: `src/instagram/guards/meta-signature.guard.ts:27`
- Problem: Signature verification is skipped if app secret is missing.
- Why dangerous: Anyone can forge webhook payloads.
- Recommendation: Fail closed. Reject all POST webhook calls if secret is missing.

### C3
- Severity: `critical`
- File/path: `src/telegram/telegram.controller.ts:21`
- Problem: Public `POST /instagram/webhook/send-message` has no auth/rate limit.
- Why dangerous: Bot can be abused for spam/phishing relay.
- Recommendation: Remove public access or enforce `JwtAuthGuard + RolesGuard`, allowlisted chat IDs, rate limiting.

### C4
- Severity: `critical`
- File/path: `.github/workflows/deploy.yml`
- Problem: Pipeline assumes Docker artifacts/runtime model that is inconsistent with repo state.
- Why dangerous: Non-deterministic deploys and CI failures.
- Recommendation: Define one deployment model, keep required files versioned, validate build in CI.

### C5
- Severity: `critical`
- File/path: `package.json:12`, `main.js`, `server.js`, `src/main.ts`
- Problem: Conflicting runtime entrypoints (legacy JS + Nest TS).
- Why dangerous: Different behavior across environments, security controls not guaranteed.
- Recommendation: Keep one runtime path only (Nest `dist/main`) and remove legacy runtime files from deploy path.

### C6
- Severity: `critical`
- File/path: `drizzle/migrations/001_initial_migration.sql:1`, `src/database/database.module.ts`, `src/modules/users/*`
- Problem: DB stack mismatch and empty migration.
- Why dangerous: Schema drift, runtime/query failures, unsafe evolution.
- Recommendation: Choose one ORM stack, remove dead stacks, add real migrations + CI migration checks.

## 3. Major Issues

1. `type: module` + `nodenext` with mixed import style (many local imports lack `.js`) causes unstable type/lint/build behavior.
2. Telegram WebApp auth validation is incomplete for replay/freshness guarantees.
3. External media download lacks host allowlist, timeout, and payload limits (SSRF/resource abuse risk).
4. Custom raw body middleware is redundant and memory-risky.
5. `InstagramService` is a god-service (parsing + API + formatting + transport + dedupe + routing).
6. Missing strict env validation; insecure defaults can silently disable protection.

## 4. Medium and Minor Issues

1. Runtime cache file is tracked in git (`.telegram-topic-cache.json`).
2. PII-heavy webhook payload logging.
3. No graceful shutdown handling in bootstrap.
4. Placeholder modules imported but functionally empty (`content`, etc.).
5. `users` endpoints use `any` and no DTO validation.
6. README is outdated vs actual runtime/deploy model.
7. Retry utility lacks jitter/error taxonomy.

## 5. Architecture Review

1. Active path appears to be Instagram->Telegram, but repo contains disconnected module scaffolding.
2. Separation of concerns is weak; orchestration and integration details are tightly coupled.
3. Dependency directions are unclear due to mixed data technologies and dead modules.
4. In-memory dedupe and file caches are not horizontally scalable.
5. Parallel legacy JS codebase increases drift and maintenance risk.

## 6. Security Review

1. Secret leakage: **critical**.
2. Webhook fail-open: **critical**.
3. Open Telegram relay endpoint: **high/critical** depending exposure.
4. Attachment fetching without SSRF guardrails: **high**.
5. Weak auth/RBAC integration for admin surface: **high**.
6. Excessive event logging may leak sensitive data: **medium**.

## 7. Database Review

1. Drizzle schema exists but is not integrated in runtime services.
2. Initial migration is effectively empty.
3. TypeORM is configured but entity/repository usage is incomplete.
4. Prisma references exist but Prisma module/service files are absent.
5. Seed script is not production-safe/reproducible and uses raw SQL values in inserts.

## 8. Telegram Bot Review

1. Bot command layer is minimal and placeholder-level.
2. No callback protocol/state machine hardening for admin actions.
3. No robust anti-spam/rate-limit/idempotency persistence.
4. Topic cache stored in local file makes multi-instance behavior inconsistent.
5. Telegram API retry exists but missing timeout budget/circuit-break style controls.

## 9. Refactoring Plan

### Phase 1: Must-fix before production
1. Rotate compromised credentials and remove from repo/history.
2. Enforce fail-closed webhook verification.
3. Secure/remove public send-message endpoint.
4. Standardize runtime entrypoint and deployment model.
5. Pick one DB stack and make migrations real + enforced in CI.

### Phase 2: Should-fix soon
1. Split `InstagramService` into focused components.
2. Remove dead modules or fully wire and guard them.
3. Add URL allowlist, timeout, and payload caps for external media fetch.
4. Move dedupe/topic routing state to shared store (Redis/DB).
5. Add structured redacted logging.

### Phase 3: Quality improvements
1. Add unit/e2e tests for webhook, auth, and Telegram forwarding.
2. Add metrics/tracing/alerts.
3. Improve docs and onboarding to match actual architecture.

## 10. Patch Suggestions

### S1: Strict config validation
```ts
ConfigModule.forRoot({
  isGlobal: true,
  load: [configuration],
  validationSchema: Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
    TELEGRAM_BOT_TOKEN: Joi.string().required(),
    INSTAGRAM_VERIFY_TOKEN: Joi.string().required(),
    META_APP_SECRET: Joi.string().required(),
  }),
});
```

### S2: Fail-closed webhook guard
```ts
if (!appSecret) {
  throw new ServiceUnavailableException('Webhook secret is not configured');
}
if (!signature) {
  throw new UnauthorizedException('Missing X-Hub-Signature-256');
}
```

### S3: Protect message relay endpoint
```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Post('send-message')
async sendMessage(@Body() dto: SendTelegramMessageDto) {}
```

### S4: Safe attachment fetch policy
```ts
const urlObj = new URL(url);
if (!ALLOWED_HOSTS.has(urlObj.hostname)) throw new BadRequestException();

const controller = new AbortController();
const t = setTimeout(() => controller.abort(), 5000);
const res = await fetch(url, { signal: controller.signal });
clearTimeout(t);
```

### S5: CI quality gates
```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm lint
- run: pnpm test -- --runInBand
- run: pnpm exec tsc --noEmit
- run: docker build -t app:${{ github.sha }} .
```
