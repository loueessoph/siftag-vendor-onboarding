/**
 * What Stripe actually charged on each payment. The vendor agreement
 * (clause 2.4) lets Siftag pass on the card processing fees really
 * incurred, so the figure comes from the payment's balance transaction,
 * not from a published rate: a foreign card costs more than a UK one. A
 * succeeded payment's fee never changes, so it is remembered for the life
 * of the server.
 */

import { stripe } from "./stripe";

const cache = new Map<string, number>();

export async function cardFeesForPayments(paymentIntentIds: string[]): Promise<Map<string, number>> {
  const wanted = [...new Set(paymentIntentIds.filter(Boolean))];
  const missing = wanted.filter((id) => !cache.has(id));
  if (missing.length && process.env.STRIPE_SECRET_KEY) {
    await Promise.all(
      missing.map(async (id) => {
        try {
          const pi = await stripe().paymentIntents.retrieve(id, { expand: ["latest_charge.balance_transaction"] });
          const charge = typeof pi.latest_charge === "string" ? null : pi.latest_charge;
          const bt = charge && typeof charge.balance_transaction !== "string" ? charge.balance_transaction : null;
          if (bt && pi.status === "succeeded") cache.set(id, bt.fee / 100);
        } catch (err) {
          console.error("Could not read the Stripe fee for", id, (err as Error).message);
        }
      })
    );
  }
  return new Map(wanted.filter((id) => cache.has(id)).map((id) => [id, cache.get(id)!]));
}

/**
 * A payment's fee shared across the pieces it paid for, in proportion to
 * price, rounded to the penny so the pieces add back up to the fee.
 */
export function shareFee(fee: number, prices: number[]): number[] {
  const total = prices.reduce((s, p) => s + p, 0);
  if (total <= 0) return prices.map(() => 0);
  let allocated = 0;
  return prices.map((p, i) => {
    if (i === prices.length - 1) return Math.round((fee - allocated) * 100) / 100;
    const part = Math.round((fee * p) / total * 100) / 100;
    allocated += part;
    return part;
  });
}
