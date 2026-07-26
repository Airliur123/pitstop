# Routes and state matrix

| Route            | Safe URL state                               | In-memory state                 |
| ---------------- | -------------------------------------------- | ------------------------------- |
| `/`              | none                                         | current/manual location context |
| `/places`        | `category`, allowed `budget`, `sort`, `view` | current/manual location context |
| `/places/[slug]` | verified public slug                         | none required for detail        |

Latitude, longitude, accuracy, and manual search text are never written to a URL. Malformed budget
values do not produce a recommendation request. `view=map` can survive navigation or refresh, but
after a refresh the guest must establish location again before results load.

Manual location and manual-invalid are provider states on the current route rather than
shareable/deep-linkable coordinates.
