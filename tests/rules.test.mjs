// Firestore rules tests. Run from the project root:
//   npm install --save-dev @firebase/rules-unit-testing firebase
//   npx firebase emulators:exec --only firestore "node tests/rules.test.mjs"
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, deleteField } from "firebase/firestore";

const env = await initializeTestEnvironment({ projectId: "pesatrack-test", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
const tx = (over = {}) => ({ id: "t1", description: "Naivas", amount: 100, type: "expense", category: "Groceries", date: "2026-11-01", createdAt: "2026-11-01T10:00:00Z", ...over });
let pass = 0, fail = 0;
const check = async (name, p) => { try { await p; pass++; console.log("  ok  ", name); } catch (e) { fail++; console.log("  FAIL", name, "\n      ", String(e.message).split("\n")[0]); } };

const alice = env.authenticatedContext("alice").firestore();
const bob = env.authenticatedContext("bob").firestore();
const anon = env.unauthenticatedContext().firestore();
const t = (db, uid, id = "t1") => doc(db, "users", uid, "transactions", id);

await check("owner can save a valid transaction", assertSucceeds(setDoc(t(alice, "alice"), tx())));
await check("other users cannot read it", assertFails(getDoc(t(bob, "alice"))));
await check("signed-out cannot read", assertFails(getDoc(t(anon, "alice"))));
await check("cannot write into someone else's space", assertFails(setDoc(t(bob, "alice", "t2"), tx({ id: "t2" }))));
await check("rejects negative amount", assertFails(setDoc(t(alice, "alice", "t3"), tx({ id: "t3", amount: -5 }))));
await check("rejects absurd amount", assertFails(setDoc(t(alice, "alice", "t4"), tx({ id: "t4", amount: 1e13 }))));
await check("rejects bad date", assertFails(setDoc(t(alice, "alice", "t5"), tx({ id: "t5", date: "tomorrow" }))));
await check("rejects 10k-character category", assertFails(setDoc(t(alice, "alice", "t6"), tx({ id: "t6", category: "x".repeat(10000) }))));
await check("rejects unknown field", assertFails(setDoc(t(alice, "alice", "t7"), tx({ id: "t7", evil: 1 }))));
await check("accepts orig with currency and amount", assertSucceeds(setDoc(t(alice, "alice", "t8"), tx({ id: "t8", orig: { currency: "USD", amount: 5 } }))));
await check("rejects orig with extra keys", assertFails(setDoc(t(alice, "alice", "t9"), tx({ id: "t9", orig: { currency: "USD", amount: 5, x: "<img>" } }))));

const s = (db, uid, name) => doc(db, "users", uid, "settings", name);
await check("budgets saved", assertSucceeds(setDoc(s(alice, "alice", "budgets"), { limits: { Food: 5000 }, updatedAt: "x" })));
await check("unknown settings doc refused", assertFails(setDoc(s(alice, "alice", "whatever"), { items: [] })));
await check("settings: more than 200 items refused", assertFails(setDoc(s(alice, "alice", "goals"), { items: Array.from({ length: 201 }, (_, i) => ({ i })) })));

const hh = (db, id = "h1") => doc(db, "households", id);
const base = { name: "Home", ownerId: "alice", inviteSecret: "a".repeat(24), createdAt: "x", members: { alice: { name: "A", role: "owner" } } };
await check("create household", assertSucceeds(setDoc(hh(alice), base)));
await check("non-member cannot read it", assertFails(getDoc(hh(bob))));
await check("wrong invite secret cannot join", assertFails(updateDoc(hh(bob), { "members.bob": { name: "B", role: "member" }, joinSecret: "nope" })));
await check("right invite secret can join", assertSucceeds(updateDoc(hh(bob), { "members.bob": { name: "B", role: "member" }, joinSecret: "a".repeat(24) })));
await check("member can read household transactions", assertSucceeds(setDoc(doc(bob, "households", "h1", "transactions", "t1"), tx())));
await check("owner cannot add unknown fields", assertFails(updateDoc(hh(alice), { evil: "<script>" })));
await check("owner can rotate the invite", assertSucceeds(updateDoc(hh(alice), { inviteSecret: "b".repeat(24), joinSecret: deleteField() })));
await check("owner cannot set a short invite secret", assertFails(updateDoc(hh(alice), { inviteSecret: "short" })));
await check("member cannot change the invite secret", assertFails(updateDoc(hh(bob), { inviteSecret: "c".repeat(24) })));
await check("everything else is denied", assertFails(setDoc(doc(alice, "other", "x"), { a: 1 })));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
