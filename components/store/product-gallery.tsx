"use client";

import { useState } from "react";
import Image from "next/image";
import { sized } from "@/lib/images";
import { PhotoPlaceholder } from "./photo-placeholder";

/**
 * Product photos: one large, the rest as thumbnails that swap it. Every
 * photo, including the first, gets a thumbnail so the shopper can always
 * get back to it; the current one is outlined.
 */
export function ProductGallery({ title, urls }: { title: string; urls: string[] }) {
  const [index, setIndex] = useState(0);
  const current = urls[index] ?? urls[0];

  return (
    <div className="space-y-3">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-gray-200">
        {current ? (
          <Image
            key={current}
            src={sized(current, 1200)}
            alt={index === 0 ? title : `${title} ${index + 1}`}
            fill
            priority={index === 0}
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover object-top"
          />
        ) : (
          <PhotoPlaceholder />
        )}
      </div>
      {urls.length > 1 && (
        <div className={`grid gap-2 ${urls.length > 4 ? "grid-cols-5" : "grid-cols-4"}`}>
          {urls.slice(0, 10).map((url, i) => {
            const active = i === index;
            return (
              <button
                key={url}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-pressed={active}
                className={`relative aspect-[3/4] w-full overflow-hidden rounded-md bg-gray-200 ring-offset-2 transition ${
                  active ? "ring-2 ring-gray-900" : "opacity-80 hover:opacity-100"
                }`}
              >
                <Image
                  src={sized(url, 400)}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 25vw, 12vw"
                  className="object-cover object-top"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
