import assert from "node:assert/strict";
import { shouldRemoveBackground } from "./media_cutout_service.ts";

const jpg = { listingId: "listing-17", image: "source-image", filename: "chair", format: "jpeg" };
const png = { listingId: "listing-18", image: "transparent-image", filename: "lamp", format: "png" };

assert.equal(shouldRemoveBackground(jpg), true);
assert.equal(shouldRemoveBackground(png), false);
console.log("background decision: raster input is cut out; existing PNG is delivered as-is");
