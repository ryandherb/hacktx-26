// PLACEHOLDER image: not the profile's actual model year. Swap imageSrc in lib/demo/profiles.ts.
// Fills its (relatively positioned) parent so the dashboard can size the car to the screen height.
export default function CarImage({ src, label }: { src: string; label: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`${label} (placeholder photo)`} className="absolute inset-0 h-full w-full select-none object-contain" draggable={false} />
  );
}
