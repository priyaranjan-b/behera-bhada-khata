import { describe, expect, it } from "vitest";
import { amountInWords } from "./money";

describe("amountInWords", () => {
  it.each([
    [0, "Rupees Zero Only"],
    [1, "Rupees One Only"],
    [15, "Rupees Fifteen Only"],
    [1745, "Rupees One Thousand Seven Hundred Forty Five Only"],
    [100000, "Rupees One Lakh Only"],
    [1234567.5, "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Fifty Paise Only"],
    [123456789, "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only"],
    [0.05, "Five Paise Only"],
    [-250, "Rupees Two Hundred Fifty Only"],
    ["5000.00", "Rupees Five Thousand Only"],
  ])("%s", (value, words) => {
    expect(amountInWords(value)).toBe(words);
  });
});
