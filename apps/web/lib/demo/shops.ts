// Toyota dealerships around Austin, for the "get it diagnosed" map. Names and addresses are from
// toyota.com's dealer locator (Oct 2026); coordinates are approximate, so "Directions" links search
// by address instead. Static so the map works with USE_FIXTURES=true (tiles still need network).

export type Dealer = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export type LatLng = { lat: number; lng: number };

export const TOYOTA_DEALERS: Dealer[] = [
  { name: "Toyota of North Austin", address: "8400 Research Blvd, Austin, TX 78758", lat: 30.3586, lng: -97.7186 },
  { name: "AutoNation Toyota South Austin", address: "4800 S IH-35, Austin, TX 78745", lat: 30.2135, lng: -97.7585 },
  { name: "Round Rock Toyota", address: "2307 N I-35, Round Rock, TX 78664", lat: 30.5345, lng: -97.688 },
  { name: "Toyota of Cedar Park", address: "5600 183A Toll Rd, Cedar Park, TX 78641", lat: 30.5265, lng: -97.8135 },
  { name: "Lost Pines Toyota", address: "806 Highway 71 W, Bastrop, TX 78602", lat: 30.108, lng: -97.333 },
  { name: "San Marcos Toyota", address: "5101 IH-35 S, San Marcos, TX 78666", lat: 29.837, lng: -97.981 },
];

// Approximate centers of the demo profiles' ZIP codes; anything else falls back to downtown Austin.
const ZIP_CENTERS: Record<string, LatLng> = {
  "78705": { lat: 30.293, lng: -97.74 },
  "78741": { lat: 30.231, lng: -97.721 },
  "78758": { lat: 30.388, lng: -97.707 },
};
const AUSTIN: LatLng = { lat: 30.2672, lng: -97.7431 };

export const zipCenter = (zip: string): LatLng => ZIP_CENTERS[zip] ?? AUSTIN;

// Straight-line distance in miles (haversine).
export function milesBetween(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

export function nearestDealers(origin: LatLng, count = 3): (Dealer & { distanceMi: number })[] {
  return TOYOTA_DEALERS.map((d) => ({ ...d, distanceMi: milesBetween(origin, d) }))
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, count);
}

export const directionsUrl = (d: Dealer) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${d.name}, ${d.address}`)}`;
