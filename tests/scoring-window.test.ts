import assert from "node:assert/strict";
import { test } from "node:test";
import { getScoringWindow } from "../src/packages/scoring-window.js";

test("derives an inclusive calendar-month scoring window", () => {
  const cases = [
    {
      from: "2026-02-20",
      monthCount: 6,
      expected: { startDate: "2025-09-01", endDate: "2026-02-20" },
    },
    {
      from: "2026-02-20",
      monthCount: 3,
      expected: { startDate: "2025-12-01", endDate: "2026-02-20" },
    },
    {
      from: "2025-08-30",
      monthCount: 1,
      expected: { startDate: "2025-08-01", endDate: "2025-08-30" },
    },
    {
      from: "2026-01-15",
      monthCount: 3,
      expected: { startDate: "2025-11-01", endDate: "2026-01-15" },
    },
    {
      from: "2026-03-31",
      monthCount: 2,
      expected: { startDate: "2026-02-01", endDate: "2026-03-31" },
    },
  ];

  for (const { from, monthCount, expected } of cases) {
    assert.deepEqual(getScoringWindow(from, monthCount), expected);
  }
});

test("rejects an invalid month count", () => {
  assert.throws(
    () => getScoringWindow("2026-02-20", 0),
    new RangeError("monthCount must be a positive integer"),
  );
});
