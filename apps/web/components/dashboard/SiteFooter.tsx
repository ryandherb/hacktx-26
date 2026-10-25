import ToyotaLogo from "./ToyotaLogo";

// Toyota-style footer: the white page fades into a light gray band with a thin inset rule and centered logo.
export default function SiteFooter() {
  return (
    <footer>
      <div aria-hidden className="h-28 bg-gradient-to-b from-white to-[#f5f5f5]" />
      <div className="bg-[#f5f5f5]">
        <div className="mx-auto max-w-[1440px] px-6 pb-10 md:px-7">
          <div className="border-t border-neutral-300" />
          <div className="mt-9 flex justify-center">
            <ToyotaLogo />
          </div>
        </div>
      </div>
    </footer>
  );
}
