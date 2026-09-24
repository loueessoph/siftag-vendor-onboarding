import Image from "next/image";
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
        <Image src="/SiftagLogo.png" alt="Siftag" width={72} height={23} priority className="w-[72px] h-auto" />
        <p className="text-xs text-neutral-400 mt-4 mb-6">Order {code.toUpperCase()}</p>
        <ConfirmClient collectCode={code} />
      </div>
    </main>
  );
}
