// Counts real article views. Stores one number per article in Netlify Blobs.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore("article-views");
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") || "").toLowerCase();

  if (req.method === "POST") {
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return Response.json({ error: "Bad article." }, { status: 400 });
    const current = Number(await store.get(slug)) || 0;
    const next = current + 1;
    await store.set(slug, String(next));
    return Response.json({ slug, views: next });
  }

  const { blobs } = await store.list();
  const out = {};
  await Promise.all(blobs.map(async (b) => { out[b.key] = Number(await store.get(b.key)) || 0; }));
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
};

export const config = { path: "/api/views" };
