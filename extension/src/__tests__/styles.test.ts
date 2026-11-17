import { describe, it, expect } from "vitest";
import { DS, brutal, safetyColor } from "../styles";

describe("DS tokens", () => {
  it("has all required tokens", () => {
    expect(DS.bg).toBe("#181818");
    expect(DS.yellow).toBe("#f5e642");
    expect(DS.safe).toBe("#4cc38a");
    expect(DS.caution).toBe("#f59a3c");
    expect(DS.danger).toBe("#e5484d");
  });
});

describe("brutal()", () => {
  it("returns neobrutalism CSS with default yellow bg", () => {
    const css = brutal();
    expect(css).toContain("background:#f5e642");
    expect(css).toContain("border:2px solid #000");
    expect(css).toContain("box-shadow:3px 3px 0 #333");
    expect(css).toContain("border-radius:0");
  });

  it("accepts a custom background color", () => {
    expect(brutal("#4cc38a")).toContain("background:#4cc38a");
  });
});

describe("safetyColor()", () => {
  it("returns safe color for score >= 80", () => {
    expect(safetyColor(80)).toBe("#4cc38a");
    expect(safetyColor(95)).toBe("#4cc38a");
  });

  it("returns caution color for score 50-79", () => {
    expect(safetyColor(50)).toBe("#f59a3c");
    expect(safetyColor(75)).toBe("#f59a3c");
  });

  it("returns danger color for score < 50", () => {
    expect(safetyColor(49)).toBe("#e5484d");
    expect(safetyColor(0)).toBe("#e5484d");
  });
});
