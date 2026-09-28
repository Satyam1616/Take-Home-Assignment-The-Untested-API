# Submission Notes

## Part C — `PATCH /tasks/:id/assign` design decisions

- **Validation:** `assignee` must be a non-empty string. Empty string, whitespace-only,
  missing, and non-string values all return **400** with a clear message. Validation runs
  *before* the task lookup, so a bad body returns 400 even for a non-existent id (a
  malformed request is a client error regardless of the target).
- **Trimming:** the stored value is trimmed, so `"  Bob  "` is stored as `"Bob"`.
- **Length guard:** capped at 100 characters — a light sanity limit to avoid unbounded
  input. Easy to adjust once real requirements exist.
- **Already assigned → reassignment is allowed.** The brief asks what should happen here.
  I chose to allow it: `assignee` is a mutable attribute and `PATCH` is the natural verb
  for changing it, so reassigning is expected behaviour, not a conflict.
  *Tradeoff:* if the business rule is "a task can only ever be assigned once," this should
  return **409 Conflict** when `task.assignee` is already set. That's a one-line change and
  I'd confirm the rule before locking it in.
- **Schema:** added `assignee: null` to newly created tasks so the field is present from
  creation instead of appearing only after the first assignment.
- **404:** returns `{ error: 'Task not found' }` when the id doesn't exist.

## What I'd test next with more time

- Property/fuzz tests around pagination boundaries (last partial page, `limit` larger than
  the dataset, huge `page`).
- Concurrency behaviour of the in-memory store (it's a plain array — no locking).
- Content-type / malformed-JSON handling (currently 500 instead of 400).
- Contract tests to keep the README's documented shape in sync with the code.

## What surprised me

- The README and ASSIGNMENT disagree on the status vocabulary (`pending/in-progress/completed`
  vs `todo/in_progress/done`). The code uses the ASSIGNMENT set.
- Three of the four bugs were *silent data corruption* (wrong page, wrong filter, wiped
  priority) rather than crashes — exactly the kind of thing that slips past manual testing
  and needs assertions to catch.

## Questions I'd ask before shipping to production

- Is the in-memory store a placeholder for a real database? If so, several assumptions
  (id generation, filtering, pagination) move to the DB layer.
- Should `assignee` reference a real user id rather than a free-text name? That changes
  validation entirely (existence check, 404/422 on unknown user).
- Are there auth/authorization requirements? Right now every endpoint is fully open —
  anyone can read, mutate, or delete any task.
- Should PUT be a strict full-replace, or is the current partial-merge behaviour intended?
