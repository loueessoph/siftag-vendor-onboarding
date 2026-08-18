import { Button, Field, Input, Muted, Textarea } from "@/components/ui";
import { KEY_DATES, formatDate } from "@/lib/dates";
import {
  addPostUrlAction,
  declareDispatchAction,
  removePostUrlAction,
  saveWeekendPlansAction,
} from "@/app/vendor/actions";

/* Step 3: dispatch ---------------------------------------------------------- */

/**
 * We don't ask for the courier. Tracking numbers are resolvable through
 * universal parcel tracking on our side, and every extra field is one more
 * thing for a brand to get wrong at 11pm.
 */
export function DispatchForm({
  token,
  deliveries,
  error,
  saved,
}: {
  token: string;
  deliveries: {
    id: string;
    box_count: number | null;
    tracking_reference: string | null;
    declared_at: string | null;
    received_at: string | null;
  }[];
  error?: string;
  saved?: boolean;
}) {
  const totalDeclared = deliveries.reduce((n, d) => n + (d.box_count ?? 0), 0);

  return (
    <div>
      <p className="text-[15px] font-medium">Tell us it&apos;s on the way</p>
      <div className="mt-1.5">
        <Muted>
          Once you&apos;ve sent your boxes, let us know how many and add a
          tracking number if you have one. Everything needs to reach us by{" "}
          {formatDate(KEY_DATES.stockArrival)}.
        </Muted>
      </div>

      {saved && (
        <p className="mt-6 border border-neutral-900 p-4 text-sm">
          Thanks, that&apos;s logged. We&apos;ll tick your boxes off here as
          they arrive.
        </p>
      )}

      {deliveries.length > 0 && (
        <div className="mt-8">
          <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
            {totalDeclared} {totalDeclared === 1 ? "box" : "boxes"} declared
          </p>
          <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
            {deliveries.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-baseline justify-between gap-3 py-3 text-sm"
              >
                <span>
                  {d.box_count} {d.box_count === 1 ? "box" : "boxes"}
                  {d.tracking_reference && (
                    <span className="ml-3 text-neutral-500">
                      {d.tracking_reference}
                    </span>
                  )}
                </span>
                <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                  {d.received_at ? "Received" : "On its way"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form action={declareDispatchAction} className="mt-8 max-w-md space-y-6">
        <input type="hidden" name="token" value={token} />
        <Field
          label="How many boxes"
          error={error === "boxes" ? "Enter at least one box." : undefined}
        >
          <Input
            name="box_count"
            type="number"
            min={1}
            inputMode="numeric"
            required
            placeholder="3"
            invalid={error === "boxes"}
          />
        </Field>
        <Field
          label="Tracking number"
          hint="Optional. No need to tell us the courier, we can look it up."
        >
          <Input name="tracking_reference" placeholder="AB123456789GB" />
        </Field>
        <Button size="compact" type="submit">
          {deliveries.length > 0 ? "Add another shipment" : "Send"}
        </Button>
      </form>
    </div>
  );
}

/* Step 4: posts ------------------------------------------------------------- */

const LOGOS = [
  { file: "/logos/siftag-logo-black.png", label: "Black logo", dark: false },
  { file: "/logos/siftag-logo-white.png", label: "White logo", dark: true },
];

export function PostsForm({
  token,
  postUrls,
  error,
}: {
  token: string;
  postUrls: string[];
  error?: string;
}) {
  const remaining = Math.max(0, 3 - postUrls.length);

  return (
    <div>
      <p className="text-[15px] font-medium">Your 3 posts</p>
      <div className="mt-1.5">
        <Muted>
          {postUrls.length === 0
            ? "Once you've posted, paste the link here so we can repost you."
            : remaining === 0
            ? "All three in. Thank you, we'll repost them."
            : `${postUrls.length} of 3 shared. ${remaining} to go.`}
        </Muted>
      </div>

      <div className="mt-6">
        <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
          Our logo, if you want it
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {LOGOS.map((logo) => (
            <a
              key={logo.file}
              href={logo.file}
              download
              className={`flex items-center gap-3 border px-4 py-3 transition-colors ${
                logo.dark
                  ? "border-neutral-900 bg-neutral-900"
                  : "border-neutral-300 hover:border-neutral-900"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo.file} alt="" className="h-4 w-auto" />
              <span
                className={`text-[11px] uppercase tracking-[0.15em] ${
                  logo.dark ? "text-white" : "text-neutral-500"
                }`}
              >
                {logo.label}
              </span>
            </a>
          ))}
        </div>
      </div>

      {postUrls.length > 0 && (
        <ul className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
          {postUrls.map((url) => (
            <li
              key={url}
              className="flex items-center justify-between gap-4 py-3"
            >
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate text-sm underline underline-offset-2 hover:text-neutral-500"
              >
                {url}
              </a>
              <form action={removePostUrlAction}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="post_url" value={url} />
                <button
                  type="submit"
                  className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 transition-colors hover:text-red-600"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={addPostUrlAction} className="mt-8 max-w-md space-y-6">
        <input type="hidden" name="token" value={token} />
        <Field
          label="Link to your post"
          error={
            error === "url" ? "That doesn't look like a web address." : undefined
          }
        >
          <Input
            name="post_url"
            required
            placeholder="instagram.com/p/..."
            invalid={error === "url"}
          />
        </Field>
        <Button size="compact" type="submit">
          Add post
        </Button>
      </form>
    </div>
  );
}

/* Step 4: the weekend ------------------------------------------------------- */

const TRADING_DAYS = [
  { value: KEY_DATES.tradingStart, label: "Friday 25 September" },
  { value: "2026-09-26", label: "Saturday 26 September" },
  { value: KEY_DATES.tradingEnd, label: "Sunday 27 September" },
];

export function WeekendForm({
  token,
  attendingDays,
  specialRequests,
  saved,
}: {
  token: string;
  attendingDays: string[];
  specialRequests: string | null;
  saved?: boolean;
}) {
  return (
    <div>
      <p className="text-[15px] font-medium">Your plans for the weekend</p>
      <div className="mt-1.5">
        <Muted>
          Tick the days you&apos;re coming, if any. Our team covers your space
          whenever you&apos;re not there.
        </Muted>
      </div>

      {saved && (
        <p className="mt-6 border border-neutral-900 p-4 text-sm">
          Saved. Change it any time before the weekend.
        </p>
      )}

      <form action={saveWeekendPlansAction} className="mt-8 max-w-md">
        <input type="hidden" name="token" value={token} />

        <fieldset>
          <legend className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
            Days you&apos;re working your space
          </legend>
          <div className="mt-3 space-y-3">
            {TRADING_DAYS.map((day) => (
              <label
                key={day.value}
                className="flex cursor-pointer items-center gap-3"
              >
                <input
                  type="checkbox"
                  name="days"
                  value={day.value}
                  defaultChecked={attendingDays.includes(day.value)}
                  className="h-4 w-4 accent-neutral-900"
                />
                <span className="text-sm">{day.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-8">
          <Field
            label="Special requests"
            hint="Anything you need from us: steaming, extra rail space, storage."
          >
            <Textarea
              name="special_requests"
              rows={4}
              defaultValue={specialRequests ?? ""}
            />
          </Field>
        </div>

        <div className="mt-6">
          <Button size="compact" type="submit">
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}
