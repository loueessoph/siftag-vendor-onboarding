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

const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
const SWIPE_AT = 80;
/** A small, fixed tilt per card, so the pile looks put down by hand rather than generated. Stays with the card as it moves through the stack. */
const TILTS = [-1.2, 0.8, -0.4, 1.4, -0.9, 0.5, -1.4, 1.1, -0.6, 0.9, -1.0, 0.3];

/**
 * A pile of cards. The top one can be dragged off to either side; when it
 * goes, the next rises into place and the one that left slips quietly back
 * underneath. Arrows, dots and keyboard do the same.
 */
export function CardDeck({ cards }: { cards: DeckCard[] }) {
  const count = cards.length;
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState<number | null>(null);
  const [returning, setReturning] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const busy = useRef(false);

  const advance = useCallback(
    (dir: -1 | 1) => {
      if (busy.current || count < 2) return;
      busy.current = true;
      const card = index;
      setDragging(false);
      setFlying(card);
      setDx(dir * 560);
      window.setTimeout(() => {
        // Gone off the edge: jump to the back unseen, then fade in there.
        setFlying(null);
        setReturning(card);
        setIndex((i) => (i + 1) % count);
        setDx(0);
        window.setTimeout(() => {
          setReturning(null);
          busy.current = false;
        }, 320);
      }, 240);
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
  const pull = Math.min(Math.abs(dx) / 200, 1); // how far the top card has been pulled, 0..1

  return (
    <div className="select-none">
      <div className="-mx-6 overflow-hidden px-6 pb-4 pt-2">
        <div className="relative mx-auto aspect-[4/5] w-full max-w-[360px]">
          {cards.map((card, i) => {
            const pos = (i - index + count) % count; // 0 = top
            const tilt = TILTS[i % TILTS.length];
            const isFlying = flying === i;
            const isReturning = returning === i;
            const onTop = pos === 0 && !isFlying;

            let transform: string;
            let zIndex: number;
            let opacity = 1;
            let transition: string;
            if (isFlying) {
              transform = `translate(${dx}px, ${Math.abs(dx) * 0.08}px) rotate(${dx / 14}deg)`;
              zIndex = count + 1;
              transition = `transform 240ms ease-in`;
            } else if (onTop) {
              transform = `translate(${dx}px, 0) rotate(${dx / 14}deg) scale(${1 + pull * 0.02})`;
              zIndex = count;
              transition = dragging ? "none" : `transform 380ms ${EASE}`;
            } else {
              const d = Math.min(pos, 3);
              // Each card behind sits a touch down and to the right, as the next one rises it closes that gap.
              const lift = pos === 1 ? pull : 0;
              const dd = d - lift;
              transform = `translate(${dd * 3}px, ${dd * 6}px) rotate(${tilt * (1 - lift)}deg) scale(${1 - dd * 0.025})`;
              zIndex = count - pos;
              opacity = pos > 3 ? 0 : 1;
              transition = isReturning
                ? `opacity 320ms ${EASE}`
                : dragging && pos === 1
                  ? "none"
                  : `transform 380ms ${EASE}, opacity 320ms ${EASE}`;
              if (isReturning) opacity = pos > 3 ? 0 : 1;
            }
            const interactive = onTop && !busy.current;
            const image = (
              <Image
                src={card.src}
                alt={pos <= 1 ? card.alt : ""}
                fill
                unoptimized
                priority={pos <= 1}
                loading={pos <= 4 ? "eager" : "lazy"}
                sizes="(max-width: 640px) 90vw, 360px"
                className="object-cover"
                draggable={false}
              />
            );
            return (
              <div
                key={card.src}
                className={`absolute inset-0 touch-pan-y overflow-hidden rounded-lg bg-white ring-1 ring-black/10 ${isReturning ? "deck-return" : ""}`}
                style={{
                  transform,
                  transformOrigin: "50% 60%",
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

      <div className="mx-auto mt-4 flex w-full max-w-[360px] items-center justify-between">
        <button type="button" aria-label="Previous card" onClick={() => advance(-1)} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:text-gray-900">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-1.5">
          {cards.map((c, i) => (
            <span key={c.src} className={`h-1 rounded-full transition-all duration-300 ${i === index ? "w-4 bg-gray-900" : "w-1 bg-gray-300"}`} />
          ))}
        </div>
        <button type="button" aria-label="Next card" onClick={() => advance(1)} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:text-gray-900">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-gray-400">Swipe to see the line-up · tap a card to see that brand&apos;s rail</p>
    </div>
  );
}
