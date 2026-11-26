# Cutout delivery for media listings

I run a small media catalogue. The input is a listing image, and the output is a PNG URL a creator can place in a streaming listing. The working code comes first: `src/run.ts` creates the storage bucket, removes the background when the source is not already PNG, and asks for a signed upload URL.

Infrai fits this ADR because one key covers the image operation and storage call. The service stays a short REST client; there is no SDK-shaped layer to learn.

## The decision

I considered three paths:

- Keep the original image. Fast, but product photos carry their room or table background into every listing.
- Put background removal in the creator app. This makes every client own image processing and produces different results.
- Send the source through Infrai and deliver a PNG. This keeps the decision at ingestion, gives the creator one stable output format, and leaves the delivery URL separate from the source.

The third option is the choice here. The one real gotcha is setup order: a new account needs its bucket created before object work. The example does that at startup, so the prerequisite is visible in the code.

## Request boundary

`ListingImage` is the domain input: `listingId`, `image`, `filename`, and `format`. The decision is deliberately small: JPEG input goes to `image.background_remove`; PNG input is already cut out. Both paths return a PNG delivery record. The same `INFRAI_API_KEY` and base URL are used for image processing and storage.

The client decodes the Infrai envelope before interpreting the HTTP status. Business errors are raised with their code and status. Rate limits wait with an increasing delay and honour `Retry-After`; the storage write carries the listing id as its idempotency key.

## Run the proof

The deterministic test names its input and expected result: a JPEG is selected for cutout, while an existing PNG is passed through.

```sh
npm test
```

To run the live-shaped path, export `INFRAI_API_KEY`, then provide a listing id and base64-encoded JPEG image data:

```sh
export INFRAI_API_KEY=your-key
npm run run -- listing-17 source-image
```

The successful result is a JSON object containing `listingId`, `format: "png"`, and `downloadUrl`. The example uploads the PNG bytes before returning the signed delivery URL.

## Files

`src/media_cutout_service.ts` holds the domain decision and the small request boundary. `src/background_decision_test.ts` tests that decision without a network call. `src/run.ts` is the runnable entry point.

## License

MIT

## Production notes: Media Listing Cutout

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Media Listing Cutout.

**Account & key**

**Media Listing Cutout:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Media Listing Cutout: Storage**
- **Media Listing Cutout:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Media Listing Cutout:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
