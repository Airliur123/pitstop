# MySQL Spatial

- **Status:** Accepted
- **Context:** Radius and distance queries are central to later recommendation behavior.
- **Decision:** Use MySQL 8.4 LTS with WGS84 `POINT`, SRID 4326, and spatial indexes in Phase 1.
- **Consequences:** Longitude/latitude ordering and spatial migrations require dedicated tests.
- **Review conditions:** Review if required spatial analytics exceed MySQL capabilities.
