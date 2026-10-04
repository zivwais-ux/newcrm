// Realistic demo datasets with meaningful trends. Pure: same seed → same story.
//
// "Sparkle & Shine Cleaning" (service): recurring home clients with real return
// rhythms, office contracts, Airbnb hosts, occasional and one-off jobs; seasonal
// peaks before Passover and the autumn holidays, and a drop last month caused by
// a group of regulars who stopped booking — so "why is revenue down?" has a real answer.
//
// "Northwind Digital" (B2B sales): retainers and projects, a 7-stage pipeline with
// stalled deals and overdue closes, and leads from several channels.

import type { BusinessType } from "@/types/domain";

export interface DemoCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: "active" | "inactive" | "churned";
  created_at: string;
  custom_fields: Record<string, string>;
}
export interface DemoService {
  id: string;
  name: string;
  category: string;
  price: number;
}
export interface DemoTransaction {
  customer_id: string;
  service_id: string;
  product_or_service: string;
  amount: number;
  date: string;
  owner_name: string;
  status: "paid" | "pending" | "refunded";
  type: "sale" | "subscription" | "refund";
}
export interface DemoLead {
  name: string;
  email: string;
  phone: string;
  source: string;
  status: "new" | "contacted" | "qualified" | "converted" | "lost";
  value: number;
  created_at: string;
  custom_fields: Record<string, string>;
}
export interface DemoDeal {
  id: string;
  customer_id: string | null;
  name: string;
  stage: "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
  value: number;
  expected_close: string | null;
  last_activity_at: string;
  created_at: string;
  custom_fields: Record<string, string>;
}
export interface DemoActivity {
  customer_id: string | null;
  deal_id: string | null;
  type: "appointment" | "call" | "meeting" | "email" | "note" | "visit";
  date: string;
  notes: string;
}
export interface DemoTask {
  title: string;
  description: string | null;
  customer_id: string | null;
  deal_id: string | null;
  status: "open" | "done";
  due_date: string;
}
export interface DemoDataset {
  label: string;
  customers: DemoCustomer[];
  services: DemoService[];
  transactions: DemoTransaction[];
  leads: DemoLead[];
  deals: DemoDeal[];
  activities: DemoActivity[];
  tasks: DemoTask[];
}

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  constructor(private next: () => number) {}
  float() {
    return this.next();
  }
  int(min: number, max: number) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
  chance(p: number) {
    return this.next() < p;
  }
  normal(mean: number, sd: number) {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [item, w] of items) {
      r -= w;
      if (r <= 0) return item;
    }
    return items[items.length - 1][0];
  }
}

const uuid = () => globalThis.crypto.randomUUID();
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------
const FIRST = [
  "David", "Noa", "Yossi", "Maya", "Avi", "Shira", "Eitan", "Tamar", "Omer", "Yael", "Daniel", "Michal", "Itai", "Roni",
  "Lior", "Dana", "Amit", "Gal", "Ido", "Neta", "Yonatan", "Hila", "Tom", "Adi", "Oren", "Keren", "Uri", "Efrat", "Nadav",
  "Liat", "Asaf", "Inbar", "Guy", "Sivan", "Ariel", "Merav", "Ran", "Orit", "Elad", "Ayelet", "Rachel", "Sarah", "Ben",
  "Hannah", "Jacob", "Emily", "Nathan", "Sophie", "Ethan", "Olivia", "Matan", "Yarden", "Alon", "Moran", "Shai", "Chen",
] as const;
const LAST = [
  "Cohen", "Levi", "Mizrahi", "Peretz", "Biton", "Dahan", "Avraham", "Friedman", "Katz", "Azoulay", "Ben-David", "Shapiro",
  "Goldberg", "Rosen", "Halevi", "Malka", "Ohana", "Amar", "Sasson", "Hadad", "Gabay", "Barak", "Weiss", "Klein", "Stern",
  "Ashkenazi", "Navon", "Tal", "Golan", "Segal", "Carmi", "Ziv", "Nachum", "Elbaz", "Vaknin", "Sharabi", "Bar", "Oz", "Raz",
] as const;
const DOMAINS = ["gmail.com", "gmail.com", "gmail.com", "walla.co.il", "outlook.com", "yahoo.com", "hotmail.com"] as const;

