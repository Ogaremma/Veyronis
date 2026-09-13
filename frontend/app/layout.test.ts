import { describe, expect, it } from "vitest";
import { metadata } from "./metadata";

describe("landing metadata", () => {
  it("defines premium social previews and branded icons", () => {
    expect(metadata.metadataBase?.href).toBe(
      "https://veyronis-proof.vercel.app/",
    );
    expect(metadata.title).toMatchObject({
      default: "Veyronis | Verified Escrow Settlement",
    });
    expect(metadata.openGraph?.images).toEqual([
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Veyronis verified escrow settlement preview",
      },
    ]);
    const twitter = metadata.twitter;
    expect(twitter && "card" in twitter ? twitter.card : undefined).toBe(
      "summary_large_image",
    );
    expect(metadata.icons).toEqual({ icon: "/icon.svg", apple: "/icon.svg" });
  });
});
