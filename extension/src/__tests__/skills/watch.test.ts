import { describe, it, expect } from "vitest";
import { watchlistAdd, watchlistRemove, watchlistContains } from "../../skills/watch";
import type { WatchItem } from "../../types";

const SOL: WatchItem = { mint: "So11111111111111111111111111111111111111112", ticker: "SOL" };
const JTO: WatchItem = { mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", ticker: "JTO" };

describe("watchlistAdd()", () => {
  it("adds a new item to an empty watchlist", () => {
    const result = watchlistAdd([], SOL);
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe("SOL");
  });

  it("does not add duplicate mints", () => {
    const result = watchlistAdd([SOL], SOL);
    expect(result).toHaveLength(1);
  });

  it("adds a second distinct item", () => {
    const result = watchlistAdd([SOL], JTO);
    expect(result).toHaveLength(2);
    expect(result[1].ticker).toBe("JTO");
  });

  it("does not mutate the original list", () => {
    const original = [SOL];
    watchlistAdd(original, JTO);
    expect(original).toHaveLength(1);
  });
});

describe("watchlistRemove()", () => {
  it("removes an item by mint address", () => {
    const result = watchlistRemove([SOL, JTO], SOL.mint);
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe("JTO");
  });

  it("returns unchanged list if mint not found", () => {
    const result = watchlistRemove([SOL], "nonexistent_mint");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(SOL);
  });

  it("does not mutate the original list", () => {
    const original = [SOL, JTO];
    watchlistRemove(original, SOL.mint);
    expect(original).toHaveLength(2);
  });
});

describe("watchlistContains()", () => {
  it("returns true when mint is in the list", () => {
    expect(watchlistContains([SOL, JTO], SOL.mint)).toBe(true);
  });

  it("returns false when mint is not in the list", () => {
    expect(watchlistContains([SOL], JTO.mint)).toBe(false);
  });

  it("returns false for empty list", () => {
    expect(watchlistContains([], SOL.mint)).toBe(false);
  });
});
