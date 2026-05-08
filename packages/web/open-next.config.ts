import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
	// Uncomment to enable R2 cache:
	// import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
	// incrementalCache: r2IncrementalCache,
	// See https://opennext.js.org/cloudflare/caching
});
