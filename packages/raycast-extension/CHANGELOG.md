# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-05-10

### Added

- Initial Raycast extension release
- Search Cards command with fuzzy matching
- Random Card command
- Recent card history tracking
- Card detail view with full metadata display
- User preferences for API configuration
- Support for card attributes, costs, and set information

### Changed

- Search Cards now sends queries via the API `q` parameter and supports the same advanced syntax as web search (`t:`, `a:`, `r:`, negation, `or`, and `!exact`).

---

## Format Notes

When adding entries to this changelog:

- Use version headers in this exact format: `## [x.y.z] - YYYY-MM-DD` (for example: `## [1.0.0] - 2026-05-10`)
- Group changes under: Added, Changed, Fixed, Deprecated, Removed, Security
- Keep entries concise and user-focused
- Link to related PRs or issues where relevant
