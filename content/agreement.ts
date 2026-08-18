/**
 * The vendor participation agreement, as rendered and signed in step 01.
 *
 * The clauses are the same for every brand. Four things vary — brand name,
 * participation fee, commission rate and the catalogue deadline — so they are
 * written as {{placeholders}} and filled from the brand's own record. That's
 * what `fee_gbp` and `commission_pct` are for: Nero's copy says £1,000 and
 * 20% without anyone maintaining a second document.
 *
 * `version` matters more than it looks. A signature is only defensible if you
 * can show exactly which words were on screen when it was given, so every
 * signature stores this string. Change any clause, change this.
 */

export type Clause = {
  n: string;
  heading: string;
  body: string[];
};

/** Per-brand values substituted into the text at render time. */
export type AgreementVars = {
  brandLegalName: string;
  feeGbp: number;
  depositGbp: number | null;
  balanceTerms: string | null;
  commissionPct: number;
  catalogueDeadline: string;
};

export const AGREEMENT_VERSION = "2026-08-18-siftag-fabricax-v2";

/**
 * Unresolved contradictions between this text and the rest of the operation.
 * While anything is listed here the signature control stays disabled — a
 * brand must not sign a contract that disagrees with what we're telling them
 * everywhere else.
 *
 * All three original entries are now resolved:
 *   - 4.1's deadline is generated from KEY_DATES, so it reads 4 September.
 *   - 2.1 is generated from the brand's actual terms, so the "one-day slot"
 *     wording is gone and a deposit arrangement is described properly.
 *   - 7.4 referenced clause 7.2 for "the materials", but 7.2 is the vendor's
 *     posting obligation and contains no materials; the licensed materials are
 *     described in 7.3. Corrected to 7.3 — revert if that wasn't the intent.
 */
export const AGREEMENT_BLOCKERS: string[] = [];

/**
 * Clause 2.1, written from the brand's real terms rather than typed by hand.
 * Siftag has charged flat fees, deposits with the balance taken out of sales,
 * and part-weekend rates; each needs a sentence that matches what was actually
 * agreed, and retyping that fourteen times is how a contract ends up wrong.
 */
export function paymentClause(vars: AgreementVars): string {
  const total = money(vars.feeGbp);

  if (vars.depositGbp == null || vars.depositGbp >= vars.feeGbp) {
    return `2.1 To reserve its place, the Vendor shall pay a participation fee of ${total} to Siftag. The place is held once cleared funds are received.`;
  }

  const deposit = money(vars.depositGbp);
  const balance = money(vars.feeGbp - vars.depositGbp);
  const settlement = vars.balanceTerms?.trim()
    ? vars.balanceTerms.trim().replace(/\.$/, "")
    : "payable to Siftag before the Event";

  return `2.1 To reserve its place, the Vendor shall pay a participation fee of ${total} to Siftag, of which ${deposit} is payable in advance and the remaining ${balance} is ${settlement}. The place is held once the advance payment is received in cleared funds.`;
}

function money(amount: number): string {
  return `GBP ${amount.toFixed(2)}`;
}

export const AGREEMENT_TITLE = "Vendor Participation Agreement";
export const AGREEMENT_SUBTITLE =
  "Siftag London Pop-Up at Fabrica X | 25 to 27 September 2026";

export const AGREEMENT_RECITALS = [
  "This Vendor Participation Agreement (Agreement) is made on {{signingDate}} between SIFTAG LTD, and {{brandLegalName}}.",
  "Siftag is organising a multi-brand natural fibre pop-up at Fabrica X, 36-40 York Way, London N1 9AB, from Friday 25 September 2026 to Sunday 27 September 2026, with set-up for Vendor on Thursday 24 September 2026 and pack-down by Monday 28 September 2026 (Event). The Vendor wishes to participate in the Event on the terms set out below.",
];

