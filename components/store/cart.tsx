"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * The shopper's bag. One entry per physical garment (a unit code), since
 * that is what gets paid for and collected. Lives in the browser only;
 * nothing is held until checkout, when the whole bag is claimed at once.
 */
export type BagItem = {
  unitCode: string;
  productId: string;
  title: string;
  brandName: string;
  size: string | null;
  colour: string | null;
  priceGbp: number;
  imageUrl: string | null;
};

type Cart = {
  items: BagItem[];
  ready: boolean;
  add: (item: BagItem) => boolean;
  remove: (unitCode: string) => void;
  removeMany: (unitCodes: string[]) => void;
  clear: () => void;
  has: (unitCode: string) => boolean;
  count: number;
  totalGbp: number;
};

const KEY = "siftag-popup-bag";
const MAX_ITEMS = 10;
const CartContext = createContext<Cart | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BagItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* private mode or blocked storage: start empty */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items, ready]);

  // The updater runs at render time, so the answer has to come from a ref
  // that always holds the latest bag, not from inside setItems.
  const itemsRef = useRef<BagItem[]>([]);
  itemsRef.current = items;
  const add = useCallback((item: BagItem) => {
    const current = itemsRef.current;
    if (current.some((i) => i.unitCode === item.unitCode) || current.length >= MAX_ITEMS) return false;
    const next = [...current, item];
    itemsRef.current = next;
    setItems(next);
    return true;
  }, []);
  // Both return the bag untouched when nothing matches: a fresh array for
  // the same contents counts as a change, and an effect that removes paid
  // items would then re-run forever.
  const remove = useCallback((unitCode: string) => {
    setItems((c) => (c.some((i) => i.unitCode === unitCode) ? c.filter((i) => i.unitCode !== unitCode) : c));
  }, []);
  const removeMany = useCallback((codes: string[]) => {
    const set = new Set(codes.map((c) => c.toUpperCase()));
    setItems((c) => (c.some((i) => set.has(i.unitCode.toUpperCase())) ? c.filter((i) => !set.has(i.unitCode.toUpperCase())) : c));
  }, []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<Cart>(
    () => ({
      items,
      ready,
      add,
      remove,
      removeMany,
      clear,
      has: (code) => items.some((i) => i.unitCode === code),
      count: items.length,
      totalGbp: items.reduce((s, i) => s + i.priceGbp, 0),
    }),
    [items, ready, add, remove, removeMany, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): Cart {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("useCart must be used inside CartProvider");
  return cart;
}

export const BAG_LIMIT = MAX_ITEMS;