function personFactory(rng: Rng) {
  const used = new Set<string>();
  return () => {
    let first: string, last: string, full: string;
    let tries = 0;
    do {
      first = rng.pick(FIRST);
      last = rng.pick(LAST);
      full = `${first} ${last}`;
      tries++;
    } while (used.has(full) && tries < 40);
    if (used.has(full)) full = `${first} ${last} ${rng.pick(["Jr.", "B.", "S.", "M."])}`;
    used.add(full);
    const local = rng.weighted([
      [`${first}.${last}`, 4],
      [`${first}${last[0]}`, 2],
      [`${first[0]}${last}`, 2],
      [`${first}${rng.int(10, 99)}`, 2],
    ] as const);
    const email = rng.chance(0.86) ? `${local.toLowerCase().replace(/[^a-z0-9.]/g, "")}@${rng.pick(DOMAINS)}` : null;
    const phone = rng.chance(0.93) ? `05${rng.pick(["0", "2", "3", "4", "8"])}-${rng.int(1000000, 9999999)}` : null;
    return { name: full, email, phone };
  };
}

// ---------------------------------------------------------------------------
// Seasonality (Israel): pre-Passover spring cleaning and the autumn holidays.
// ---------------------------------------------------------------------------
function seasonality(d: Date) {
  const m = d.getMonth();
  return [0.94, 0.97, 1.16, 1.2, 1.0, 0.97, 0.93, 0.93, 1.0, 1.04, 0.98, 1.04][m];
}

// ---------------------------------------------------------------------------
// Service business — Sparkle & Shine Cleaning
// ---------------------------------------------------------------------------
const CLEANING_SERVICES = [
  ["Standard Home Clean", "Home", 280],
  ["Deep Clean", "Home", 650],
  ["Move-in / Move-out Clean", "Home", 1200],
  ["Post-Renovation Clean", "Specialty", 1800],
  ["Window Cleaning", "Specialty", 350],
  ["Carpet & Upholstery", "Specialty", 480],
  ["Kitchen Deep Clean", "Home", 420],
  ["Fridge & Oven Add-on", "Add-on", 180],
  ["Balcony & Terrace", "Add-on", 260],
  ["Airbnb Turnover", "Short-term rentals", 320],
  ["Office Cleaning", "Business", 900],
  ["Monthly Office Contract", "Business", 2400],
] as const;
const CREW = ["Noa Peretz", "Avi Dahan", "Shira Malka", "Yossi Amar"] as const;
const OFFICES = [
  "Tel Aviv Dental Clinic", "Hertzel Law Office", "Bluefin Insurance", "Ramat Gan Physio", "Studio Orbit", "Kiryat Labs",
  "Shuk Coffee Roasters", "Gordon Accounting", "Neve Tzedek Architects", "Yafo Yoga Loft", "Lev Pediatrics", "Mint Coworking",
  "Carmel Real Estate", "Nordau Optics", "Pixel & Co.", "Herzliya Vet Center", "Arlozorov Pilates", "Bialik Design House",
  "Sela Logistics", "Oak Tree Kindergarten",
] as const;

