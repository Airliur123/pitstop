# Home

Home first renders an honest location state. Permission is not requested until the guest chooses
**Gunakan lokasi saya**. Denied, unavailable, timeout, and retry states stop loading and expose
retry plus manual-area actions. Manual invalid uses the approved “Lokasi tidak ditemukan” copy.

After a current or manual location becomes active, Home:

- labels the source as current or manual;
- keeps the five Phase 4 categories;
- keeps only the four official budget presets (Rp10.000, Rp15.000, Rp20.000, Rp25.000);
- omits budget for non-budget categories;
- requests at most one preview with a fixed 5,000 metre radius;
- never requests recommendations before a valid location exists;
- cancels/ignores obsolete requests when location changes.

Category and budget selection remain mounted while the guest changes location. Budget persistence
is unchanged and contains no location data.