export const AGREEMENT_CLAUSES: Clause[] = [
  {
    n: "1",
    heading: "Appointment, term and event details",
    body: [
      "1.1 Siftag appoints the Vendor, and the Vendor accepts appointment, to participate in the Event for the Event period and for the associated pre-event and post-event logistics described in this Agreement.",
      "1.2 The Vendor's right to participate is personal to the Vendor and applies only to products approved by Siftag under clause 4. The Vendor may not assign, sub-license or share its space with another brand without Siftag's prior written consent.",
      "1.3 Siftag may issue a vendor pack, operational timetable and reasonable venue rules for the Event. Those operational materials will apply to the Vendor to the extent they are consistent with this Agreement.",
    ],
  },
  {
    n: "2",
    heading: "Fees, commission, card fees and payment",
    body: [
      // Generated from the brand's terms — see paymentClause().
      "{{paymentClause}}",
      "2.2 The participation fee is non-refundable once paid, except that Siftag shall refund the participation fee in full if Siftag cancels the Event and does not offer a rescheduled event that the Vendor accepts in writing.",
      "2.3 Siftag shall retain a commission equal to {{commissionPct}}% of gross sales of the Vendor's approved products sold through the Event sales system.",
      "2.4 Siftag may also deduct card processing fees actually incurred on the Vendor's sales. As at the date of this draft, the published rates are 1.4% plus GBP 0.10 per transaction for EEA cards and 2.9% plus GBP 0.10 per transaction for non-EEA cards.",
      "2.5 Within 14 days after the Event ends, Siftag shall provide the Vendor with a sales report and pay the Vendor the net sales proceeds, being gross sales less the commission, card processing fees, refunds or chargebacks properly attributable to the Vendor's goods, and any other deductions expressly permitted under this Agreement.",
      "2.6 All amounts in this Agreement are exclusive of VAT, if applicable. Where VAT is properly chargeable, it shall be payable in addition against a valid VAT invoice.",
    ],
  },
  {
    n: "3",
    heading: "Allocated space, venue fit-out and staffing",
    body: [
      "3.1 Siftag shall allocate the Vendor one stall space within the Event layout, together with access to the standard venue fit-out made available for participating brands, including rails, shelving and tables.",
      "3.2 Siftag may determine the overall layout, customer flow, signage standards and placement of each brand in its reasonable discretion, provided Siftag acts consistently across participating brands and does not materially reduce the Vendor's ability to trade.",
      "3.3 The Vendor is encouraged to have its own representative attend the Event, but attendance is not mandatory. If the Vendor does not attend, Siftag may staff the Vendor's space at no extra cost using reasonable efforts; however, the Vendor remains responsible for providing accurate product information, pricing and merchandising instructions.",
      "3.4 The Vendor shall comply with venue access times for set-up on 24 September 2026 and pack-down by 28 September 2026, together with any reasonable loading, security or health and safety procedures notified by Siftag.",
    ],
  },
  {
    n: "4",
    heading:
      "Catalogue submission, product approval and natural fibre requirement",
    body: [
      "4.1 The Vendor shall submit its full proposed Event catalogue to Siftag using the provided template no later than {{catalogueDeadline}}. The submission must include, for each item, a description, retail price, SKU or other identifier, and an accurate fibre composition breakdown.",
      "4.2 As a condition of approval, each item submitted for sale at the Event must contain at least 90% natural fibres by composition. Siftag may request supporting information or evidence for fibre content claims.",
      "4.3 Only products expressly approved by Siftag may be displayed or sold at the Event. Siftag may refuse or withdraw approval for any item that does not meet the natural fibre threshold, is inconsistent with the Event concept, is unsafe, is incorrectly labelled, or could reasonably expose Siftag or the venue to reputational or legal risk.",
      "4.4 The Vendor warrants that all product information supplied to Siftag is complete, accurate and not misleading, including any statements about composition, origin, sustainability, care, sizing, safety or compliance.",
    ],
  },
  {
    n: "5",
    heading: "Stock, delivery, storage, shipping and returns",
    body: [
      "5.1 The Vendor may send stock to the venue ahead of the Event in accordance with delivery instructions issued by Siftag. Unless otherwise agreed in writing, the Vendor is responsible for the cost, packing, insurance and transport risk of all inbound and outbound shipments unless noted otherwise.",
      "5.2 Title to and risk in the Vendor's stock remain with the Vendor at all times, except that risk in sold goods passes to the customer on completion of the relevant sale. Nothing in this Agreement transfers ownership of unsold stock to Siftag.",
      "5.3 Siftag shall use reasonable care while receiving, handling and storing the Vendor's stock that is in Siftag's physical control, but Siftag is not an insurer of that stock and is not liable for loss, theft or damage except to the extent caused by Siftag's negligence or wilful misconduct.",
      "5.4 The Vendor shall remove or arrange collection of unsold stock promptly after the Event, or authorise Siftag in writing to return it using a courier service at the Vendor's cost and risk unless otherwise noted.",
      "5.5 Customer returns and refunds shall be handled in accordance with clause 6.5. If goods must be repaired, replaced, collected or returned because they are faulty, unsafe, misdescribed or otherwise non-compliant, the Vendor shall bear the associated cost.",
    ],
  },
  {
    n: "6",
    heading: "Sales handling, customer transactions and refund position",
    body: [
      "6.1 Siftag will operate one central till and payments system for the Event so that customers may buy products from multiple brands in one transaction.",
      "6.2 The Vendor appoints Siftag as its limited agent solely to process in-person customer transactions for approved products during the Event, collect payment, issue receipts, and administer refunds or chargebacks in accordance with this Agreement.",
      "6.3 The Vendor remains responsible for the quality, safety, legality, description and fitness for sale of its products and for honouring all mandatory consumer rights attaching to those products.",
      "6.4 Siftag shall provide the Vendor with a reasonable post-Event sales breakdown showing the products sold and the resulting net sums due.",
      "6.5 Event sales are intended to be final, except where a customer is entitled to a repair, replacement, refund or other remedy under applicable law, including where goods are faulty, unsafe or not as described. Siftag may process such remedies through the central till, and the resulting amount may be deducted from sums otherwise due to the Vendor.",
      "6.6 If a chargeback, refund or customer complaint arises from incorrect pricing data, inaccurate product information, product defect, unsafe goods or other Vendor-caused issue, the Vendor shall reimburse Siftag on demand for the resulting amount and any reasonable directly related administrative costs.",
    ],
  },
  {
    n: "7",
    heading: "Branding, merchandising and marketing permissions",
    body: [
      "7.1 The Vendor may display printed branding materials, such as posters or printed signage, within its allocated space, subject to Siftag's reasonable approval and any venue restrictions. Video displays, monitors and other screen-based installations are not permitted without Siftag's prior written consent.",
      "7.2 The Vendor shall make reasonable good-faith promotional support available for the Event on its own social media channels. At a minimum, the Vendor shall publish at least 3 posts or story announcing its participation in the Event leading up to the Event, and shall use reasonable efforts to share or repost agreed collaborative social media content prepared with Siftag, provided Siftag gives the Vendor sufficient lead time and supplies the relevant assets or posting brief.",
      "7.3 Siftag may use the Vendor's name, logo, approved product images and short descriptive copy to promote the Event before, during and after the Event across Siftag's marketing channels, including social media, email, website and platform features, provided that Siftag does not materially alter the Vendor's branding in a misleading way.",
      // Was "clause 7.2" in the Google Doc. 7.2 is the vendor's posting
      // obligation and describes no materials; the licensed materials are in
      // 7.3, so the cross-reference is corrected here.
      "7.4 The Vendor grants Siftag a non-exclusive, royalty-free licence for the term of this Agreement and for 12 months afterwards to use the materials described in clause 7.3 for Event-related promotion and recap content.",
      "7.5 Each party retains ownership of its pre-existing intellectual property. Neither party acquires ownership of the other's trade marks, logos, photographs, copy or other materials except for the limited rights expressly granted in this Agreement.",
    ],
  },
  {
    n: "8",
    heading: "Vendor obligations and legal compliance",
    body: [
      "8.1 The Vendor shall ensure that all products and sales practices comply with applicable law, including consumer protection, product safety, labelling, textiles composition, advertising, sanctions, employment and tax law to the extent relevant to the Vendor's participation.",
      "8.2 The Vendor is responsible for setting lawful retail prices, maintaining adequate stock records, and ensuring that any claims about sustainability, fibre content, origin, care or performance are substantiated.",
      "8.3 The Vendor shall maintain all licences, registrations, authorisations and insurance reasonably appropriate for its business and the goods it is offering. If Siftag reasonably requests evidence of insurance or compliance documents relevant to the Event, the Vendor shall provide them promptly.",
      "8.4 The Vendor shall not sell counterfeit goods, prohibited items, hazardous products not suitable for retail sale, or items that infringe any third-party intellectual property rights.",
    ],
  },
  {
    n: "9",
    heading: "Cancellation, postponement and force majeure",
    body: [
      "9.1 If the Vendor withdraws from the Event after paying the participation fee, the participation fee remains non-refundable. Siftag may, in its discretion, offer a credit, replacement vendor arrangement or partial refund if Siftag is able to refill the place without loss, but it is not obliged to do so.",
      "9.2 Siftag may cancel or postpone the Event where reasonably necessary, including because of venue issues, safety concerns, force majeure, insufficient participation or circumstances outside Siftag's reasonable control. If Siftag cancels and does not reschedule the Event on terms accepted by the Vendor, Siftag's sole obligation is to refund the participation fee already paid.",
      "9.3 Neither party is liable for failure or delay caused by events beyond its reasonable control, provided it notifies the other party promptly and uses reasonable efforts to mitigate the effect.",
    ],
  },
  {
    n: "10",
    heading: "Liability and indemnities",
    body: [
      "10.1 Nothing in this Agreement limits or excludes liability for death or personal injury caused by negligence, fraud or fraudulent misrepresentation, or any other liability that cannot lawfully be limited or excluded.",
      "10.2 Subject to clause 10.1, Siftag's aggregate liability arising out of or in connection with this Agreement shall not exceed the total of (a) the participation fee actually paid by the Vendor; and (b) any net sales proceeds actually collected by Siftag for the Vendor but not yet remitted.",
      "10.3 Subject to clause 10.1, neither party is liable to the other for loss of profit, loss of opportunity, loss of goodwill or indirect or consequential loss arising out of this Agreement.",
      "10.4 The Vendor shall indemnify Siftag and the venue operator against third-party claims, losses, damages, costs and expenses arising from (a) product defect or safety issue; (b) inaccurate product descriptions or unlawful claims; (c) breach of clause 4 or clause 8; or (d) infringement of third-party intellectual property rights by the Vendor's products or materials, except to the extent the claim is caused by Siftag's negligence, wilful misconduct or unauthorised alteration of the Vendor's materials.",
      "10.5 The Vendor is responsible for insuring its stock, equipment and participation risks to the extent it considers appropriate for the value and nature of its business and goods.",
    ],
  },
  {
    n: "11",
    heading: "Data, records and audit trail",
    body: [
      "11.1 Siftag may hold and process business contact details, sales records and operational information relating to the Vendor for the purposes of administering the Event, paying out sales proceeds, handling customer issues and promoting the Event.",
      "11.2 Each party shall handle any personal data it receives under or in connection with this Agreement in accordance with applicable data protection law.",
    ],
  },
  {
    n: "12",
    heading: "General",
    body: [
      "12.1 This Agreement constitutes the entire agreement between the parties in relation to the Vendor's participation in the Event and supersedes any prior discussions on that subject.",
      "12.2 Any variation to this Agreement must be in writing and signed or otherwise clearly approved in writing by both parties.",
      "12.3 If any provision of this Agreement is held invalid or unenforceable, the remaining provisions shall continue in full force and effect.",
      "12.4 A person who is not a party to this Agreement has no right to enforce any term of this Agreement except where that right is expressly stated.",
      "12.5 Notices under this Agreement shall be sent to the contact names and email addresses set out in section 13, or to any replacement contact details notified in writing.",
      "12.6 This Agreement and any non-contractual obligations arising out of or in connection with it shall be governed by the laws of England and Wales, and the courts of England and Wales shall have exclusive jurisdiction.",
    ],
  },
];

/** Siftag's side of section 13, the same on every copy. */
export const SIFTAG_SIGNATORY = {
  entity: "SIFTAG LTD",
  name: "Richael Saka",
  title: "Co-founder @ Siftag",
  email: "brands@siftag.com",
  date: "14/08/2026",
};

/** Fills the {{placeholders}} for one brand. */
export function fill(text: string, vars: AgreementVars): string {
  return text
    .replaceAll("{{paymentClause}}", paymentClause(vars))
    .replaceAll("{{brandLegalName}}", vars.brandLegalName)
    .replaceAll("{{feeAmount}}", money(vars.feeGbp))
    .replaceAll("{{commissionPct}}", String(vars.commissionPct))
    .replaceAll("{{catalogueDeadline}}", vars.catalogueDeadline)
    .replaceAll("{{signingDate}}", "the date of signature below");
}
