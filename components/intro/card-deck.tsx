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
};

const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";
const SWIPE_AT = 90;

/**
 * A stacked deck. Every card is always rendered in its slot (top, second,
 * third, then hidden behind), and moving to the next card is one eased
 * transition: the top card slides out to the side and glides round to the
 * bottom of the pile while the rest rise a place. Drag with a finger or
 * mouse, or use the arrows, dots or keyboard.
 */
export function CardDeck({ cards }: { cards: DeckCard[] }) {
  const count = cards.length;
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** The card on its way round to the back, and which side it left by. */
  const [leaving, setLeaving] = useState<{ card: number; dir: -1 | 1 } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const busy = useRef(false);

  const advance = useCallback(
    (dir: -1 | 1) => {
      if (busy.current || count < 2) return;
      busy.current = true;
      const card = index;
      // Phase 1: the top card slides out to the side.
      setDragging(false);
      setLeaving({ card, dir });
      setDx(dir * 520);
      // Phase 2: it belongs to the back now; the transition carries it there.
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % count);
        setDx(0);
      }, 230);
      window.setTimeout(() => {
        setLeaving(null);
        busy.current = false;
      }, 620);
    },
    [count, index]
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
    if (busy.current) return;
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    const d = e.clientX - start.current.x;
    if (Math.abs(d) > 6) moved.current = true;
    setDx(d);
  }
  function onPointerUp() {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (Math.abs(dx) > SWIPE_AT) advance(dx > 0 ? 1 : -1);
    else setDx(0);
  }

  if (count === 0) return null;

  return (
    <div className="select-none">
      {/* Clipped with room for the shadow, so a card leaving the pile never crosses into the copy beside it. */}
      <div className="-mx-6 overflow-hidden px-6 pb-6 pt-2">
      <div className="relative mx-auto aspect-[4/5] w-full max-w-[380px]">
        {cards.map((card, i) => {
          const pos = (i - index + count) % count; // 0 = top
          const isLeaving = leaving?.card === i;
          const onTop = pos === 0 && !isLeaving;
          // A fanned pile: each card behind sits a touch lower and turned
          // alternately left and right, four of them showing under the top.
          const stacked = (depth: number) => {
            const d = Math.min(depth, 4);
            const tilt = d === 0 ? 0 : (d % 2 === 0 ? 1 : -1) * d * 1.6;
            return `translateY(${d * 4}px) rotate(${tilt}deg) scale(${1 - d * 0.015})`;
          };
          let transform: string;
          let zIndex: number;
          let opacity = 1;
          if (isLeaving && pos === 0) {
            transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
            zIndex = count + 1;
          } else if (isLeaving) {
            transform = stacked(4);
            zIndex = 0;
          } else if (onTop) {
            transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
            zIndex = count;
          } else {
            transform = stacked(pos);
            zIndex = count - pos;
            opacity = pos > 4 ? 0 : 1;
          }
          const transition = onTop && dragging ? "none" : `transform 420ms ${EASE}, opacity 300ms ${EASE}`;
          const interactive = onTop && !busy.current;
          const image = (
            // The cards are already web-sized JPEGs (scripts made them 900px wide),
            // so they're served as-is rather than through the image optimiser.
            <Image
              src={card.src}
              alt={pos <= 2 ? card.alt : ""}
              fill
              unoptimized
              priority={pos <= 1}
              loading={pos <= 5 ? "eager" : "lazy"}
              sizes="(max-width: 640px) 90vw, 380px"
              className="object-cover"
              draggable={false}
            />
          );
          return (
            <div
              key={card.src}
              className="absolute inset-0 touch-pan-y overflow-hidden rounded-xl bg-white ring-1 ring-black/10"
              style={{
                transform,
                transformOrigin: "50% 100%",
                zIndex,
                opacity,
                transition,
                cursor: interactive ? (dragging ? "grabbing" : "grab") : "default",
                pointerEvents: interactive ? "auto" : "none",
              }}
              onPointerDown={interactive ? onPointerDown : undefined}
              onPointerMove={interactive ? onPointerMove : undefined}
              onPointerUp={interactive ? onPointerUp : undefined}
              onPointerCancel={interactive ? onPointerUp : undefined}
            >
              {card.href && onTop ? (
                <Link href={card.href} draggable={false} onClick={(e) => moved.current && e.preventDefault()} className="block h-full w-full">
                  {image}
                </Link>
              ) : (
                image
              )}
            </div>
          );
        })}
      </div>
      </div>

      <div className="mx-auto mt-6 flex w-full max-w-[420px] items-center justify-between">
        <button type="button" aria-label="Previous card" onClick={() => advance(-1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 text-gray-700 transition-colors hover:border-gray-900">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {cards.map((c, i) => (
            <span key={c.src} className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-4 bg-gray-900" : "w-1.5 bg-gray-300"}`} />
          ))}
        </div>
        <button type="button" aria-label="Next card" onClick={() => advance(1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 text-gray-700 transition-colors hover:border-gray-900">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-3 text-center text-[11px] text-gray-400">Swipe through the line-up · tap a brand to see their rail</p>
    </div>
  );
}
