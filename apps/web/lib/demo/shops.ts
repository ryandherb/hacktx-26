// SAMPLE nearby-shop data for the demo map (fictional businesses, approximate positions).
// The Cost Agent's /quote only returns shop names today; real listings are planned through
// SerpApi google_maps on the backend (see issue_2_cost_agent/COST_AGENT_README.md, step 7).

export type DemoShop = {
  name: string;
  kind: "dealer" | "independent";
  specialty: string;
  distanceMi: number;
  rating: number;
  reviews: number;
  hours: string;
  // Pin position on the stylized map, in percent of its width/height.
  x: number;
  y: number;
};

const TOYOTA_SERVICE: Omit<DemoShop, "distanceMi" | "x" | "y"> = {
  name: "Toyota Certified Service Center",
  kind: "dealer",
  specialty: "Factory-trained diagnosis, genuine parts",
  rating: 4.7,
  reviews: 1284,
  hours: "Open until 7 PM",
};

export const DEMO_SHOPS: Record<string, DemoShop[]> = {
  maria: [
    { ...TOYOTA_SERVICE, distanceMi: 2.4, x: 68, y: 30 },
    { name: "Austin Transmission Co.", kind: "independent", specialty: "Transmissions", distanceMi: 1.1, rating: 4.8, reviews: 312, hours: "Open until 6 PM", x: 32, y: 72 },
    { name: "Central TX Auto Care", kind: "independent", specialty: "General repair", distanceMi: 1.9, rating: 4.6, reviews: 541, hours: "Open until 6 PM", x: 22, y: 34 },
  ],
  dev: [
    { ...TOYOTA_SERVICE, distanceMi: 3.1, x: 72, y: 26 },
    { name: "South Austin Auto A/C", kind: "independent", specialty: "A/C and diagnostics", distanceMi: 0.8, rating: 4.9, reviews: 208, hours: "Open until 6 PM", x: 34, y: 74 },
    { name: "Quick Fix Garage", kind: "independent", specialty: "General repair", distanceMi: 1.6, rating: 4.4, reviews: 167, hours: "Open until 5:30 PM", x: 20, y: 40 },
  ],
};

// The demo's sample mechanic quote (public/demo/sample-mechanic-quote.{png,pdf}).
// Uploading exactly this file "reads" it for the demo; any other file asks for the total instead,
// because the frontend can't actually read documents (that would be a backend OCR/LLM step).
export type ReadQuote = {
  shop: string;
  date: string;
  vehicle: string;
  diagnosis: string;
  items: { description: string; amount: number }[];
  total: number;
};

export const SAMPLE_QUOTE_HASHES = [
  "37316f20ec9ab2d332619280da0c1ecf0f6872d5b0ea23be4692c5435378b955", // .png
  "02649e1cf14e3679d4b09d554eaf55bc29b83a81032e175c57e38da38ec8eaff", // .pdf
];

export const SAMPLE_QUOTE: ReadQuote = {
  shop: "South Austin Auto A/C",
  date: "Oct 24, 2026",
  vehicle: "2010 Toyota Corolla S",
  diagnosis: "Compressor clutch bearing failure and internal compressor wear.",
  items: [
    { description: "A/C system diagnosis", amount: 95 },
    { description: "A/C compressor (remanufactured)", amount: 545 },
    { description: "Receiver / drier", amount: 68 },
    { description: "Expansion valve", amount: 52 },
    { description: "Refrigerant evacuate & recharge", amount: 120 },
    { description: "Labor: 4.0 hrs @ $130", amount: 520 },
    { description: "Shop supplies & disposal", amount: 50 },
  ],
  total: 1450,
};

export async function readDemoQuote(file: File): Promise<ReadQuote | null> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return SAMPLE_QUOTE_HASHES.includes(hex) ? SAMPLE_QUOTE : null;
}
