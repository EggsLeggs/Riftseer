---
title: Ingest worker overview
sidebar_label: Overview
---

The Riftseer ingest worker is a dedicated Cloudflare Worker that keeps the Supabase card database in sync with the upstream RiftCodex API (and related sources).

It is responsible for:

- Fetching the full card catalog from `https://api.riftcodex.com`
- Running the ingest pipeline (transform, enrich, link tokens/champions/legends)
- Upserting the final card and set data into Supabase

This worker is intended to run on a schedule in production (for example, every few hours), but it can also be triggered manually during development.

## Where it lives

- Code: `packages/ingest-worker/src`
- Entry point: `packages/ingest-worker/src/index.ts`
- Pipeline coordinator: `packages/ingest-worker/src/ingest.ts`
- Data sources: `packages/ingest-worker/src/sources/*`
- Pipeline helpers: `packages/ingest-worker/src/pipeline/*`

To run ingestion locally, see [Running locally](running-locally.md).
