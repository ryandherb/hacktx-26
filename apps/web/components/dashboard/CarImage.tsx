// Fills its (relatively positioned) parent so the dashboard can size the car to the screen height.
export default function CarImage({ src, label, placeholder = false }: { src: string; label: string; placeholder?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={placeholder ? `${label} (placeholder photo)` : label} className="absolute inset-0 h-full w-full select-none object-contain" draggable={false} />
  );
}
