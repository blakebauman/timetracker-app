import { test, expect } from "@playwright/test";
import { localToInstant, localDayStart, nextLocalDate, isValidTimeZone } from "../src/worker/lib/local-time";

// The Assistant's tools take the time the user said — local wall-clock, no Z —
// and the worker converts it. The model used to do the UTC arithmetic and
// logged "yesterday 2pm" from UTC-7 at 06:00. Pure functions, exercised directly.
const LA = { timeZone: "America/Los_Angeles", offsetMinutes: 420 };

test("local wall-clock time converts in the user's zone", () => {
  expect(localToInstant("2026-10-08T14:00", LA)).toBe("2026-10-08T21:00:00.000Z");
  expect(localToInstant("2026-07-01T09:00", { timeZone: "Europe/London", offsetMinutes: -60 })).toBe(
    "2026-07-01T08:00:00.000Z"
  );
  expect(localToInstant("2026-10-08T14:00:30", LA)).toBe("2026-10-08T21:00:30.000Z");
});

test("the zone's own rules apply on the far side of a DST change", () => {
  // US clocks spring forward on 8 Mar 2026. Today's offset (PDT, 420) would put
  // a 9am in early March an hour out; the zone gets it right.
  expect(localToInstant("2026-03-06T09:00", LA)).toBe("2026-03-06T17:00:00.000Z");
  expect(localToInstant("2026-03-09T09:00", LA)).toBe("2026-03-09T16:00:00.000Z");
  // And falls back to the offset alone when no zone came with the turn.
  expect(localToInstant("2026-03-09T09:00", { offsetMinutes: 420 })).toBe("2026-03-09T16:00:00.000Z");
  expect(localToInstant("2026-10-08T14:00", { timeZone: "Not/AZone", offsetMinutes: 420 })).toBe(
    "2026-10-08T21:00:00.000Z"
  );
});

test("anything that isn't a real local time is refused, not guessed", () => {
  for (const bad of ["2026-02-30T10:00", "2026-10-08T24:00", "2026-10-08T14:60", "2026-10-08T14:00Z", "2026-10-08 14:00", "2pm"]) {
    expect(localToInstant(bad, LA), bad).toBeNull();
  }
});

test("local days: midnight in the zone, calendar-day arithmetic", () => {
  expect(localDayStart("2026-10-08", LA)).toBe("2026-10-08T07:00:00.000Z");
  expect(localDayStart("2026-10-8", LA)).toBeNull();
  expect(nextLocalDate("2026-10-31")).toBe("2026-11-01");
  expect(nextLocalDate("2026-12-31")).toBe("2027-01-01");
  expect(isValidTimeZone("America/Los_Angeles")).toBe(true);
  expect(isValidTimeZone("Not/AZone")).toBe(false);
  expect(isValidTimeZone(42)).toBe(false);
});
