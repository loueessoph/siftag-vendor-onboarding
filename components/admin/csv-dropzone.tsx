"use client";

import { useRef, useState } from "react";

/**
 * For brands that aren't on Shopify. The file rides along with the brand form
 * and is parsed after the brand exists, so there is one screen to fill in
 * rather than a create-then-upload two-step.
 */
export function CsvDropzone() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);

  function take(list: FileList | null) {
    const picked = list?.[0];
    if (!picked) return;
    setFile(picked);
    if (input.current) {
      // Keep the real input in sync so the file posts with the form.
      const data = new DataTransfer();
      data.items.add(picked);
      input.current.files = data.files;
    }
  }

  return (
    <div>
      <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
        Or upload a catalogue CSV
      </span>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        className={`mt-1.5 cursor-pointer border border-dashed px-6 py-8 text-center transition-colors ${
          over ? "border-neutral-900 bg-neutral-50" : "border-neutral-300"
        }`}
      >
        <input
          ref={input}
          type="file"
          name="catalogue_csv"
          accept=".csv,text/csv"
          onChange={(e) => take(e.target.files)}
          className="hidden"
        />
        <p className="text-sm text-neutral-900">
          {file ? file.name : "Drop a CSV here, or click to choose"}
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Columns: title, sku, size, colour, price, image_url
        </p>
      </div>
    </div>
  );
}
