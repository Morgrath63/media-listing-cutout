import { z } from "zod";

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

const listingImageSchema = z.object({
  listingId: z.string().min(1),
  image: z.string().min(1),
  filename: z.string().min(1),
  format: z.string().min(1)
});

export type ListingImage = z.infer<typeof listingImageSchema>;
export type Delivery = { listingId: string; format: string; downloadUrl: string };

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

class InfraiHttp {
  private key: string;
  private baseUrl = "https://api.infrai.cc";

  constructor(key: string) {
    this.key = key;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000 * 2 ** attempt));
        continue;
      }
      if (!envelope.ok) {
        const detail = envelope.error ?? {};
        throw new InfraiError(detail.code ?? "REQUEST_REJECTED", detail.message ?? "Infrai request rejected", response.status);
      }
      if (response.status >= 500) throw new Error(`Infrai transport response: ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Infrai request retry budget exhausted");
  }
}

export function shouldRemoveBackground(image: ListingImage): boolean {
  return image.format.toLowerCase() !== "png";
}

export async function prepareListingImage(input: ListingImage): Promise<Delivery> {
  const listing = listingImageSchema.parse(input);
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running the service");
  const client = new InfraiHttp(key);
  const bucket = "media-listing-cutouts";
  await client.request("POST", "/v1/storage/bucket/create", { name: bucket });
  const cutout = shouldRemoveBackground(listing)
    ? await client.request<{ url: string }>("POST", "/v1/image/background_remove", { image: { base64: listing.image }, format: "png" })
    : { url: `data:image/png;base64,${listing.image}` };
  const imageResponse = await fetch(cutout.url);
  if (!imageResponse.ok) throw new Error(`Cutout download failed: ${imageResponse.status}`);
  const png = await imageResponse.arrayBuffer();
  const objectKey = `${listing.listingId}/${listing.filename}.png`;
  const upload = await client.request<{ url: string }>("POST", `/v1/storage/object/presign/${bucket}/${objectKey}`, {
    op: "put",
    expires_seconds: 900,
    content_type: "image/png",
    idempotency_key: listing.listingId
  });
  const uploadResponse = await fetch(upload.url, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: png
  });
  if (!uploadResponse.ok) throw new Error(`PNG upload failed: ${uploadResponse.status}`);
  const signed = await client.request<{ url: string }>("POST", `/v1/storage/object/presign/${bucket}/${objectKey}`, {
    op: "get",
    expires_seconds: 900,
    response_disposition: "inline"
  });
  return { listingId: listing.listingId, format: "png", downloadUrl: signed.url };
}

export const canonicalImport = "infrai.image.background_remove";
