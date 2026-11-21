// Counts article views, feature/author views and likes.
// One number per key, stored in Netlify Blobs.
// "strong" consistency is essential: with the default (eventual) consistency a
// read straight after a write can return the OLD number, which made likes
// jump back to their original count.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "article-views", consistency: "strong" });
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") || "").toLowerCase();

  if (req.method === "POST") {
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return Response.json({ error: "Bad article." }, { status: 400 });
    // Read, add one, write only if nobody changed it meanwhile; retry on a clash
    // so two simultaneous likes are both counted.
    let next = 0;
    for (let i = 0; i < 6; i++) {
      const cur = await store.getWithMetadata(slug, { type: "text", consistency: "strong" });
      const current = cur ? Number(cur.data) || 0 : 0;
      next = current + 1;
      const res = await store.set(slug, String(next), cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
      if (!res || res.modified !== false) break;
    }
    return Response.json({ slug, views: next }, { headers: { "Cache-Control": "no-store" } });
  }

  const { blobs } = await store.list();
  const out = {};
  await Promise.all(blobs.map(async (b) => { out[b.key] = Number(await store.get(b.key, { consistency: "strong" })) || 0; }));
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
};

export const config = { path: "/api/views" };
