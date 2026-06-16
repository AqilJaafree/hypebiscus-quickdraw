import { describe, test, expect } from "vitest";
import { parseEngagement } from "../tweet-context";

describe("parseEngagement", () => {
  test("parses K suffix", () => {
    expect(parseEngagement("4.2K")).toBeCloseTo(4200);
  });

  test("parses M suffix", () => {
    expect(parseEngagement("1.5M")).toBeCloseTo(1500000);
  });

  test("parses plain number", () => {
    expect(parseEngagement("123")).toBe(123);
  });

  test("returns null for empty string", () => {
    expect(parseEngagement("")).toBeNull();
  });

  test("returns null for invalid string", () => {
    expect(parseEngagement("abc")).toBeNull();
  });
});
