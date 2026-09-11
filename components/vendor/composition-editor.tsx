"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import {
  FIBRES,
  FIBRE_KIND_LABEL,
  fibreByName,
  formatComposition,
  parseComposition,
  type FibreKind,
} from "@/lib/fibre";

/**
 * Fibre composition as rows of [fibre] [%], rather than a free-text box.
 *
 * The stored value is still the text form ("78% Pima Cotton, 22% Silk"), so
 * the snapshot, the natural-fibre check and the tag printer are untouched:
 * this component parses that text into rows on the way in and formats rows
 * back into it on the way out. A fibre we don't list (the scrape found
 * "SeaCell" before we added it) shows as "Other" with its name kept, so
 * nothing a brand entered is thrown away by the dropdown.
 */

type Row = { key: number; fibre: string; other: string; pct: string };

const OTHER = "__other";
const KINDS: FibreKind[] = ["natural", "regenerated", "synthetic"];

let nextKey = 1;

function rowsFrom(value: string | null): Row[] {
  return parseComposition(value).map((part) => ({
    key: nextKey++,
    fibre: part.fibre ? part.fibre.name : OTHER,
    other: part.fibre ? "" : part.name,
    pct: String(part.pct),
  }));
}

function emptyRow(): Row {
  return { key: nextKey++, fibre: "", other: "", pct: "" };
}

/** Digits only, one decimal point, never above 100: a share can't be. */
function cleanPct(raw: string): string {
  const text = raw.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 5);
  if (text === "" || text === ".") return "";
  return Number(text) > 100 ? "100" : text;
}

function trimPct(pct: string): string {
  return String(Number(pct));
}

function serialise(rows: Row[]): string {
  return formatComposition(
    rows.map((r) => ({
      name: r.fibre === OTHER ? r.other : r.fibre,
      pct: Number(r.pct),
      fibre: r.fibre === OTHER ? null : fibreByName(r.fibre),
    }))
  );
}

export function CompositionEditor({
  value,
  locked,
  invalid = false,
  onChange,
}: {
  value: string | null;
  locked: boolean;
  invalid?: boolean;
  onChange: (text: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    const parsed = rowsFrom(value);
    return parsed.length > 0 ? parsed : [emptyRow()];
  });

  // The text form a vendor typed before this editor existed, kept in view
  // until they replace it so a sentence like "mostly wool" isn't lost.
  const legacy = value && rowsFrom(value).length === 0 ? value : null;

  // Only emit when the rows change what we'd store, so mounting doesn't fire
  // a save for every product on the page (a stored "100% organic cotton"
  // reformats to "100% Organic Cotton" but isn't a change the vendor made).
  const last = useRef(serialise(rows));
  useEffect(() => {
    const text = serialise(rows);
    if (text === last.current) return;
    if (!text && legacy) return; // nothing chosen yet; keep their sentence
    last.current = text;
    onChange(text);
  }, [rows, legacy, onChange]);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const remove = (key: number) =>
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length > 0 ? next : [emptyRow()];
    });

  const total = rows.reduce((s, r) => s + (Number(r.pct) || 0), 0);

  // A row that is half done contributes nothing to the stored composition,
  // so say which half is missing rather than let the list-level check
  // report "needs fibre composition" as if nothing had been entered.
  const halfDone = rows
    .map((r) => {
      const hasFibre = r.fibre && (r.fibre !== OTHER || r.other.trim());
      const hasPct = Number(r.pct) > 0;
      if (hasPct && !hasFibre) return `Choose a fibre for the ${trimPct(r.pct)}%.`;
      if (hasFibre && !hasPct) {
        return `Add a percentage for ${r.fibre === OTHER ? r.other : r.fibre}.`;
      }
      return null;
    })
    .filter((m): m is string => m !== null);

  return (
    <div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex gap-2">
            <Select
              value={row.fibre}
              disabled={locked}
              invalid={invalid}
              aria-label="Fibre"
              onChange={(e) => update(row.key, { fibre: e.target.value })}
              className="min-w-0 flex-1"
            >
              <option value="">Choose a fibre</option>
              {KINDS.map((kind) => (
                <optgroup key={kind} label={FIBRE_KIND_LABEL[kind]}>
                  {FIBRES.filter((f) => f.kind === kind).map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.name}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value={OTHER}>Other…</option>
            </Select>
            {row.fibre === OTHER && (
              <Input
                value={row.other}
                disabled={locked}
                placeholder="Fibre name"
                aria-label="Other fibre"
                onChange={(e) => update(row.key, { other: e.target.value })}
                className="min-w-0 flex-1"
              />
            )}
            <div className="relative w-24 shrink-0">
              <Input
                value={row.pct}
                disabled={locked}
                invalid={invalid}
                inputMode="decimal"
                placeholder="0"
                aria-label="Percent"
                onChange={(e) => update(row.key, { pct: cleanPct(e.target.value) })}
                className="pr-7 text-right"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-neutral-500">
                %
              </span>
            </div>
            {!locked && (
              <button
                type="button"
                onClick={() => remove(row.key)}
                aria-label="Remove this fibre"
                className="shrink-0 px-2 text-lg leading-none text-neutral-400 hover:text-neutral-900"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {!locked && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Button
            type="button"
            variant="secondary"
            size="small"
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
          >
            Add a fibre
          </Button>
          {rows.length > 1 && (
            <span
              className={`text-xs ${
                Math.abs(total - 100) > 0.5 ? "text-red-600" : "text-neutral-500"
              }`}
            >
              Adds up to {Math.round(total * 10) / 10}%
            </span>
          )}
        </div>
      )}

      {!locked && halfDone.length > 0 && (
        <p className="mt-2 text-xs text-red-600">{halfDone.join(" ")}</p>
      )}

      {legacy && (
        <p className="mt-2 text-xs text-neutral-500">
          Previously entered as “{legacy}”. Pick the fibres above to replace it.
        </p>
      )}
    </div>
  );
}
