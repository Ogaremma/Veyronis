import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://veyronis-proof.vercel.app",
  ),
  title: {
    default: "Veyronis | Verified Escrow Settlement",
    template: "%s | Veyronis",
  },
  description:
    "Veyronis pairs premium escrow workflows with Attestcoin/Creditcoin blockchain verification and authorized on-chain settlement.",
  applicationName: "Veyronis",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Veyronis",
    title: "Veyronis | Verified Escrow Settlement",
    description:
      "Buyer-funded escrow, verified blockchain conditions, authorized settlement, and explicit seller withdrawal.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Veyronis verified escrow settlement preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Veyronis | Verified Escrow Settlement",
    description:
      "Blockchain-verified conditions settle through the authorized Veyronis registry path.",
    images: ["/opengraph-image"],
  },
};
