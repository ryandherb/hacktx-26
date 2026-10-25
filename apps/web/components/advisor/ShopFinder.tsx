"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { directionsUrl, nearestDealers, type LatLng } from "@/lib/demo/shops";
import { ring } from "./AdvisorPanel";

const pin = (n: number, active: boolean) =>
  `<svg viewBox="0 0 24 30" width="${active ? 31 : 26}" height="${active ? 38 : 32}" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">
    <path d="M12 29s10-9.3 10-17A10 10 0 0 0 2 12c0 7.7 10 17 10 17z" fill="${active ? "#EB0A1E" : "#3f3f46"}" />
    <text x="12" y="15.5" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="system-ui">${n}</text>
  </svg>`;

// Nearest Toyota dealerships on a real map (Leaflet + Esri tiles, no API key)
// next to a ranked list. Clicking a dealer (row or pin) highlights and centers its pin, and only
// a click reports it through onSelect, so the parent never assumes a dealer the user didn't pick.
export default function ShopFinder({ origin, onSelect }: { origin: LatLng; onSelect?: (name: string) => void }) {
  const dealers = useMemo(() => nearestDealers(origin), [origin.lat, origin.lng]);
  const [active, setActive] = useState(0);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const L = useRef<typeof import("leaflet") | null>(null);
  // Latest values for Leaflet's event handlers, which are bound once when the map is built.
  const latest = useRef({ active, dealers, onSelect });
  latest.current = { active, dealers, onSelect };

  const select = (i: number) => {
    setActive(i);
    latest.current.onSelect?.(latest.current.dealers[i]?.name ?? "");
  };

  const highlight = (i: number) => {
    const leaflet = L.current;
    if (!leaflet) return;
    markers.current.forEach((mk, j) => {
      const on = j === i;
      mk.setIcon(leaflet.divIcon({ className: "", html: pin(j + 1, on), iconSize: on ? [31, 38] : [26, 32], iconAnchor: on ? [15.5, 38] : [13, 32] }));
      mk.setZIndexOffset(on ? 1000 : 0);
    });
  };

  useEffect(() => {
    let cancelled = false;
    // Leaflet touches `window` on import, so load it client-side only.
    import("leaflet").then((leaflet) => {
      if (cancelled || !el.current) return;
      L.current = leaflet;
      const m = leaflet.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
      // Esri's light gray basemap + place-name labels: keyless (CARTO now needs an API key, and
      // OpenStreetMap's own tile servers block apps that don't follow their usage policy).
      const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_";
      leaflet.tileLayer(`${esri}Base/MapServer/tile/{z}/{y}/{x}`, {
        attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; OpenStreetMap contributors',
        maxZoom: 16,
      }).addTo(m);
      leaflet.tileLayer(`${esri}Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 }).addTo(m);
      leaflet.control.zoom({ position: "topright" }).addTo(m);
      leaflet.marker([origin.lat, origin.lng], {
        icon: leaflet.divIcon({ className: "", html: '<span style="display:block;width:14px;height:14px;border-radius:9999px;background:#0ea5e9;border:2px solid #fff;box-shadow:0 0 0 6px rgba(14,165,233,.25)"></span>', iconSize: [14, 14] }),
        keyboard: false,
        title: "You",
      }).addTo(m);
      markers.current = dealers.map((d, i) =>
        leaflet.marker([d.lat, d.lng], { title: d.name })
          .on("click", () => select(i))
          .addTo(m),
      );
      highlight(latest.current.active); // the user may have clicked a row while Leaflet loaded
      m.fitBounds(leaflet.latLngBounds([[origin.lat, origin.lng], ...dealers.map((d) => [d.lat, d.lng] as [number, number])]), { padding: [28, 28] });
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [dealers, origin.lat, origin.lng]);

  useEffect(() => {
    highlight(active);
    if (dealers[active]) map.current?.panTo([dealers[active].lat, dealers[active].lng], { animate: true });
  }, [active, dealers]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div ref={el} className="relative z-0 h-48 overflow-hidden sm:h-[220px] rounded-xl bg-[#eef1ee]" aria-label="Map of nearby Toyota dealerships" role="img" />

      <ol className="space-y-1.5">
        {dealers.map((d, i) => (
          <li key={d.name}>
            <div onClick={() => select(i)}
              className={`flex w-full cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-left transition ${i === active ? "border-neutral-900 bg-white shadow-sm" : "border-neutral-200 hover:border-neutral-400"}`}>
              <button onClick={(e) => { e.stopPropagation(); select(i); }} aria-label={`Show ${d.name} on the map`}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${i === active ? "bg-[#EB0A1E]" : "bg-neutral-800"} ${ring}`}>{i + 1}</button>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold">{d.name}</span>
                <span className="block truncate text-[12px] text-neutral-600">{d.address}</span>
                <span className="block text-[12px] text-neutral-600">
                  ~{d.distanceMi.toFixed(1)} mi ·{" "}
                  <a href={directionsUrl(d)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                    className={`font-semibold underline max-md:inline-flex max-md:min-h-11 max-md:items-center underline-offset-2 hover:text-[#EB0A1E] ${ring}`}>Directions</a>
                </span>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
