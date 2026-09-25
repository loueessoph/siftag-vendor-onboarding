import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The floor staff brief: everything a retail assistant needs on the day,
 * in one scroll. Plain <details> dropdowns so it works on any phone with
 * no JavaScript, same as the rest of the staff pages. Content follows the
 * brief Sophie emailed the team before the event, plus how the till,
 * fitting room and pickup counter actually work in this app.
 */

export const EVENT_DAYS = [
  { date: "2026-09-25", label: "Friday 25" },
  { date: "2026-09-26", label: "Saturday 26" },
  { date: "2026-09-27", label: "Sunday 27" },
] as const;

type Brand = { name: string; slug: string; site: string; vibe: string; note?: string; attendingDays: string[] };

/** One or two lines on each brand, written from their websites. */
const BRAND_VIBES: Record<string, { site: string; vibe: string; note?: string }> = {
  "aefen-london": {
    site: "aefenlondon.com",
    vibe: "Coordinated sets: tops, shorts and trousers in checks and crisp whites, made in London. Contemporary and clean, around £75 to £100 a piece.",
    note: "Also bringing a few scrunchies and headbands, and spare sizes in a box rather than on the rail.",
  },
  "house-of-ador": {
    site: "houseofador.com",
    vibe: "Quiet luxury womenswear: silk velvet dresses, tailored wool coats and pure silk scarves. Paris polish meets London structure. Dresses around £350.",
  },
  hyli: {
    site: "hyli.co.uk",
    vibe: "Simple slip dresses made in England that go from breakfast to midnight, around £55. Also bringing vintage pieces such as cashmere knits and boots.",
  },
  "india-grace-london": {
    site: "indiagracelondon.com",
    vibe: "Timeless, fluid pieces with lace detailing in natural and cellulose fibres. Elegant and easy, roughly £80 to £250.",
  },
  "julie-may-lingerie": {
    site: "juliemay.co.uk",
    vibe: "Organic Pima cotton and silk lingerie and nightwear made for sensitive skin: eczema, psoriasis, menopause. Nickel-free, no exposed elastic.",
  },
  "laine-hill": {
    site: "lainehill.com",
    vibe: "Organic cotton activewear, sports bras and leggings, 92% organic cotton with a little elastane and no polyester. Think Alo vibes but without polyester, around £55 to £70.",
  },
  "margen-atelier": {
    site: "margenatelier.com",
    vibe: "Upcycled tops and shirts made in France with a bold, confident energy: “you are the main character”. Around £45 a top.",
  },
  "plain-and-simple": {
    site: "plainandsimple.com",
    vibe: "Organic cotton essentials for men and women: tees, tanks, hoodies, joggers, plus an undyed collection. Plastic-free, built to last.",
  },
  "sariva-rozen": {
    site: "sarivarozen.com",
    vibe: "Refined silk, cotton and linen everyday pieces and made-to-order evening gowns. Elegant and understated.",
    note: "The gowns on show are display samples: customers view them here and order online.",
  },
  "valentina-karellas": {
    site: "valentinakarellas.com",
    vibe: "Hand-crafted knitwear in salvaged and cashmere yarn, made in England. Urban, gender-neutral, bold colour. From £45 beanies to £560 jackets.",
  },
  "yusun-the-label": {
    site: "yusun.dk",
    vibe: "Danish label with a minimalist, editorial feel: lace-detailed tops and trousers, Scandinavian and modern. Around £80 to £95.",
  },
};

