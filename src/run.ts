import { prepareListingImage } from "./media_cutout_service.ts";

const [listingId = "demo-listing", image = "image-reference"] = process.argv.slice(2);
const result = await prepareListingImage({ listingId, image, filename: listingId, format: "jpeg" });
console.log(JSON.stringify(result, null, 2));
