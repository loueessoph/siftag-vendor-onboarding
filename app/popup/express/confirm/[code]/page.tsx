import { ConfirmClient } from "../confirm-client";

export const metadata = { title: "Your Order | Siftag Pop-Up", robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ code: string }>;
}

export default async function ExpressConfirmPage({ params }: Props) {
  const { code } = await params;

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-md px-5 py-8">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Siftag Pop-Up</p>
        <p className="text-xs text-neutral-400 mb-6">Order {code.toUpperCase()}</p>
        <ConfirmClient collectCode={code} />
      </div>
    </main>
  );
}
