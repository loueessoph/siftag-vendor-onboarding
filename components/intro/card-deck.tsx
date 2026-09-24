"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type DeckCard = {
  src: string;
  alt: string;
  /** Where a tap on the card goes; the brand cards open the shop narrowed to that brand. */
  href?: string;
};

const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
/** Distance, or speed, that counts as a swipe. */
const SWIPE_AT = 60;
const FLICK_SPEED = 0.45; // px per ms
/** A small, fixed tilt per card, so the pile looks put down by hand rather than generated. Stays with the card as it moves through the stack. */
const TILTS = [-1.2, 0.8, -0.4, 1.4, -0.9, 0.5, -1.4, 1.1, -0.6, 0.9, -1.0, 0.3];

const stackTransform = (depth: number, tilt: number) => {
  const d = Math.min(depth, 3);
  return `translate(${d * 3}px, ${d * 6}px) rotate(${tilt}deg) scale(${1 - d * 0.025})`;
};

/**
 * A pile of cards. Drag the top one off to either side and the next rises
 * into place while the one that left slips quietly back underneath. The
 * right arrow does the same; the left arrow brings the previous card back
 * in from the left, on top. While a finger is down the card follows it
 * through direct style updates, not React renders, so it stays smooth.
 */
export function CardDeck({ cards }: { cards: DeckCard[] }) {
  const count = cards.length;
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [flying, setFlying] = useState<{ card: number; dx: number } | null>(null);
  const [returning, setReturning] = useState<number | null>(null);
  const [entering, setEntering] = useState<{ card: number; settled: boolean } | null>(null);
  const [settling, setSettling] = useState(false);
  const els = useRef(new Map<number, HTMLDivElement>());
  const gesture = useRef<{ x: number; y: number; t: number; dx: number; moved: boolean; id: number } | null>(null);
  /** Until when the deck is mid-move. A timestamp rather than a flag, so a throttled timer can never leave it stuck. */
  const busyUntil = useRef(0);
  const isBusy = () => Date.now() < busyUntil.current;

  /**
   * Next: the top card flicks off in `dir` and the one beneath becomes the
   * top at once, so another swipe can start while the old card is still on
   * its way out. If a card is still flying when the next swipe comes, it is
   * simply dropped to the back early.
   */
  const flyTimer = useRef<number | null>(null);
  const advance = useCallback(
    (dir: -1 | 1) => {
      if (count < 2 || entering) return;
      if (flyTimer.current) {
        window.clearTimeout(flyTimer.current);
        flyTimer.current = null;
      }
      const card = index;
      setReturning(null);
      setFlying({ card, dx: dir * 620 });
      setIndex((i) => (i + 1) % count);
      flyTimer.current = window.setTimeout(() => {
        flyTimer.current = null;
        setFlying(null);
        setReturning(card);
        window.setTimeout(() => setReturning((r) => (r === card ? null : r)), 300);
      }, 220);
    },
    [count, index, entering]
  );

  /** Back: the previous card comes in from the left and lands on top. */
  const retreat = useCallback(() => {
    if (isBusy() || count < 2 || flying) return;
    busyUntil.current = Date.now() + 440;
    const prev = (index - 1 + count) % count;
    setEntering({ card: prev, settled: false });
    setIndex(prev);
    window.setTimeout(() => {
      setEntering({ card: prev, settled: true });
      window.setTimeout(() => setEntering(null), 400);
    }, 30);
  }, [count, index, flying]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") advance(-1);
      if (e.key === "ArrowLeft") retreat();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, retreat]);

  /* Finger tracking: the top card and the one beneath are moved directly. */
  function paint(dx: number) {
    const top = els.current.get(index);
    const next = els.current.get((index + 1) % count);
    if (top) top.style.transform = `translate(${dx}px, 0) rotate(${dx / 14}deg)`;
    if (next) {
      const pull = Math.min(Math.abs(dx) / 160, 1);
      const d = 1 - pull;
      next.style.transform = `translate(${d * 3}px, ${d * 6}px) rotate(${TILTS[((index + 1) % count) % TILTS.length] * d}deg) scale(${1 - d * 0.025})`;
    }
  }
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (isBusy() || count < 2) return; // only the "back" entrance holds the deck for a moment
    gesture.current = { x: e.clientX, y: e.clientY, t: Date.now(), dx: 0, moved: false, id: e.pointerId };
    const top = els.current.get(index);
    const next = els.current.get((index + 1) % count);
    if (top) top.style.transition = "none";
    if (next) next.style.transition = "none";
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    g.dx = e.clientX - g.x;
    if (Math.abs(g.dx) > 4 || Math.abs(e.clientY - g.y) > 4) g.moved = true;
    paint(g.dx);
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    gesture.current = null;
    const top = els.current.get(index);
    const next = els.current.get((index + 1) % count);
    if (top) top.style.transition = "";
    if (next) next.style.transition = "";
    const speed = Math.abs(g.dx) / Math.max(Date.now() - g.t, 1);
    if (Math.abs(g.dx) > SWIPE_AT || (speed > FLICK_SPEED && Math.abs(g.dx) > 20)) {
      // Keep going the way the finger was moving.
      if (top) top.style.transform = "";
      if (next) next.style.transform = "";
      advance(g.dx > 0 ? 1 : -1);
      return;
    }
    // Let go early: spring back, and a clean tap opens the card's page.
    if (top) top.style.transform = "";
    if (next) next.style.transform = "";
    setSettling(true);
    window.setTimeout(() => setSettling(false), 300);
    if (!g.moved && cards[index].href) router.push(cards[index].href);
  }

  if (count === 0) return null;

  return (
    <div className="select-none">
      <div className="-mx-6 overflow-hidden px-6 pb-3 pt-1">
        <div className="relative mx-auto aspect-[4/5] w-full" style={{ maxWidth: "var(--deck-w, 360px)" }}>
          {cards.map((card, i) => {
            const pos = (i - index + count) % count; // 0 = top
            const tilt = TILTS[i % TILTS.length];
            const isFlying = flying?.card === i;
            const isReturning = returning === i;
            const isEntering = entering?.card === i && !entering.settled;
            const onTop = pos === 0 && !isFlying;

            let transform: string;
            let zIndex: number;
            let opacity = 1;
            let transition: string;
            if (isFlying) {
              transform = `translate(${flying.dx}px, ${Math.abs(flying.dx) * 0.06}px) rotate(${flying.dx / 14}deg)`;
              zIndex = count + 1;
              transition = "transform 220ms ease-in";
            } else if (isEntering) {
              transform = "translate(-620px, 30px) rotate(-30deg)";
              zIndex = count + 1;
              transition = "none";
            } else if (onTop) {
              transform = "translate(0, 0) rotate(0deg)";
              zIndex = count;
              transition = settling ? `transform 300ms ${EASE}` : `transform 380ms ${EASE}`;
            } else {
              transform = stackTransform(pos, tilt);
              zIndex = count - pos;
              opacity = pos > 3 ? 0 : 1;
              transition = isReturning ? "none" : `transform 380ms ${EASE}, opacity 300ms ${EASE}`;
            }
            const interactive = onTop && !isFlying;
            return (
              <div
                key={card.src}
                ref={(el) => {
                  if (el) els.current.set(i, el);
                  else els.current.delete(i);
                }}
                role={card.href && onTop ? "link" : undefined}
                aria-label={onTop ? card.alt : undefined}
                className={`absolute inset-0 overflow-hidden rounded-lg bg-white ring-1 ring-black/10 ${isReturning ? "deck-return" : ""}`}
                style={{
                  transform,
                  transformOrigin: "50% 60%",
                  zIndex,
                  opacity,
                  transition,
                  // The card owns the touch: no browser panning or link/image drag on top of it.
                  touchAction: interactive ? "none" : "auto",
                  WebkitUserSelect: "none",
                  WebkitTouchCallout: "none",
                  cursor: interactive ? "grab" : "default",
                  pointerEvents: interactive ? "auto" : "none",
                }}
                onPointerDown={interactive ? onPointerDown : undefined}
                onPointerMove={interactive ? onPointerMove : undefined}
                onPointerUp={interactive ? onPointerUp : undefined}
                onPointerCancel={interactive ? onPointerUp : undefined}
              >
                <Image
                  src={card.src}
                  alt={pos <= 1 ? card.alt : ""}
                  fill
                  unoptimized
                  priority={pos <= 1}
                  loading={pos <= 4 ? "eager" : "lazy"}
                  sizes="(max-width: 640px) 90vw, 360px"
                  className="pointer-events-none object-cover"
                  draggable={false}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mx-auto mt-2 flex w-full items-center justify-center gap-6" style={{ maxWidth: "var(--deck-w, 360px)" }}>
        <button type="button" aria-label="Previous card" onClick={retreat} className="p-2 text-gray-400 transition-colors hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="w-14 text-center text-[11px] tabular-nums tracking-[0.2em] text-gray-500">
          {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
        </span>
        <button type="button" aria-label="Next card" onClick={() => advance(-1)} className="p-2 text-gray-400 transition-colors hover:text-gray-900">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
