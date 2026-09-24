import Image from "next/image";

/** Stands in for a missing product photo: the wordmark, greyed, centred, the way siftag.com's grid does it. */
export function PhotoPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Image src="/SiftagLogo.png" alt="" width={120} height={40} className="w-1/2 opacity-30 grayscale" />
    </div>
  );
}
