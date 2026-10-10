import { test, expect } from "@playwright/test";
import { workDescription } from "@timetracker/core/entry-text";

// The Assistant's logTimeEntry drops a description that only restates the
// project: "log 1 hour to my cx coworker 365 project" became an entry on "CX
// Coworker for Microsoft 365 Copilot" described as "cx coworker 365".
const PROJECT = "CX Coworker for Microsoft 365 Copilot";

test("a description that only restates the project is dropped", () => {
  for (const d of ["cx coworker 365", "cx coworker 365 project", "my CX Coworker project", "CX Coworker for Microsoft 365 Copilot", "  ", "project"]) {
    expect(workDescription(d, ["cx coworker 365", PROJECT]), d).toBe("");
  }
});

test("real work survives, even when it names the project", () => {
  expect(workDescription("Workshop follow-up", [PROJECT])).toBe("Workshop follow-up");
  expect(workDescription("CX Coworker prompt review", [PROJECT])).toBe("CX Coworker prompt review");
  expect(workDescription(" Standup ", [null, undefined])).toBe("Standup");
});