export function brandsForBrief(rows: Array<{ name: string; slug: string; attending_days: string[] | null }>): Brand[] {
  return rows
    .filter((r) => BRAND_VIBES[r.slug])
    .map((r) => ({ name: r.name, slug: r.slug, attendingDays: r.attending_days ?? [], ...BRAND_VIBES[r.slug] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function Briefing({ brands, today }: { brands: Brand[]; today: string }) {
  const dayIndex = EVENT_DAYS.findIndex((d) => d.date === today);
  const dayLabel = dayIndex >= 0 ? `Day ${dayIndex + 1} of 3 · ${EVENT_DAYS[dayIndex].label} September` : "25 to 27 September";
  const hereToday = brands.filter((b) => b.attendingDays.includes(today));

  return (
    <div className="max-w-3xl space-y-14">
      {/* ---------------------------------------------------------- Today */}
      <section>
        <Eyebrow>Today</Eyebrow>
        <p className="mt-1 font-display text-2xl">{dayLabel}</p>
        <dl className="mt-5 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          <Fact label="Where">Fabrica X, 36 to 40 York Way, King&apos;s Cross, N1 9AB</Fact>
          <Fact label="Doors">9am to 6pm for customers</Fact>
          <Fact label="Your shift">8am to 6pm. The hour before doors is set-up and training.</Fact>
          <Fact label="Break">One unpaid hour mid-shift, staggered between assistants. The rota is handed out on arrival.</Fact>
          <Fact label="Questions">Find Sophie, or post in the WhatsApp group.</Fact>
          <Fact label="Dress">Whatever you&apos;re comfortable in. Avoid obvious logos, there may be photos.</Fact>
        </dl>
      </section>

      {/* ------------------------------------------------------ The floor */}
      <section>
        <Eyebrow>How the floor works</Eyebrow>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-700">
          <li>
            <strong className="font-medium text-neutral-900">The Natural Fibre Edit:</strong> eleven independent brands selling
            directly across three days. Everything in the room is made from natural fibres: organic cotton, linen, wool, silk,
            hemp. Siftag is a platform for clothes made without plastic, and this is its first in-person event.
          </li>
          <li>
            <strong className="font-medium text-neutral-900">One central till</strong> for every brand. Some vendors are at their
            own rail on some days, others aren&apos;t here at all, so you cover the whole room.
          </li>
          <li>
            <strong className="font-medium text-neutral-900">You rotate</strong> between the till, the floor and backstock
            through the day.
          </li>
          <li>
            <strong className="font-medium text-neutral-900">Every garment wears a Siftag tag</strong> with a QR code and an
            eight-character code. That code is how the till, the fitting room and the pickup counter all know which exact piece
            is which. Keep tags on until the piece is paid for.
          </li>
        </ul>

        <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-neutral-500">Brands at their own rail today</p>
        {hereToday.length > 0 ? (
          <p className="mt-2 text-sm text-neutral-700">{hereToday.map((b) => b.name).join(" · ")}</p>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">None listed for today. The full plan is in the brand guide below.</p>
        )}
      </section>

      {/* ---------------------------------------------------- Customer FAQ */}
      <section>
        <Eyebrow>What customers ask</Eyebrow>
        <div className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
          <Faq q="Is entry free?">Yes.</Faq>
          <Faq q="Can I try things on?">Yes, there&apos;s a fitting area. Mark the piece as in the fitting room while they have it (see below).</Faq>
          <Faq q="What is this made of?">
            It&apos;s on the tag: the fibre composition is printed under the name. Every piece in the room is natural fibre, no
            polyester in any item.
          </Faq>
          <Faq q="Can I return this?">
            All sales are final. Faulty or damaged items can be returned within 30 days. If someone asks about a return,
            find Sophie.
          </Faq>
          <Faq q="Can I pay by cash?">No, card only. Contactless, Apple Pay and Google Pay all work.</Faq>
          <Faq q="Can I buy online and pick it up here?">
            Yes. Shopping at popup.siftag.com reserves the exact piece and they collect it from the Express counter with the
            code we email them. No pre-orders and no delivery: it&apos;s what&apos;s in the room, collected in the room.
          </Faq>
          <Faq q="Can I get this in another size?">
            Check Item lookup: it shows every size and how many are left. Some brands have spare sizes in a box rather than on
            the rail, so ask before saying no.
          </Faq>
          <Faq q="What is Siftag?">
            A platform for finding clothes made without plastic. Point them to Instagram: <strong className="font-medium">siftag.co</strong>.
          </Faq>
        </div>
      </section>

      {/* ------------------------------------------------------- Staff FAQ */}
      <section>
        <Eyebrow>How the system works</Eyebrow>
        <p className="mt-1 text-sm text-neutral-500">
          Sign in with your own name and password so every action is logged as you. The tabs at the top are the whole toolkit.
        </p>
        <div className="mt-4 divide-y divide-neutral-200 border-y border-neutral-200">
          <Faq q="Finding a piece: Item lookup">
            <Steps>
              <li>
                Open <Tab href="/admin/items">Item lookup</Tab> and search by name, brand or the code on the tag. Each card shows
                the photo, the sizes, how many of each are left and every tag code.
              </li>
              <li>Tap a tag code to change that piece&apos;s status (next question).</li>
            </Steps>
          </Faq>

          <Faq q="Fitting room and holds: keeping stock honest">
            <p>
              Online shoppers see live stock. If a piece is in the fitting room but still marked available, someone can buy it
              from home while a customer is wearing it. So:
            </p>
            <Steps>
              <li>
                When a customer takes a piece to try on, find it in <Tab href="/admin/items">Item lookup</Tab>, tap its code and
                press <strong className="font-medium">Fitting room</strong>.
              </li>
              <li>
                If they hand it back, press <strong className="font-medium">Available</strong>. If they buy it, the till marks it
                sold for you.
              </li>
              <li>
                <strong className="font-medium">Held</strong> is for a piece a customer has asked you to keep aside for a short
                while.
              </li>
            </Steps>
          </Faq>

          <Faq q="Selling at the till: Checkout">
            <Steps>
              <li>
                Open <Tab href="/admin/till">Checkout</Tab>. Scan each tag&apos;s QR with the camera, or type the code and press
                Add. Use the plus and minus to change quantities if a customer takes two of the same.
              </li>
              <li>
                Press <strong className="font-medium">Charge · Tap to Pay</strong>. The till shows an order code and the amount.
              </li>
              <li>
                In the Stripe app on the counter phone: tap the plus, choose <strong className="font-medium">Charge a card</strong>,
                type the same amount, put the order code in the description, choose Tap to Pay and let the customer tap their
                card or phone.
              </li>
              <li>
                Within a few seconds the till says <strong className="font-medium">Paid by card</strong> and marks the pieces sold.
                Hand them over, then press New sale.
              </li>
              <li>
                If the customer would rather pay on their own phone, press{" "}
                <strong className="font-medium">Charge · customer scans QR</strong> instead. They scan the screen and pay with
                Apple Pay, Google Pay or a card. Nothing to type.
              </li>
              <li>
                Changed their mind? <strong className="font-medium">Cancel sale</strong> puts the pieces straight back on the
                floor.
              </li>
            </Steps>
            <p className="mt-3 text-neutral-500">
              &ldquo;Just taken by someone else&rdquo; means an online shopper bought that exact piece seconds ago. The till removes
              it from the basket; offer another size or a spare from the box.
            </p>
          </Faq>

          <Faq q="Online orders: Order pickup">
            <p>
              When someone buys on popup.siftag.com, the pieces are reserved and their order appears on the{" "}
              <Tab href="/admin/pickup">Order pickup</Tab> tab the moment they pay. Their email has a pickup code and QR.
            </p>
            <Steps>
              <li>
                Press <strong className="font-medium">Start packing</strong> so nobody else picks the same order. The tag codes on
                the order tell you which exact pieces to pull.
              </li>
              <li>
                Bag them with the tags on and press <strong className="font-medium">Mark ready for pickup</strong>. The customer
                gets an email that it&apos;s ready.
              </li>
              <li>
                When they arrive, scan the QR on their phone with{" "}
                <strong className="font-medium">Scan with camera</strong>, or type their code, and press Confirm. The order moves
                to the collected list.
              </li>
              <li>
                If they turn up before you&apos;ve packed it, pull the pieces there and then, hand them over, and confirm anyway.
              </li>
            </Steps>
          </Faq>

          <Faq q="A customer lost their pickup code">
            <p>
              Send them to <strong className="font-medium">popup.siftag.com</strong> and the Track my order button at the top, or
              ask them to search their inbox for an email from <strong className="font-medium">popup@siftag.com</strong>. If they
              give you their name, the Order pickup list shows names and phone numbers too.
            </p>
          </Faq>

          <Faq q="The camera won&apos;t open">
            <p>
              Make sure the page address starts with <strong className="font-medium">https://popup.siftag.com</strong>. If the
              phone has blocked the camera, the scanner shows a Try again button and where to switch it back on. Typing the code
              under the QR always works as a fallback.
            </p>
          </Faq>

          <Faq q="Something is wrong with an order or the till">
            <p>
              Don&apos;t retry a payment blindly. Note the order code on the screen and find Sophie, or post it in the WhatsApp
              group. Every payment is on Stripe, so nothing is lost.
            </p>
          </Faq>
        </div>
      </section>

      {/* ---------------------------------------------------------- Brands */}
      <section>
        <Eyebrow>The brands</Eyebrow>
        <p className="mt-1 text-sm text-neutral-500">
          Eleven brands, all natural fibre. A line on each so you can talk about any rail in the room.
        </p>
        <ul className="mt-4 divide-y divide-neutral-200 border-y border-neutral-200">
          {brands.map((b) => (
            <li key={b.slug} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-medium">{b.name}</p>
                <a
                  href={`https://${b.site}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] uppercase tracking-[0.15em] text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
                >
                  {b.site}
                </a>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-neutral-700">{b.vibe}</p>
              {b.note && <p className="mt-1 text-sm leading-relaxed text-neutral-500">{b.note}</p>}
              <p className="mt-1.5 text-xs text-neutral-500">{attendance(b.attendingDays)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function attendance(days: string[]): string {
  const labels = EVENT_DAYS.filter((d) => days.includes(d.date)).map((d) => d.label.split(" ")[0]);
  if (labels.length === 0) return "No one from the brand on the floor: you look after their rail.";
  if (labels.length === EVENT_DAYS.length) return "At their rail all three days.";
  return `At their rail on ${labels.join(" and ")}. Other days, you look after it.`;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">{children}</p>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.15em] text-neutral-400">{label}</dt>
      <dd className="mt-0.5 leading-relaxed text-neutral-800">{children}</dd>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-neutral-900 [&::-webkit-details-marker]:hidden">
        <span>{q}</span>
        <span className="shrink-0 font-mono text-neutral-400 transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-700">{children}</div>
    </details>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 marker:text-neutral-400">{children}</ol>;
}

function Tab({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-neutral-900 underline underline-offset-4">
      {children}
    </Link>
  );
}
