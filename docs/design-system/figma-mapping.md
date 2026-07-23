# Figma-to-code mapping

Source: **PitStop Mobile PWA & Admin MVP**, **PitStop Design v1.0**, status **Ready for Development**.
The Figma connector was used read-only.

| Figma node                        | Variants/states                                                          | React implementation     | Main tokens                               | Notes                               |
| --------------------------------- | ------------------------------------------------------------------------ | ------------------------ | ----------------------------------------- | ----------------------------------- |
| `Button` `12:46`                  | Primary, Secondary, Danger, Text; Default/Hover/Pressed/Disabled/Loading | `Button`                 | interactive, danger, button radius, 48 px | Primary color adjusted for AA       |
| `Mobile Header` `14:15`           | Home, Back                                                               | `AppHeader`              | surface, border, H3                       | Native link for back                |
| `Bottom Navigation` `14:69`       | Beranda, Tambah, Aktivitas                                               | `MobileBottomNavigation` | success surface, brand text, 72 px        | `aria-current` added                |
| `Budget Chip` `14:110`            | selected/unselected                                                      | `Chip`                   | interactive, full radius                  | Generic primitive only              |
| `Form Input` `14:127`             | default/focus/error/disabled                                             | `FormField`, `Input`     | border, focus, danger, 48 px              | 16 px input text for mobile         |
| `Facility Chip` `14:148`          | available/unavailable/unknown                                            | `FacilityChip`           | status semantic tokens                    | Icon and text retained              |
| `Status Badge` `14:176`           | operational and moderation states                                        | `StatusBadge`            | success/warning/danger                    | Never color-only                    |
| `Place Card` `15:133`             | primary/alternative and status                                           | `PlaceCard`              | card radius/elevation                     | Generic presentation; no data fetch |
| `Bottom Sheet` `15:134`           | default                                                                  | `Sheet`                  | modal radius, overlay/floating            | Radix dialog primitive              |
| `Modal` `15:165`                  | default/warning/danger                                                   | `Dialog`, `AlertDialog`  | modal radius, overlay                     | Native focus restoration            |
| `Empty State` `15:209`            | location/data/closed/radius/budget                                       | `EmptyState`             | semantic text/surface                     | Generic copy supplied by consumer   |
| `Error State` `15:210`            | network/error                                                            | `ErrorState`             | danger, secondary text                    | Optional retry action               |
| `Loading Skeleton` `15:225`       | card/list                                                                | `Skeleton`               | border surface                            | Hidden from accessibility tree      |
| `Admin Sidebar` `15:272`          | Dashboard/Moderasi/Tempat/Laporan                                        | `AdminSidebar`           | navy, interactive, 260 px                 | Responsive stacked navigation       |
| `Admin Stat Card` `15:285`        | neutral/success/warning/danger                                           | `AdminStatCard`          | semantic surfaces/text                    | Warning text adjusted for AA        |
| `Contribution List Item` `15:346` | moderation status                                                        | `ContributionListItem`   | surface, status                           | Preview only; no workflow           |

## Shell references

- Mobile shell uses `Mobile / Home` node `18:3` for 390 x 844 proportions, header, gutters, and bottom
  navigation.
- Sheet behavior uses `Overlay / Budget Sheet` node `18:9`.
- Admin shell uses `Admin / Dashboard` node `18:23` for 1440 x 1024 sidebar and content spacing.

Business screens and prototype flows were inspected for component context only. They are not
implemented in Phase 2.