export function generateServiceDataset(now = new Date(), seed = 7): DemoDataset {
  const rng = new Rng(mulberry32(seed));
  const person = personFactory(rng);
  const start = addDays(now, -540); // ~18 months of history
  const services: DemoService[] = CLEANING_SERVICES.map(([name, category, price]) => ({ id: uuid(), name, category, price }));
  const svc = (name: string) => services.find((s) => s.name === name)!;
  const customers: DemoCustomer[] = [];
  const transactions: DemoTransaction[] = [];
  const activities: DemoActivity[] = [];
  const tasks: DemoTask[] = [];

  // The "story": last full month's dip comes from regulars who booked the month
  // before and then stopped, plus softer demand from occasional customers.
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  function price(base: number) {
    return Math.max(80, Math.round(rng.normal(base, base * 0.08) / 10) * 10);
  }

  function addTx(customer: DemoCustomer, service: DemoService, date: Date, opts: Partial<DemoTransaction> = {}) {
    if (date > now) return;
    const status = rng.chance(0.012) ? "refunded" : date > addDays(now, -6) && rng.chance(0.3) ? "pending" : "paid";
    transactions.push({
      customer_id: customer.id,
      service_id: service.id,
      product_or_service: service.name,
      amount: price(service.price),
      date: iso(date),
      owner_name: rng.pick(CREW),
      status,
      type: status === "refunded" ? "refund" : "sale",
      ...opts,
    });
  }

  function newCustomer(joined: Date, extra: Partial<DemoCustomer> = {}): DemoCustomer {
    const p = person();
    const c: DemoCustomer = {
      id: uuid(),
      name: p.name,
      email: p.email,
      phone: p.phone,
      company: null,
      status: "active",
      created_at: joined.toISOString(),
      custom_fields: { city: rng.pick(["Tel Aviv", "Ramat Gan", "Givatayim", "Herzliya", "Holon", "Bat Yam", "Petah Tikva"]) },
      ...extra,
    };
    customers.push(c);
    return c;
  }

  /** Recurring customer with a natural rhythm; optional churn or lapse. */
  function recurring(count: number, intervalDays: number, main: string, addOns: string[], lapseShare: number) {
    for (let i = 0; i < count; i++) {
      const joined = addDays(start, rng.int(0, 470));
      const c = newCustomer(joined, { custom_fields: { segment: intervalDays <= 16 ? "Bi-weekly" : "Monthly" } });
      const lapses = rng.chance(lapseShare);
      const churnsEarly = !lapses && rng.chance(0.12);
      const stopAt = lapses
        ? addDays(lastMonthStart, -rng.int(3, 18))
        : churnsEarly
          ? addDays(joined, rng.int(90, 300))
          : now;
      const personalInterval = Math.max(7, Math.round(rng.normal(intervalDays, intervalDays * 0.12)));
      let d = joined;
      while (d <= stopAt && d <= now) {
        addTx(c, svc(main), d);
        if (addOns.length && rng.chance(0.18)) addTx(c, svc(rng.pick(addOns)), d);
        const jitter = rng.int(-2, 3);
        const seasonalPull = seasonality(d) > 1.1 && rng.chance(0.35) ? -Math.round(personalInterval * 0.3) : 0;
        d = addDays(d, Math.max(5, personalInterval + jitter + seasonalPull));
      }
      if (lapses || churnsEarly) c.status = churnsEarly ? "inactive" : "active";
      if (!lapses && !churnsEarly && rng.chance(0.35)) {
        activities.push({
          customer_id: c.id,
          deal_id: null,
          type: "appointment",
          date: addDays(now, rng.int(1, 14)).toISOString(),
          notes: `${main} — ${rng.pick(["morning slot", "afternoon slot", "keys with neighbour", "bring eco products", "pets at home"])}`,
        });
      }
    }
  }

  recurring(32, 14, "Standard Home Clean", ["Fridge & Oven Add-on", "Balcony & Terrace", "Window Cleaning"], 0.4);
  recurring(72, 30, "Standard Home Clean", ["Deep Clean", "Window Cleaning", "Kitchen Deep Clean", "Fridge & Oven Add-on"], 0.22);

  // Airbnb hosts — high frequency turnovers.
  for (let i = 0; i < 16; i++) {
    const joined = addDays(start, rng.int(0, 450));
    const c = newCustomer(joined, { custom_fields: { segment: "Airbnb host" } });
    const stop = rng.chance(0.15) ? addDays(joined, rng.int(60, 200)) : now;
    let d = joined;
    while (d <= stop) {
      if (rng.chance(0.85 * seasonality(d))) addTx(c, svc("Airbnb Turnover"), d);
      d = addDays(d, rng.int(6, 14));
    }
  }

  // Office contracts — monthly contract plus extra office cleans; two churned recently.
  OFFICES.forEach((company, i) => {
    const joined = addDays(start, rng.int(0, 420));
    const p = person();
    const c = newCustomer(joined, {
      name: p.name,
      company,
      email: `office@${company.toLowerCase().replace(/[^a-z]+/g, "")}.co.il`,
      custom_fields: { segment: "Office" },
    });
    const churnRecently = i < 2;
    const stop = churnRecently ? addDays(lastMonthStart, -rng.int(5, 15)) : now;
    let d = new Date(joined.getFullYear(), joined.getMonth(), rng.int(1, 5));
    while (d <= stop) {
      addTx(c, svc("Monthly Office Contract"), d, { type: "subscription" });
      if (rng.chance(0.3)) addTx(c, svc("Office Cleaning"), addDays(d, rng.int(8, 20)));
      if (rng.chance(0.08)) addTx(c, svc("Window Cleaning"), addDays(d, rng.int(3, 25)));
      d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
    if (churnRecently) c.status = "churned";
  });

  // Occasional customers — a few jobs a year, weighted toward holiday seasons.
  for (let i = 0; i < 200; i++) {
    const joined = addDays(start, rng.int(0, 520));
    const c = newCustomer(joined, { custom_fields: { segment: "Occasional" } });
    const jobs = rng.weighted([[2, 5], [3, 4], [4, 2], [5, 1]] as const);
    let d = joined;
    for (let j = 0; j < jobs && d <= now; j++) {
      const service = rng.weighted([
        ["Deep Clean", 5],
        ["Window Cleaning", 4],
        ["Carpet & Upholstery", 3],
        ["Kitchen Deep Clean", 2],
        ["Standard Home Clean", 3],
      ] as const);
      if (rng.chance(Math.min(1, seasonality(d)))) addTx(c, svc(service), d);
      d = addDays(d, rng.int(45, 160));
    }
  }

  // One-off jobs — move-outs and post-renovation, with a gentle growth trend.
  for (let i = 0; i < 205; i++) {
    const t = Math.pow(rng.float(), 0.8); // more recent jobs as the business grows
    const date = addDays(start, Math.floor(t * 535));
    const c = newCustomer(date, { custom_fields: { segment: "One-off" } });
    const service = rng.weighted([
      ["Move-in / Move-out Clean", 5],
      ["Post-Renovation Clean", 3],
      ["Deep Clean", 3],
      ["Carpet & Upholstery", 1],
    ] as const);
    addTx(c, svc(service), date);
  }

  // Past visit notes for a slice of customers.
  for (const c of customers.slice(0, 160)) {
    const theirTx = transactions.filter((t) => t.customer_id === c.id);
    const last = theirTx.at(-1);
    if (!last) continue;
    activities.push({
      customer_id: c.id,
      deal_id: null,
      type: rng.pick(["visit", "call", "note"] as const),
      date: new Date(`${last.date}T${String(rng.int(8, 17)).padStart(2, "0")}:00:00`).toISOString(),
      notes: rng.pick([
        "Customer very happy, asked about window cleaning next time",
        "Requested same crew next visit",
        "Left feedback: kitchen could be better — offered discount on next visit",
        "Asked to move to bi-weekly schedule",
        "Paid by bank transfer",
        "Has a new puppy — use pet-safe products",
      ]),
    });
  }

  // A few tasks — some already overdue.
  for (const c of customers.slice(200, 212)) {
    const overdue = rng.chance(0.5);
    tasks.push({
      title: rng.pick(["Call to schedule next clean", "Send quote for deep clean", "Follow up on feedback", "Confirm keys handover"]),
      description: null,
      customer_id: c.id,
      deal_id: null,
      status: rng.chance(0.25) ? "done" : "open",
      due_date: iso(addDays(now, overdue ? -rng.int(1, 9) : rng.int(1, 12))),
    });
  }

  // Softer demand last month from occasional jobs and short-term rentals.
  const segmentOf = new Map(customers.map((c) => [c.id, c.custom_fields.segment]));
  const lmFrom = iso(lastMonthStart);
  const lmTo = iso(lastMonthEnd);
  const kept = transactions.filter((t) => {
    if (t.date < lmFrom || t.date > lmTo) return true;
    const seg = segmentOf.get(t.customer_id);
    return !(seg === "Occasional" || seg === "Airbnb host" || t.product_or_service === "Window Cleaning") || rng.chance(0.62);
  });
  kept.sort((a, b) => a.date.localeCompare(b.date));
  return { label: "Sparkle & Shine Cleaning", customers, services, transactions: kept, leads: [], deals: [], activities, tasks };
}

// ---------------------------------------------------------------------------
// Sales business — Northwind Digital (B2B agency)
// ---------------------------------------------------------------------------
const B2B_SERVICES = [
  ["Website Build", "Projects", 38000],
  ["E-commerce Build", "Projects", 62000],
  ["Brand Strategy", "Projects", 18000],
  ["CRM Implementation", "Projects", 32000],
  ["SEO Retainer", "Retainers", 4500],
  ["Paid Ads Management", "Retainers", 6000],
  ["Support Plan", "Retainers", 1200],
  ["Content Package", "Retainers", 3500],
] as const;
const REPS = ["Dana Levi", "Omer Katz", "Michal Ben-David", "Eitan Shapiro"] as const;
const CO_PREFIX = [
  "Acme", "Blue Ocean", "Cedar", "Delta", "Echo", "Falcon", "Granite", "Harbor", "Ion", "Juniper", "Kite", "Lumen", "Maple",
  "Nova", "Orion", "Pine", "Quartz", "Ridge", "Summit", "Terra", "Umbra", "Vertex", "Willow", "Zenith", "Atlas", "Beacon",
  "Cobalt", "Dune", "Ember", "Fjord", "Galil", "Hermon", "Iris", "Jaffa", "Kinneret", "Negev", "Arava", "Golan", "Sharon",
] as const;
const CO_SUFFIX = ["Ltd", "Technologies", "Systems", "Group", "Labs", "Logistics", "Media", "Health", "Foods", "Capital", "Retail", "Energy"] as const;
const LEAD_SOURCES = [["Website", 5], ["Referral", 4], ["LinkedIn", 3], ["Google Ads", 3], ["Event", 1], ["Partner", 2]] as const;

export function generateSalesDataset(now = new Date(), seed = 11, scale = 1): DemoDataset {
  const rng = new Rng(mulberry32(seed));
  const person = personFactory(rng);
  const start = addDays(now, -540);
  const services: DemoService[] = B2B_SERVICES.map(([name, category, price]) => ({ id: uuid(), name, category, price }));
  const customers: DemoCustomer[] = [];
  const transactions: DemoTransaction[] = [];
  const deals: DemoDeal[] = [];
  const leads: DemoLead[] = [];
  const activities: DemoActivity[] = [];
  const tasks: DemoTask[] = [];
  const usedCompanies = new Set<string>();

  const company = () => {
    let name = "";
    for (let i = 0; i < 50; i++) {
      name = `${rng.pick(CO_PREFIX)} ${rng.pick(CO_SUFFIX)}`;
      if (!usedCompanies.has(name)) break;
    }
    if (usedCompanies.has(name)) name = `${name} ${rng.int(2, 9)}`;
    usedCompanies.add(name);
    return name;
  };
  const amount = (base: number) => Math.round(rng.normal(base, base * 0.15) / 100) * 100;

  const customerCount = Math.round(520 * scale);
  for (let i = 0; i < customerCount; i++) {
    const joined = addDays(start, Math.floor(Math.pow(rng.float(), 0.9) * 520));
    const co = company();
    const p = person();
    const domain = co.toLowerCase().replace(/[^a-z]+/g, "");
    const c: DemoCustomer = {
      id: uuid(),
      name: co,
      email: `${p.name.split(" ")[0].toLowerCase()}@${domain}.com`,
      phone: `0${rng.pick(["3", "9", "4", "8"])}-${rng.int(5000000, 9999999)}`,
      company: co,
      status: "active",
      created_at: joined.toISOString(),
      custom_fields: { contact: p.name, industry: rng.pick(["SaaS", "Retail", "Healthcare", "Logistics", "Finance", "Food", "Real estate"]) },
    };
    customers.push(c);
    const rep = rng.pick(REPS);

    const kind = rng.weighted([["retainer", 3], ["project", 5], ["both", 2]] as const);
    if (kind !== "retainer") {
      const s = rng.weighted([
        [services[0], 5],
        [services[1], 1],
        [services[2], 2],
        [services[3], 2],
      ] as const);
      const total = amount(s.price);
      const d1 = joined;
      const d2 = addDays(joined, rng.int(30, 75));
      transactions.push({ customer_id: c.id, service_id: s.id, product_or_service: s.name, amount: Math.round(total * 0.5), date: iso(d1), owner_name: rep, status: "paid", type: "sale" });
      if (d2 <= now)
        transactions.push({
          customer_id: c.id,
          service_id: s.id,
          product_or_service: s.name,
          amount: Math.round(total * 0.5),
          date: iso(d2),
          owner_name: rep,
          status: d2 > addDays(now, -20) && rng.chance(0.4) ? "pending" : "paid",
          type: "sale",
        });
    }
    if (kind !== "project" && rng.chance(0.55)) {
      const s = rng.pick([services[4], services[5], services[6], services[7]]);
      const monthly = amount(s.price);
      const churnAt = rng.chance(0.3) ? addDays(joined, rng.int(120, 400)) : now;
      let d = addDays(joined, rng.int(0, 30));
      while (d <= churnAt && d <= now) {
        transactions.push({ customer_id: c.id, service_id: s.id, product_or_service: s.name, amount: monthly, date: iso(d), owner_name: rep, status: "paid", type: "subscription" });
        d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
      }
      if (churnAt < now) c.status = "inactive";
    }
  }

  // Pipeline — realistic stage distribution, idle deals, overdue closes.
  const stageWeights = [["new", 8], ["contacted", 10], ["qualified", 10], ["proposal", 12], ["negotiation", 8], ["won", 14], ["lost", 8]] as const;
  const dealCount = Math.round(72 * scale);
  for (let i = 0; i < dealCount; i++) {
    const stage = rng.weighted(stageWeights);
    const existing = rng.chance(0.4) ? rng.pick(customers) : null;
    const co = existing?.name ?? company();
    const s = rng.weighted([[services[0], 4], [services[1], 1], [services[2], 2], [services[3], 2], [services[5], 2]] as const);
    const created = addDays(now, -rng.int(5, 120));
    const open = stage !== "won" && stage !== "lost";
    const idle = open ? rng.weighted([[rng.int(0, 6), 5], [rng.int(7, 13), 3], [rng.int(15, 45), 3]] as const) : rng.int(5, 60);
    const lastActivity = addDays(now, -Math.min(idle, Math.floor((now.getTime() - created.getTime()) / DAY)));
    const expected = open ? addDays(now, rng.weighted([[rng.int(5, 60), 7], [-rng.int(3, 25), 2]] as const)) : addDays(lastActivity, rng.int(-5, 5));
    const id = uuid();
    deals.push({
      id,
      customer_id: existing?.id ?? null,
      name: `${co} — ${s.name}`,
      stage,
      value: s.category === "Retainers" ? amount(s.price * 12) : amount(s.price),
      expected_close: iso(expected),
      last_activity_at: lastActivity.toISOString(),
      created_at: created.toISOString(),
      custom_fields: { owner_name: rng.pick(REPS) },
    });
    const touches = rng.int(1, 4);
    for (let t = 0; t < touches; t++) {
      const when = addDays(lastActivity, -t * rng.int(3, 9));
      if (when < created) break;
      activities.push({
        customer_id: existing?.id ?? null,
        deal_id: id,
        type: rng.pick(["call", "meeting", "email"] as const),
        date: when.toISOString(),
        notes: rng.pick([
          "Discovery call — main pain is lead tracking",
          "Sent proposal and timeline",
          "Pricing discussion, asked for phased payment",
          "Demo of previous work, positive feedback",
          "Waiting on legal review",
          "Introduced to CFO",
        ]),
      });
    }
    if (open && idle >= 15 && rng.chance(0.4)) {
      tasks.push({
        title: `Follow up with ${co}`,
        description: "No reply since the last meeting.",
        customer_id: existing?.id ?? null,
        deal_id: id,
        status: "open",
        due_date: iso(addDays(now, -rng.int(1, 6))),
      });
    }
  }

  const leadCount = Math.round(140 * scale);
  for (let i = 0; i < leadCount; i++) {
    const p = person();
    const co = company();
    const created = addDays(now, -Math.floor(Math.pow(rng.float(), 1.3) * 120));
    const age = (now.getTime() - created.getTime()) / DAY;
    const status = age < 4 ? "new" : rng.weighted([["new", 2], ["contacted", 4], ["qualified", 3], ["converted", 2], ["lost", 2]] as const);
    leads.push({
      name: p.name,
      email: `${p.name.split(" ")[0].toLowerCase()}@${co.toLowerCase().replace(/[^a-z]+/g, "")}.com`,
      phone: `05${rng.int(0, 8)}-${rng.int(1000000, 9999999)}`,
      source: rng.weighted(LEAD_SOURCES),
      status,
      value: Math.round(rng.normal(25000, 12000) / 1000) * 1000,
      created_at: created.toISOString(),
      custom_fields: { company: co, owner_name: rng.pick(REPS) },
    });
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));
  return { label: "Northwind Digital", customers, services, transactions, leads, deals, activities, tasks };
}

export function generateDemoDataset(type: BusinessType, now = new Date()): DemoDataset {
  if (type === "service") return generateServiceDataset(now);
  if (type === "sales") return generateSalesDataset(now);
  const service = generateServiceDataset(now);
  const sales = generateSalesDataset(now, 13, 0.35);
  // Combine: the service business also runs a sales pipeline for business clients.
  const deals = sales.deals.map((d) => ({ ...d, customer_id: null }));
  const activities = sales.activities.filter((a) => a.deal_id).map((a) => ({ ...a, customer_id: null }));
  const tasks = sales.tasks.map((t) => ({ ...t, customer_id: null }));
  return {
    label: service.label,
    customers: service.customers,
    services: service.services,
    transactions: service.transactions,
    leads: sales.leads,
    deals,
    activities: [...service.activities, ...activities],
    tasks: [...service.tasks, ...tasks],
  };
}
