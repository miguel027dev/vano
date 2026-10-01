# Radar intelligence

Radar discovery is persisted in PostgreSQL and deduplicated by geographic key. The backend serves cached VANO radar data first and refreshes eligible external sources according to TTL.

Approximate scan cells are stored; user positions are not stored in the radar catalog.

Configuration uses the `VANO_RADAR_*` environment variables implemented in `vano_radars.py`. Diagnostics are available at `GET /api/radars/sources`.
