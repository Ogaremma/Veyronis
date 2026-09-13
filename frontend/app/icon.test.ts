import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Veyronis favicon", () => {
  it("includes the local blue V mark at the app icon route", () => {
    expect(existsSync(path.resolve(process.cwd(), "app", "icon.svg"))).toBe(true);
  });
});
