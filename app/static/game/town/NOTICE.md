# Baked town data

`index.json` and the `c_*.json` chunks in this folder are a Derivative
Database of

- OpenStreetMap, © OpenStreetMap contributors, and
- Microsoft's Global ML Building Footprints, © Microsoft,

both made available under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
This derived data is available under the same license.

It is produced by `scripts/build_town.py`, which keeps only shapes and a few
class tags (no names or addresses) in feet from a local reference point.
