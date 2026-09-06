/**
 * The site's API error type now lives in `lib/api`, beside the request helper
 * that raises it, so features other than cards share both rather than copying
 * either. Re-exported here because `@/features/cards/errors` is the path the
 * card error boundary and views already import.
 */
export { CardApiError } from "@/lib/api/errors";
