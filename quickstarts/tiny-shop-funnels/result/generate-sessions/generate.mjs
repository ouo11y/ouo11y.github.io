// Drives ~50 sessions through the running shop in headless Chromium, each one a real browser with
// the real SDK, so page views, custom events and replays reach ouo exactly as from people.
// Each session follows one persona; the script prints how many sessions should reach each funnel
// step, so you can check the funnel in Grafana against it.
//
//   npm install && npx playwright install chromium   # once
//   npm run generate                                 # SHOP_URL=http://localhost:5173 by default
import { chromium } from "playwright";

const SHOP = process.env.SHOP_URL || "http://localhost:5173";
const SESSIONS = Number(process.env.SESSIONS || 50);
const PARALLEL = Number(process.env.PARALLEL || 5);

// The funnel the README builds: / -> /products/* -> add_to_cart -> /checkout -> order_paid.
const STEPS = ["page:/", "page:/products/*", "event:add_to_cart", "page:/checkout", "event:order_paid"];

// Persona: weight (share of sessions), the funnel step it reaches (0: never enters) and what it does.
const PERSONAS = {
  bounce: { weight: 10, reaches: 1, run: async (s) => { await s.open("/"); } },
  // Lands on a product from a link, never sees the home page: not in the funnel (step 1 is /).
  deepLink: { weight: 10, reaches: 0, run: async (s) => { await s.open("/products/2"); await s.add(); await s.checkout(); await s.pay("4242"); } },
  // Adds to cart first and visits / afterwards: the order matters, so it only reaches step 1.
  outOfOrder: { weight: 6, reaches: 1, run: async (s) => { await s.open("/products/1"); await s.add(); await s.home(); } },
  browse: { weight: 18, reaches: 2, run: async (s) => { await s.open("/"); await s.product(); if (s.coin()) { await s.home(); await s.product(); } } },
  cart: { weight: 16, reaches: 3, run: async (s) => { await s.open("/"); await s.product(); await s.add(); if (s.coin()) await s.add(); } },
  abandon: { weight: 12, reaches: 4, run: async (s) => { await s.open("/"); await s.product(); await s.add(); await s.checkout(); } },
  declined: { weight: 8, reaches: 4, run: async (s) => { await s.open("/"); await s.product(); await s.add(); await s.checkout(); await s.pay("0002"); } },
  buyer: { weight: 20, reaches: 5, run: async (s) => { await s.open("/"); await s.product(); if (s.coin()) { await s.home(); await s.product(); } await s.add(); await s.checkout(); await s.pay("4242"); } },
};

// Deterministic: the same seed gives the same personas and pauses (Mulberry32).
let seed = Number(process.env.SEED || 7);
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pickPersonas(n) {
  // Largest remainder: the counts follow the weights exactly, then the order is shuffled.
  const names = Object.keys(PERSONAS);
  const total = names.reduce((s, k) => s + PERSONAS[k].weight, 0);
  const exact = names.map((k) => (PERSONAS[k].weight * n) / total);
  const counts = exact.map(Math.floor);
  const order = exact.map((x, i) => [x - counts[i], i]).sort((a, b) => b[0] - a[0]);
  for (let i = 0; counts.reduce((a, b) => a + b, 0) < n; i++) counts[order[i][1]]++;
  const list = names.flatMap((k, i) => Array(counts[i]).fill(k));
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const pause = (page, min, max) => page.waitForTimeout(min + rand() * (max - min));

function session(page) {
  const s = {
    coin: () => rand() < 0.5,
    open: async (path) => {
      await page.goto(SHOP + path);
      await page.waitForLoadState("networkidle");
      await pause(page, 300, 1500);
    },
    home: async () => {
      await page.getByRole("link", { name: "Tiny Shop" }).click();
      await pause(page, 300, 1200);
    },
    product: async () => {
      const links = page.locator("ul li a");
      await links.first().waitFor();
      await links.nth(Math.floor(rand() * (await links.count()))).click();
      await pause(page, 800, 4000); // reading the product page
    },
    add: async () => {
      await page.getByRole("button", { name: /Add to cart/ }).click();
      await pause(page, 300, 1500);
    },
    checkout: async () => {
      await page.getByTestId("cart-link").click();
      await pause(page, 300, 1200);
      await page.getByRole("button", { name: "Go to checkout" }).click();
      await pause(page, 1000, 5000); // finding the card
    },
    pay: async (card) => {
      await page.getByPlaceholder("card number").fill(`4000 0000 0000 ${card}`);
      await page.getByRole("button", { name: "Pay" }).click();
      await page.waitForLoadState("networkidle");
      await pause(page, 500, 1500);
    },
  };
  return s;
}

async function runOne(browser, persona, i) {
  const context = await browser.newContext(); // fresh storage: a new user and a new session
  const page = await context.newPage();
  try {
    await PERSONAS[persona].run(session(page));
    // Leaving the page flushes the SDK's last batch (pagehide) and ends the session.
    await page.goto("about:blank");
    await page.waitForTimeout(1000);
  } catch (err) {
    console.error(`session ${i} (${persona}) failed: ${err.message}`);
    return false;
  } finally {
    await context.close();
  }
  console.log(`session ${String(i + 1).padStart(2)} ${persona}`);
  return true;
}

const personas = pickPersonas(SESSIONS);
const browser = await chromium.launch();
const ok = [];
let next = 0;
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    while (next < personas.length) {
      const i = next++;
      if (await runOne(browser, personas[i], i)) ok.push(personas[i]);
    }
  })
);
await browser.close();

// The hand count: sessions reaching each step, from the personas that ran.
console.log(`\n${ok.length} sessions sent. Expected funnel ${STEPS.join(" -> ")}:`);
let prev;
STEPS.forEach((step, i) => {
  const n = ok.filter((p) => PERSONAS[p].reaches > i).length;
  const drop = prev === undefined ? "" : `   dropped ${prev - n}`;
  console.log(`  ${i + 1}. ${step.padEnd(20)} ${String(n).padStart(3)} sessions${drop}`);
  prev = n;
});
console.log(`  (not entered: ${ok.filter((p) => PERSONAS[p].reaches === 0).length} sessions that never opened /)`);
