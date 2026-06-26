# TODO

- Badge counts unread among the fetched page (pageSize 50), not the instance-wide
  total. Revisit if a separate unread-count request is wanted.
- Optional: use a bulk mark-all-read endpoint if confirmed available
  (`POST /api/v3/notifications/read_ian`); currently mark-all iterates per id.
- Token lookup is synchronous (`Secret.password_lookup_sync`) and cached in the
  client; revisit if it ever blocks noticeably.
