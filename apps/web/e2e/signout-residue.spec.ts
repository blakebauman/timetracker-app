import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

// Signing out has to forget what this browser kept about the account: the
// IndexedDB timer snapshot and offline queue (entry text, project ids, queued
// request bodies) and the Assistant's persisted nudge state. No credential is
// stored client-side — this is about PII residue on a shared machine.
test("sign-out clears the offline stores and assistant state", async ({ page }) => {
  await signUp(page);

  // Put something in every store a signed-in session writes.
  await page.evaluate(async () => {
    const req = indexedDB.open("time-tracker", 1);
    const db = await new Promise<IDBDatabase>((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore("timer_state");
        d.createObjectStore("pending_mutations", { keyPath: "id", autoIncrement: true }).createIndex("by_created", "createdAt");
      };
    });
    const tx = db.transaction(["timer_state", "pending_mutations"], "readwrite");
    tx.objectStore("timer_state").put(
      { entryId: "e1", startedAt: Date.now(), description: "Client SENTINEL call", projectId: null, projectColor: null },
      "current",
    );
    tx.objectStore("pending_mutations").add({ method: "POST", url: "/api/time_entries", body: { description: "queued SENTINEL" }, createdAt: Date.now() });
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
    localStorage.setItem("time-tracker-assistant", JSON.stringify({ state: { dismissed: { "nudge:SENTINEL": 1 } }, version: 0 }));
  });

  // Sign out through the UI (the rail's account menu).
  await page.getByRole("button", { name: /account/i }).first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);

  const residue = await page.evaluate(async () => {
    const req = indexedDB.open("time-tracker", 1);
    const db = await new Promise<IDBDatabase>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    const tx = db.transaction(["timer_state", "pending_mutations"], "readonly");
    const timer = await new Promise<unknown>((res) => { const r = tx.objectStore("timer_state").get("current"); r.onsuccess = () => res(r.result); });
    const queued = await new Promise<number>((res) => { const r = tx.objectStore("pending_mutations").count(); r.onsuccess = () => res(r.result); });
    db.close();
    return { timer, queued, assistant: localStorage.getItem("time-tracker-assistant") };
  });
  expect(residue.timer).toBeUndefined();
  expect(residue.queued).toBe(0);
  expect(residue.assistant).toBeNull();
});
