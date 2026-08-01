# docs

Docusaurus site aggregating documentation co-located across the monorepo.

## Commands

```bash
bun run --filter docs start     # localhost:3001
bun run --filter docs build
bun run --filter docs typecheck
```

The docs package is a Bun workspace member. Its prestart and prebuild hooks copy the Discord, Reddit and Raycast pages into the Clients & Bots section; edit the package-owned originals, not the generated copies.

## Content routing

| Section | Source | URL prefix |
| --- | --- | --- |
| Getting Started | `doc-pages/getting-started/` | `/getting-started/` |
| Ingest | `../packages/ingest-worker/docs/` | `/` |
| Clients & Bots | package docs copied into `doc-pages/clients-bots/` | `/bots/` |
| Core | `../packages/core/docs/` | `/core/` |
| Types | `../packages/types/docs/` | `/types/` |
| Supabase | `../supabase/docs/` | `/supabase/` |

Each section is a separate Docusaurus plugin instance. Relative links cannot cross plugin boundaries even when the source files are near each other on disk; Docusaurus resolves them inside the current plugin and fails the build. Use absolute site paths for cross-section links, and relative links only within a section.

New pages need title frontmatter; sidebars autogenerate unless an explicit position is required. A new top-level section needs a content-docs plugin, sidebar module and navbar entry in `docusaurus.config.ts`.

Mermaid is enabled through the theme. The GitHub Pages workflow builds this package and publishes `build/`; a successful local production build is the documentation verification step.
