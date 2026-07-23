# Seed Data

`pnpm db:seed` writes development/test simulation data only. Every simulated place has a
`data-simulasi-` slug and a description beginning `Data Simulasi`; addresses explicitly say they are
simulation data and must not be presented as real businesses.

## Master data

- Roles: `USER`, `ADMIN`.
- Categories: `MAKAN_MURAH`, `NGOPI`, `TOILET`, `MUSALA`, `ISTIRAHAT`.
- Facilities: `PARKING`, `TOILET`, `MUSALA`, `POWER_OUTLET`, `SEATING`, `SHADE`, `WIFI`.
- Integration source: `GOOGLE_FORM`.

## Simulation places

| Place                | District   | Longitude, latitude | Menu price | State                                         |
| -------------------- | ---------- | ------------------- | ---------: | --------------------------------------------- |
| Warung Bu Ani        | Tambora    | `106.8061, -6.1468` |   Rp12,000 | ACTIVE, ADMIN_VERIFIED, split Sunday schedule |
| Warkop Bang Udin     | Tambora    | `106.8039, -6.1491` |    Rp5,000 | ACTIVE, ADMIN_VERIFIED, overnight schedule    |
| Warteg Barokah       | Grogol     | `106.7972, -6.1670` |   Rp13,000 | TEMPORARILY_CLOSED                            |
| Nasi Uduk Ibu Rini   | Cengkareng | `106.7340, -6.1430` |   Rp14,000 | ACTIVE, COMMUNITY_CONFIRMED                   |
| Warung Madura 24 Jam | Kalideres  | `106.7030, -6.1380` |   Rp10,000 | ACTIVE, ADMIN_VERIFIED, 24 hours              |

The dataset covers Rp10,000 and Rp15,000 budgets, above-budget candidates, active and temporarily
closed states, 24-hour operation, overnight operation, split intervals, and several radius bands.

## Idempotency

Master rows use unique codes; places use unique slugs; menus use `(place_id, name)`; relation and
schedule rows use composite keys. The seed uses parameterized upserts and can run repeatedly without
adding duplicates. Integration test 18 executes it twice and verifies place/menu counts.
