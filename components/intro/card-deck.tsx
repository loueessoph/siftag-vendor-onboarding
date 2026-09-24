"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type DeckCard = {
  src: string;
  alt: string;
  /** Where a tap on the card goes; the brand cards open the shop narrowed to that brand. */
  href?: string;
  label?: string;
};

/**
 * A deck of 4:5 cards: the top one can be dragged left or right (finger or
 * mouse) and flicks away to reveal the next; arrows and dots do the same
 * for anyone who'd rather click. Loops round at the end.
 */
export function CardDeck({ cards }: { cards: DeckCard[] }) {
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState<{ dx: number; dragging: boolean; leaving: -1 | 0 | 1 }>({ dx: 0, dragging: false, leaving: 0 });
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const count = cards.length;

  const advance = useCallback(
    (dir: -1 | 1) => {
      setDrag({ dx: dir * 600, dragging: false, leaving: dir });
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % count);
        setDrag({ dx: 0, dragging: false, leaving: 0 });
      }, 260);
    },
    [count]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") advance(1);
      if (e.key === "ArrowLeft") advance(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance]);

  function onPointerDown(e: React.PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag((d) => ({ ...d, dragging: true }));
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    if (Math.abs(dx) > 6) moved.current = true;
    setDrag({ dx, dragging: true, leaving: 0 });
  }
  function onPointerUp() {
    if (!start.current) return;
    const dx = drag.dx;
    start.current = null;
    if (Math.abs(dx) > 90) advance(dx > 0 ? 1 : -1);
    else setDrag({ dx: 0, dragging: false, leaving: 0 });
  }

  if (count === 0) return null;
  const top = cards[index];
  // Three underneath: two peek out, the third is only there so its image is already loaded when it surfaces.
  const behind = [1, 2, 3].map((n) => cards[(index + n) % count]);

  return (
    <div className="select-none">
      <div className="relative mx-auto aspect-[4/5] w-full max-w-[420px]">
        {/* the two underneath, peeking out */}
        {behind.map((card, n) => (
          <div
            key={`${card.src}-${n}`}
            className="absolute inset-0 overflow-hidden rounded-2xl bg-gray-100 shadow-md"
            style={{ transform: `translateY(${Math.min(n + 1, 2) * 10}px) scale(${1 - Math.min(n + 1, 2) * 0.04})`, zIndex: 2 - n, visibility: n > 1 ? "hidden" : "visible" }}
          >
            <Image src={card.src} alt="" fill loading="eager" sizes="(max-width: 640px) 90vw, 420px" className="object-cover" />
          </div>
        ))}

        {/* the top card */}
        <div
          className="absolute inset-0 touch-pan-y overflow-hidden rounded-2xl bg-gray-100 shadow-xl"
          style={{
            zIndex: 3,
            transform: `translateX(${drag.dx}px) rotate(${drag.dx / 18}deg)`,
            transition: drag.dragging ? "none" : "transform 260ms ease",
            opacity: drag.leaving ? 0 : 1,
            cursor: drag.dragging ? "grabbing" : "grab",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {top.href ? (
            <Link href={top.href} draggable={false} onClick={(e) => moved.current && e.preventDefault()} className="block h-full w-full">
              <Image src={top.src} alt={top.alt} fill priority sizes="(max-width: 640px) 90vw, 420px" className="object-cover" draggable={false} />
            </Link>
          ) : (
            <Image src={top.src} alt={top.alt} fill priority sizes="(max-width: 640px) 90vw, 420px" className="object-cover" draggable={false} />
          )}
          {top.label && (
            <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-[11px] uppercase tracking-widest text-gray-900">
              {top.label}
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto mt-5 flex w-full max-w-[420px] items-center justify-between">
        <button type="button" aria-label="Previous card" onClick={() => advance(-1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 text-gray-700 hover:border-gray-900">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {cards.map((c, i) => (
            <span key={c.src} className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-gray-900" : "w-1.5 bg-gray-300"}`} />
          ))}
        </div>
        <button type="button" aria-label="Next card" onClick={() => advance(1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 text-gray-700 hover:border-gray-900">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-3 text-center text-[11px] text-gray-400">Swipe through the line-up · tap a brand to see their rail</p>
    </div>
  );
}
