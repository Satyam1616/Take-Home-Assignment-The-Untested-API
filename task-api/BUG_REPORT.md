# Bug Report — The Untested API

All four bugs below were found by writing tests that assert the *expected* behaviour and
watching them fail against the original code. Each entry lists where it lives, what
happens, how I found it, and the fix. Bugs #1–#4 are fixed in this submission; the
"Notes / smaller issues" section lists things I deliberately left as design decisions.

---

## Bug #1 — Pagination skips the first page (off-by-one)

- **Where:** `src/services/taskService.js` → `getPaginated()`
- **Original:** `const offset = page * limit;`
- **Expected:** `GET /tasks?page=1&limit=10` returns records **0–9** (the first page).
- **Actual:** With `page=1, limit=10` the offset is `10`, so it returns records **10–19**.
  The entire first page is unreachable, and requesting `page=0` was the only way to see
  record 0 — which contradicts the 1-indexed `page=1` shown in the README.
- **How I found it:** Seeded 25 tasks, asked for page 1, asserted `body[0].title === 'task-0'`.
  It came back as `task-10`.
- **Fix:** page is 1-indexed, so the offset is `(page - 1) * limit`. I also coerce
  non-positive / non-integer `page` and `limit` to safe defaults, because a negative page
  produced a negative `slice` start index (which silently counts from the end of the array).

## Bug #2 — Status filter does a substring match instead of an equality match

- **Where:** `src/services/taskService.js` → `getByStatus()`
- **Original:** `tasks.filter((t) => t.status.includes(status))`
- **Expected:** `?status=done` returns only tasks whose status **equals** `done`.
- **Actual:** `.includes()` is a substring test on the status string, so `?status=in`
  matches `in_progress`, `?status=o` matches multiple statuses, and `?status=todo`
  happens to work only by coincidence. There is also no validation, so a garbage value
  silently returns a partial/arbitrary set instead of an empty list or a 400.
- **How I found it:** Created one task per status, then queried `?status=in` and expected
  0 results — got 1.
- **Fix:** Use an exact equality check: `t.status === status`.

## Bug #3 — Completing a task wipes out its priority

- **Where:** `src/services/taskService.js` → `completeTask()`
- **Original:** the updated object hard-codes `priority: 'medium'`.
- **Expected:** completing a task changes only `status` → `done` and sets `completedAt`.
- **Actual:** a `high`-priority task silently becomes `medium` the moment it's completed,
  corrupting reporting/history.
- **How I found it:** Created a `high` task, completed it, asserted `priority === 'high'`.
- **Fix:** Removed the `priority: 'medium'` line so priority is preserved.

## Bug #4 — PUT lets clients overwrite server-managed fields

- **Where:** `src/services/taskService.js` → `update()`
- **Original:** `const updated = { ...tasks[index], ...fields };`
- **Expected:** a client can update mutable fields (title, description, status, etc.) but
  not identity/audit fields.
- **Actual:** `fields` is spread verbatim, so `PUT /tasks/:id` with `{ "id": "x" }` changes
  the task's id (making it unreachable by its original id and orphaning it in the store),
  and `createdAt` / `completedAt` can be rewritten to arbitrary values.
- **How I found it:** `PUT` with a body containing `id`, `createdAt`, `completedAt`, then
  asserted the stored task still had its original id/createdAt — it didn't.
- **Fix:** Strip `id`, `createdAt`, and `completedAt` from the incoming fields before merging.

---

## Notes / smaller issues (documented, not "fixed")

- **PUT behaves like PATCH.** `validateUpdateTask` treats every field as optional, so a
  "full update" is really a partial merge. I left the merge semantics alone (changing PUT
  to a strict full-replace could break existing clients) — this is a design decision to
  confirm with the team, not a clear-cut bug.
- **Filter + pagination don't combine.** `GET /tasks` returns early when `status` is
  present, so `?status=todo&page=2` ignores pagination. Left as-is; noted as a feature gap.
- **README vs. code status values.** The top-level `README.md` lists statuses as
  `pending | in-progress | completed`, but the code and `ASSIGNMENT.md` use
  `todo | in_progress | done`. The code is the source of truth here; the README is stale.
- **Invalid JSON bodies** fall through to the generic 500 handler rather than a 400.
  Low priority for this scope.
