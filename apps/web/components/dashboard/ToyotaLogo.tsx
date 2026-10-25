// Toyota emblem (three ellipses) in the red square, plus the black wordmark, as on toyota.com.
export default function ToyotaLogo() {
  return (
    <span className="flex items-center gap-2.5" aria-label="Toyota">
      <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
        <rect width="40" height="40" fill="#EB0A1E" />
        <g fill="none" stroke="#fff" strokeWidth="2.2">
          <ellipse cx="20" cy="20" rx="13.5" ry="9" />
          <ellipse cx="20" cy="17.2" rx="7.6" ry="3.8" />
          <ellipse cx="20" cy="21.5" rx="3.1" ry="7.6" />
        </g>
      </svg>
      <span className="text-[22px] font-extrabold tracking-tight text-black">TOYOTA</span>
    </span>
  );
}
