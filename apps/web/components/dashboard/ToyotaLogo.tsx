// Toyota emblem (official red-square artwork) plus the black wordmark, as on toyota.com.
export default function ToyotaLogo() {
  return (
    <span className="flex items-center gap-2.5" aria-label="Toyota">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/toyota-emblem.png" alt="" aria-hidden className="h-9 w-9" />
      <span className="text-[22px] font-extrabold tracking-tight text-black">TOYOTA</span>
    </span>
  );
}
