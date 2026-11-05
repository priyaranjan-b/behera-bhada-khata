# Tech debt

Open findings to revisit. Each entry gives the place, the problem and the
suggested fix. Delete an entry once it is fixed. Promote a decision you make
while fixing one to an A-number in `design-decisions.md`.

## Services review (2026-10-27)

Scope: `/review-all src/server/services`. This reviewed all 21 service files
as they stood on `main` at `5fc3f0b`, not a diff. It used the
architecture-reviewer, security-reviewer and production-readiness-reviewer.
The security reviewer read every file in full. The other two read some files
in full and checked the rest by searching for patterns. Not reviewed: the
database and UI conventions, the route handlers and
`docs/database-design.md`.

Result: no Critical findings. The source behind items S1–S4, S5's
`confirm.ts` part, S6, S7's `profile.ts` part and N1 was read again before
writing this down; the other entries are as the reviewers reported them.

Fixed since: S1 (an old confirm link expires 14 days after it is
acknowledged and an expired one shows nothing) and S4 (changing the password
needs the current one, or a sign-in in the last 10 minutes); see A27.

Suggested order: S2, S3 and S5–S7 together (mostly `confirm.ts` /
`confirmLinks.ts`; S3's logging helper is used by the others), then S8–S9 as
a separate refactor, then the nits.

### Warning

#### S2. `checkOtp` is not wrapped
- **Where:** `confirm.ts:134`
- **Problem:** `sendOtp` (line 108) is wrapped, but `checkOtp` is not. A
  Twilio outage reaches the generic `console.error(err)` in
  `toErrorResponse` as a raw provider error, possibly with the tenant's phone
  number. It also can't be told apart from a wrong code.
- **Fix:** wrap it the same way: log only the error code, then throw
  `ApiError(502, "Could not verify the code")`. A wrong code stays a 400.
- **Found by:** security + prod

#### S3. Logs record whole error objects and no ids
- **Where:** `confirm.ts:111`, `confirmLinks.ts:43`, `confirmLinks.ts:102`,
  `profile.ts:45`, `profile.ts:91`, `proofs.ts:97`, `receipts.ts:164`,
  `tenantDocuments.ts:76`, `audit.ts:29`, `audit.ts:38`
- **Problem:**
  - These are bare `console.error(err)` / `console.error("op:", err)` calls,
    so a failure can't be traced to a tenant or record. For example:
    - `confirmLinks.ts:43` has `tenant.id` in scope but doesn't log it.
    - `proofs.ts:97` doesn't log `recordFolder`.
    - `tenantDocuments.ts:76` doesn't log `tenantId`.
    - `audit.ts` doesn't log `tenantId` or `entityId`.
  - Twilio errors often contain the `To` phone number, so `confirm.ts:111`
    and `confirmLinks.ts:102` can put phone numbers in the logs.
- **Fix:** add one helper in `context.ts`,
  `logError(op, { tenantId, recordId, receiptNo, path }, err)`, that logs
  only `err.message` / `err.code` / `status`, never the whole object. Later it
  is the one place to switch to a structured logger with a request id.
- **Found by:** prod + security

#### S5. A failed cleanup hides the real error
- **Where:** `confirm.ts:161`, `confirmLinks.ts:58` (`withUploadedFile`)
- **Problem:** if `await storage.remove(uploaded)` throws inside the catch,
  that error replaces the original one, the files are left behind and nothing
  is logged. Upload and acknowledge failures, apart from the expected 409,
  are not logged either.
- **Fix:** catch and log the cleanup error with the record id and paths, then
  rethrow the original. Log failures other than 409 once, with `recordType`,
  `record.id` and `receiptNo`.
- **Found by:** prod

#### S6. A `signedUrl` failure after a successful acknowledgement strands the tenant
- **Where:** `confirm.ts:165`
- **Problem:** the acknowledgement has already succeeded when
  `storage.signedUrl` runs. If it throws, the tenant gets a 500. A retry then
  gets 409 "Already acknowledged", so the tenant never sees the receipt.
- **Fix:** catch and log it, and return no URL so the page falls back to
  `confirmReceiptUrl`.
- **Found by:** prod

#### S7. Best-effort file deletes are not guarded
- **Where:** `profile.ts:63` and `:59` (rollback), `tenantDocuments.ts:101`
- **Problem:**
  - The old signature or document file is removed after the database write
    has succeeded. If the remove throws, the user gets a 500 for a save or
    delete that already happened, and the leftover file isn't logged.
  - At `profile.ts:59`, a failed remove hides the real save error.
  - `tenantDocuments.ts`'s own comment says "best effort".
- **Fix:** try/catch around the remove and log the path (plus `tenantId` /
  `documentId`).
- **Found by:** prod

#### S8. Payment and adjustment functions are copied twins
- **Where:** `payments.ts:144-197`, `adjustments.ts:61-105`
- **Problem:** `resendPaymentLink` / `resendAdjustmentLink` and
  `paymentReceipt` / `adjustmentReceipt` are line-for-line copies: get the
  record, 409 if already acknowledged, rotate the token, `notifyTenant`,
  `describeRecord`, `receiptFile`, then `recordEvent("receipt.downloaded")`.
  CLAUDE.md ("Third copy = extract") says such twins share one helper keyed
  by record kind.
- **Fix:** add `resendLink(kind, id, buildMessage)` and
  `downloadReceipt(kind, id)` in `confirmLinks.ts` or `receipts.ts`, and keep
  the four public functions as thin wrappers.
- **Found by:** architecture

#### S9. The bulk-import limit isn't in `validation.ts`
- **Where:** `tenants.ts:39`
- **Problem:** `MAX_BULK_ROWS = 500` and its zod schema are private to the
  service. The rule is "a limit lives in one exported constant in
  `src/lib/validation.ts`".
- **Fix:** move them to `validation.ts` as `BULK_IMPORT_LIMITS` plus
  `bulkRowsSchema`, so the import UI can read the limit too.
- **Found by:** architecture

### Nit

#### N1. A malformed tower code gives a 500, not a 404
- **Where:** `properties.ts:33`
- **Problem:** `decodeURIComponent` throws `URIError` on something like
  `/properties/%25`, because Next has already decoded the URL once.
- **Fix:** catch the error and call `notFound("Property")`, or drop the
  second decode.
- **Found by:** security

#### N2. Response time reveals which emails are owners
- **Where:** `auth.ts:95-96`
- **Problem:** with `OWNER_EMAILS` set, an unlisted email is rejected at
  once, while a listed one waits for Supabase. That undoes the "same answer
  for everyone" design of `requestMagicLink`.
- **Fix:** always make the Supabase call, or a dummy check that takes the
  same time, before rejecting.
- **Found by:** security

#### N3. `setSessionFromTokens` doesn't check where the request came from
- **Where:** `auth.ts:138-142` (`POST /api/auth/session`)
- **Problem:** `readJson` ignores the content type, so a form on another
  site can post here. An attacker could sign the owner's browser into the
  attacker's own non-owner account. The owner gets logged out, but no data
  leaks.
- **Fix:** check that `Origin` matches `NEXT_PUBLIC_APP_URL`, or require
  `application/json`.
- **Found by:** security

#### N4. Signature images have no size limit beyond the upload length
- **Where:** `confirmLinks.ts:18-25` (`pngDataUrlToBytes`)
- **Problem:** only the PNG signature bytes are checked. A file under 200 KB
  can declare a huge width and height, and pdf-lib decodes the whole image in
  `renderReceipt`, which can run the function out of memory. It needs a valid
  SMS code or an owner session, so the risk is low.
- **Fix:** read the width and height from the PNG header and reject anything
  over a limit set next to `MAX_SIGNATURE_DATA_URL_LENGTH`.
- **Found by:** security

#### N5. `confirmReceiptUrl` checks its inputs by hand
- **Where:** `confirm.ts:169-170`
- **Problem:** `token` and `recordType` are checked in code rather than with
  `parseInput`, so the token length limit doesn't apply here.
- **Fix:** use `parseInput` with a schema like `otpSendSchema`.
- **Found by:** security

#### N6. Bulk import can lose its result, or show a raw error
- **Where:** `tenants.ts:298`, `tenants.ts:294`
- **Problem:**
  - If `ensureRentPeriodsFor(createdIds)` throws after the loop, the caller
    gets a 500 and loses the `{ created, failed }` result for rows that were
    already committed, so a re-import could create duplicates.
  - `errorMessage(err, …)` returns the raw `Error.message` for any error that
    isn't an `ApiError`.
- **Fix:** catch and log the `ensureRentPeriodsFor` failure and still return
  the result (the daily cron tops up the months anyway). Show the message
  only for an `ApiError` and use the fallback otherwise, logging the row
  number.
- **Found by:** prod

#### N7. The file-name cleanup is copied and uses magic numbers
- **Where:** `proofs.ts:91`, `tenantDocuments.ts:67` (also `proofs.ts:48`,
  `proofs.ts:66`)
- **Problem:**
  - `f.name.trim().slice(0, 255) || …` is written twice.
  - `proofs.ts:48` has a bare `.slice(0, 60)`.
  - `proofs.ts:66` converts to MB inline (`/ 1024 / 1024`).
- **Fix:** add `FILE_NAME_MAX_LENGTH` and a `cleanFileName(name, fallback)`
  helper. Put `maxTotalMb` in `PROOF_LIMITS`, or use a named helper.
- **Found by:** architecture

#### N8. `maskPhone` is exported but only used locally
- **Where:** `confirm.ts:30`
- **Fix:** drop the `export` ("Export only what another module uses").
- **Found by:** architecture

#### N9. `createAdjustment` has no `requireId`
- **Where:** `adjustments.ts:22-25`
- **Problem:** the `z.uuid()` in the schema keeps it safe, but a bad id gives
  a 400 where the convention is a 404.
- **Fix:** call `requireId(paymentId, "Payment")` before `parseInput`.
- **Found by:** architecture

#### N10. The public confirm reads aren't rate limited
- **Where:** `confirm.ts:76` (`getConfirmView`), `confirmReceiptUrl`
- **Problem:** the token's randomness makes guessing impractical, but these
  endpoints have no limit and no log.
- **Fix:** optionally add a per-IP limit to match the OTP and confirm
  routes.
- **Found by:** prod

#### N11. Some reads load every row
- **Where:** `audit.ts:45`, `search.ts:17-20`, `loaders.ts:31`,
  `properties.ts:46`, `tenants.ts:60`
- **Problem:** these load every tenant (and the units and occupancy) with no
  limit. That's fine for one landlord with about 40 houses (A15, master
  data). But `audit.ts:45` loads every tenant just to name one page of
  history rows.
- **Fix:** for `audit.ts`, look up only the `tenant_id`s on the page. Leave
  the rest unless the tenant count grows.
- **Found by:** prod
