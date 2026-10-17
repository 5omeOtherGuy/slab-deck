# Changelog

All notable changes to slab-deck are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Pinned quota windows in the statusline now refresh on macOS as well: the cache age falls back to BSD
  `stat`, and without `flock` a lock directory keeps it to one refresher at a time
  ([`ec1126e`](https://github.com/5omeOtherGuy/slab-deck/commit/ec1126e)).
- The plugin manifest names 5omeOtherGuy as author and describes the mod in the README's words
  ([`ee8ae98`](https://github.com/5omeOtherGuy/slab-deck/commit/ee8ae98)).
