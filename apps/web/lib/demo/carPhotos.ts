// Studio photos (white background) for the new Toyotas the engine can suggest, matched by
// model name like the backend's toyota_catalog.json (longest match wins).
const PHOTOS: Record<string, string> = {
  "Corolla Cross": "/cars/corolla-cross-2026.png",
  Corolla: "/cars/corolla-2026.png",
  Camry: "/cars/camry-2026.png",
  RAV4: "/cars/rav4-2026.png",
};

export function carPhoto(name: string): string | null {
  const hits = Object.keys(PHOTOS).filter((m) => name.toLowerCase().includes(m.toLowerCase()));
  return hits.length ? PHOTOS[hits.reduce((a, b) => (b.length > a.length ? b : a))] : null;
}
