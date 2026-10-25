// Studio photos (white background) and toyota.com pages for the new Toyotas the engine can
// suggest, matched by model name like the backend's toyota_catalog.json (longest match wins).
const MODELS: Record<string, { photo: string; page: string }> = {
  "Corolla Cross": { photo: "/cars/corolla-cross-2026.png", page: "https://www.toyota.com/corollacross/" },
  Corolla: { photo: "/cars/corolla-2026.png", page: "https://www.toyota.com/corolla/" },
  Camry: { photo: "/cars/camry-2026.png", page: "https://www.toyota.com/camry/" },
  RAV4: { photo: "/cars/rav4-2026.png", page: "https://www.toyota.com/rav4/" },
};

function modelFor(name: string) {
  const hits = Object.keys(MODELS).filter((m) => name.toLowerCase().includes(m.toLowerCase()));
  return hits.length ? MODELS[hits.reduce((a, b) => (b.length > a.length ? b : a))] : null;
}

export const carPhoto = (name: string): string | null => modelFor(name)?.photo ?? null;
export const carPage = (name: string): string => modelFor(name)?.page ?? "https://www.toyota.com/";
