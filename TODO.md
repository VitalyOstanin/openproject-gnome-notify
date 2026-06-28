# TODO

- Badge counts unread among the fetched page (pageSize 50), not the instance-wide
  total. Revisit if a separate unread-count request is wanted.
- Optional: use a bulk mark-all-read endpoint if confirmed available
  (`POST /api/v3/notifications/read_ian`); currently mark-all iterates per id.
- The token is read asynchronously from the keyring and cached in the client
  (`getTokenAsync` / `reloadToken`); preferences bump `token-revision` to trigger
  a reload. `getToken` (sync) is used only from prefs (a separate process).
- Minor (deferred): extract magic numbers (client timeout 15 s, pageSize 50) into
  named constants.
- Minor (deferred): `getToken`/`getTokenAsync` return null both for "unset" and
  for a keyring failure; the two are indistinguishable to callers.
- Minor (deferred): `markAllRead` stops on the first failed request, leaving the
  rest unmarked.
- Minor (deferred): the indicator rebuilds the whole menu on every poll tick;
  fine for <= max-items rows, revisit if it ever matters.
- Minor (deferred): the detail dialog renders a markdown subset from comment.html
  (emphasis, headings, quotes, lists, code, links/mentions). Tables, images and
  list nesting deeper than one level degrade to text; add them if needed.
