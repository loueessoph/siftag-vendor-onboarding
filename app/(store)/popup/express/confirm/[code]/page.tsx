import { ConfirmClient } from "../confirm-client";

export const metadata = { title: "Your Order | Siftag Pop-Up", robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ code: string }>;
}

export default async function ExpressConfirmPage({ params }: Props) {
  const { code } = await params;

  return (
    <main className="bg-white">
      <div className="mx-auto max-w-md px-5 py-8">
        <p className="mb-6 text-xs tracking-widest text-gray-400">ORDER {code.toUpperCase()}</p>
        <ConfirmClient collectCode={code} />
      </div>
    </main>
  );
}
