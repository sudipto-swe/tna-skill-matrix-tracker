/**
 * Seed script — Training Needs Analysis & Skill Matrix Tracker
 * ------------------------------------------------------------
 * Generates a complete SYNTHETIC manufacturing workforce dataset.
 * This is a portfolio simulation: no real persons or companies are represented.
 *
 * Run: bun prisma/seed.ts   (or: bun run db:seed)
 *
 * Deterministic: uses a seeded PRNG so every run produces the same dataset.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

// ── deterministic PRNG ────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20240614);
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const rint = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const chance = (p: number) => rnd() < p;
const pad = (n: number, w = 4) => String(n).padStart(w, "0");

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const addMonths = (d: Date, n: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
};
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

// ── synthetic name pool (clearly synthetic demo names) ───────────────────────
const maleFirst = [
  "Rafiqul", "Mahmudul", "Shafiqul", "Jahangir", "Mizanur", "Anwar", "Ashraful", "Nazmul",
  "Tanvir", "Imran", "Arif", "Hasib", "Rashed", "Mamun", "Shahin", "Jewel", "Sumon", "Rubel",
  "Nasir", "Farid", "Habibur", "Delwar", "Moniruzzaman", "Tariqul", "Saiful", "Alamin",
  "Sohel", "Rana", "Nayeem", "Faisal", "Zubair", "Mahbub", "Kamrul", "Shohag", "Elias",
  "Golam", "Khurshid", "Babul", "Dulal", "Aminul", "Shahjahan", "Mostafizur", "Rakibul",
  "Jahid", "Masud", "Giasuddin", "Anisur", "Shafiq", "Torikul", "Nurul", "Iqbal", "Liton",
  "Prodip", "Sanjib", "Touhid", "Wahid", "Yousuf", "Zahid", "Ahsan", "Rezaul",
];
const femaleFirst = [
  "Nusrat", "Fatema", "Sumaiya", "Shamima", "Rokeya", "Nasrin", "Shahnaz", "Farzana",
  "Shirin", "Sabina", "Jebin", "Antora", "Mahua", "Rahima", "Selina", "Taslima", "Anika",
  "Sadia", "Mitu", "Ruma", "Shefali", "Nazmun", "Lubna", "Ishrat", "Moushumi", "Dilruba",
];
const maleLast = [
  "Islam", "Rahman", "Hossain", "Ahmed", "Chowdhury", "Alam", "Khan", "Sheikh", "Uddin",
  "Haque", "Mia", "Talukder", "Sarkar", "Zaman", "Morshed", "Siddique", "Kabir", "Bhuiyan",
];
const femaleLast = ["Akter", "Begum", "Sultana", "Khatun", "Islam", "Chowdhury", "Rahman", "Haq"];
const usedNames = new Set<string>();
function synthName(): string {
  for (let i = 0; i < 200; i++) {
    const female = chance(0.3);
    const first = female ? pick(femaleFirst) : pick(maleFirst);
    const last = female ? pick(femaleLast) : pick(maleLast);
    const prefix = !female && chance(0.45) ? (chance(0.6) ? "Md. " : "Mohammad ") : "";
    const name = `${prefix}${first} ${last}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  const fallback = `Employee ${usedNames.size + 1}`;
  usedNames.add(fallback);
  return fallback;
}

// ── permissions & roles ──────────────────────────────────────────────────────
const ALL_PERMISSIONS = [
  "dashboard:view",
  "employees:read:all", "employees:read:dept", "employees:read:self", "employees:write",
  "competencies:read", "competencies:write", "rolerequirements:write",
  "assessments:read:all", "assessments:read:dept", "assessments:read:self", "assessments:write",
  "skillmatrix:read:all", "skillmatrix:read:dept",
  "tna:read:all", "tna:read:dept", "tna:read:self",
  "training:read", "training:write",
  "attendance:read", "attendance:write",
  "qualifications:read:all", "qualifications:read:dept", "qualifications:read:self", "qualifications:write",
  "reports:generate", "import:execute",
  "users:manage", "audit:read",
  "settings:read", "settings:write",
  "notifications:read",
];

const ROLE_SEED = [
  {
    code: "administrator",
    name: "Administrator",
    description: "Full system access: users, framework configuration, data, reports.",
    permissions: ALL_PERMISSIONS,
  },
  {
    code: "training_officer",
    name: "Training Officer",
    description: "Conducts TNA, manages training programs, sessions, attendance and reports.",
    permissions: [
      "dashboard:view", "employees:read:all", "competencies:read",
      "assessments:read:all", "assessments:write", "skillmatrix:read:all", "tna:read:all",
      "training:read", "training:write", "attendance:read", "attendance:write",
      "qualifications:read:all", "qualifications:write", "reports:generate", "import:execute",
      "notifications:read", "settings:read",
    ],
  },
  {
    code: "department_supervisor",
    name: "Department Supervisor",
    description: "Manages competency of own department: assessments, matrix, TNA review.",
    permissions: [
      "dashboard:view", "employees:read:dept", "competencies:read",
      "assessments:read:dept", "assessments:write", "skillmatrix:read:dept", "tna:read:dept",
      "training:read", "attendance:read", "qualifications:read:dept", "reports:generate",
      "notifications:read", "settings:read",
    ],
  },
  {
    code: "employee",
    name: "Employee",
    description: "Self-service: personal competency profile, training and qualifications.",
    permissions: [
      "dashboard:view", "employees:read:self", "competencies:read",
      "assessments:read:self", "tna:read:self", "training:read", "qualifications:read:self",
      "notifications:read", "settings:read",
    ],
  },
];

// ── departments & production areas ───────────────────────────────────────────
const DEPT_SEED = [
  { code: "PRD", name: "Production", description: "Primary manufacturing: making, packing and blend preparation." },
  { code: "QAS", name: "Quality Assurance", description: "Laboratory testing, in-process control and finished goods release." },
  { code: "ENG", name: "Engineering", description: "Process engineering and utilities (boiler, compressor, HVAC)." },
  { code: "MNT", name: "Maintenance", description: "Mechanical, electrical and automation maintenance." },
  { code: "WHS", name: "Warehouse", description: "Raw material and finished goods stores, material handling." },
  { code: "SCM", name: "Supply Chain", description: "Receiving, planning and scheduling." },
  { code: "EHS", name: "EHS", description: "Environment, Health & Safety; emergency preparedness." },
  { code: "HRD", name: "Human Resources", description: "HR operations and Learning & Development." },
];

const AREA_SEED: Record<string, { code: string; name: string }[]> = {
  PRD: [
    { code: "PRD-MK1", name: "Making Line 1" },
    { code: "PRD-MK2", name: "Making Line 2" },
    { code: "PRD-PK1", name: "Packing Line 1" },
    { code: "PRD-PK2", name: "Packing Line 2" },
    { code: "PRD-BLD", name: "Blend Preparation" },
  ],
  QAS: [
    { code: "QAS-LAB", name: "Testing Laboratory" },
    { code: "QAS-IPC", name: "In-Process Control" },
    { code: "QAS-FGI", name: "Finished Goods Inspection" },
  ],
  ENG: [
    { code: "ENG-PRC", name: "Process Engineering" },
    { code: "ENG-UTL", name: "Utilities" },
  ],
  MNT: [
    { code: "MNT-MEC", name: "Mechanical Workshop" },
    { code: "MNT-ELE", name: "Electrical & Automation" },
  ],
  WHS: [
    { code: "WHS-RMS", name: "Raw Material Store" },
    { code: "WHS-FGS", name: "Finished Goods Store" },
  ],
  SCM: [
    { code: "SCM-RCV", name: "Receiving Dock" },
    { code: "SCM-PLN", name: "Planning Office" },
  ],
  EHS: [{ code: "EHS-OFC", name: "EHS Office (Plant-wide)" }],
  HRD: [{ code: "HRD-ADM", name: "Administration & Training" }],
};

// ── competencies (28) ────────────────────────────────────────────────────────
type CompSeed = {
  code: string; name: string; category: string; dept: string | null;
  baseline: number; freq: number; validity: number; safety: boolean; mandatory: boolean;
  description: string; criteria: string;
};
const COMPETENCY_SEED: CompSeed[] = [
  { code: "C-001", name: "Machine Operation – Making", category: "Technical", dept: "PRD", baseline: 3, freq: 12, validity: 24, safety: false, mandatory: false,
    description: "Safe and efficient operation of cigarette making machines, including start-up, changeover, routine adjustments and shutdown.",
    criteria: "Demonstrates start-up/shutdown sequence, rod quality checks, waste control and emergency stop procedure under observation." },
  { code: "C-002", name: "Machine Operation – Packing", category: "Technical", dept: "PRD", baseline: 3, freq: 12, validity: 24, safety: false, mandatory: false,
    description: "Operation of packing machines: film wrapping, cartoning, coding and case packing with quality verification.",
    criteria: "Executes format changeover, clears jams safely, verifies coding and seal integrity per SOP." },
  { code: "C-003", name: "Blend Preparation & Recipe Handling", category: "Technical", dept: "PRD", baseline: 3, freq: 12, validity: 24, safety: false, mandatory: false,
    description: "Accurate blending of leaf materials per recipe, flavour application and blend hygiene control.",
    criteria: "Follows blend recipe within tolerance, maintains traceability records and prevents cross-contamination." },
  { code: "C-004", name: "Quality Inspection & Testing", category: "Quality", dept: "QAS", baseline: 3, freq: 12, validity: 24, safety: false, mandatory: false,
    description: "Physical and sensory inspection of products against specifications; sampling plans and defect classification.",
    criteria: "Applies sampling plan, uses calibrated gauges, classifies defects and documents results correctly." },
  { code: "C-005", name: "Laboratory Instrumentation", category: "Quality", dept: "QAS", baseline: 3, freq: 12, validity: 24, safety: false, mandatory: false,
    description: "Operation and basic care of laboratory instruments; test method execution and result recording.",
    criteria: "Prepares samples, runs test methods per SOP, performs daily verification and logs results in LIMS/register." },
  { code: "C-006", name: "Statistical Process Control (SPC)", category: "Quality", dept: "QAS", baseline: 2, freq: 12, validity: 36, safety: false, mandatory: false,
    description: "Use of control charts, capability indices and data analysis to monitor process stability.",
    criteria: "Plots control charts, interprets out-of-control signals and initiates containment actions." },
  { code: "C-007", name: "Defect Identification & Classification", category: "Quality", dept: null, baseline: 2, freq: 12, validity: 24, safety: false, mandatory: false,
    description: "Recognition and correct classification of product and process defects at point of manufacture.",
    criteria: "Identifies common defect modes, classifies per defect catalogue and segregates non-conforming product." },
  { code: "C-008", name: "Basic Troubleshooting – Mechanical", category: "Technical", dept: "MNT", baseline: 2, freq: 12, validity: 24, safety: false, mandatory: false,
    description: "Systematic diagnosis of mechanical faults: bearings, drives, timing, vacuum and pneumatic systems.",
    criteria: "Diagnoses common mechanical failures using structured fault-finding and applies correct fixes safely." },
  { code: "C-009", name: "Basic Troubleshooting – Electrical", category: "Technical", dept: "MNT", baseline: 2, freq: 12, validity: 24, safety: false, mandatory: false,
    description: "Safe electrical fault diagnosis: motors, sensors, PLC I/O and control circuits.",
    criteria: "Uses diagrams and meters to isolate faults; applies permit-to-work and electrical safety rules." },
  { code: "C-010", name: "Preventive & Autonomous Maintenance (TPM)", category: "Operational Excellence", dept: "MNT", baseline: 2, freq: 12, validity: 24, safety: false, mandatory: false,
    description: "Execution of preventive maintenance plans and autonomous maintenance (CIL) by operators.",
    criteria: "Completes PM checklists, performs clean-inspect-lubricate routines and raises abnormalities." },
  { code: "C-011", name: "Utility Systems Operation (Boiler, Compressor, HVAC)", category: "Technical", dept: "ENG", baseline: 3, freq: 6, validity: 12, safety: true, mandatory: true,
    description: "Safe operation of steam boilers, air compressors and HVAC; monitoring and emergency procedures.",
    criteria: "Operates utilities within permit limits, completes log sheets, responds to alarms and knows emergency shutdown." },
  { code: "C-012", name: "Forklift & Material Handling Equipment Operation", category: "Technical", dept: "WHS", baseline: 3, freq: 12, validity: 24, safety: true, mandatory: true,
    description: "Authorised operation of forklifts and MHE, including pre-use inspection and load handling.",
    criteria: "Holds valid authorisation, passes pre-use checklist, demonstrates safe load handling and stacking." },
  { code: "C-013", name: "Warehouse Management & Stock Rotation (FIFO)", category: "Technical", dept: "WHS", baseline: 2, freq: 12, validity: 36, safety: false, mandatory: false,
    description: "Storage discipline, location management and FIFO/FEFO stock rotation practices.",
    criteria: "Maintains location accuracy, applies FIFO, executes cycle counts with acceptable variance." },
  { code: "C-014", name: "Goods Receiving & Inspection", category: "Technical", dept: "SCM", baseline: 2, freq: 12, validity: 24, safety: false, mandatory: false,
    description: "Inbound goods verification against PO, documentation and quarantine procedures.",
    criteria: "Verifies quantity/ID against documentation, applies labels and quarantine rules, records discrepancies." },
  { code: "C-015", name: "Production Planning & Scheduling", category: "Technical", dept: "SCM", baseline: 3, freq: 12, validity: 36, safety: false, mandatory: false,
    description: "Preparation of production schedules balancing demand, materials and line capacity.",
    criteria: "Builds feasible schedules, communicates changes, tracks schedule adherence." },
  { code: "C-016", name: "Process Documentation & Batch Records", category: "Compliance", dept: "PRD", baseline: 2, freq: 12, validity: 36, safety: false, mandatory: false,
    description: "Completion and control of batch records, logbooks and process documentation.",
    criteria: "Completes records contemporaneously, legibly and accurately; understands Good Documentation Practices." },
  { code: "C-017", name: "SOP Compliance & GMP", category: "Compliance", dept: null, baseline: 2, freq: 6, validity: 12, safety: false, mandatory: true,
    description: "Working knowledge of applicable SOPs and GMP requirements for the role.",
    criteria: "Locates and follows relevant SOPs; passes GMP knowledge check; demonstrates hygiene rules." },
  { code: "C-018", name: "Workplace Safety & PPE", category: "Safety", dept: null, baseline: 2, freq: 6, validity: 12, safety: true, mandatory: true,
    description: "Hazard awareness, safe behaviour and correct use of personal protective equipment.",
    criteria: "Identifies area hazards, wears required PPE correctly, reports near-misses and unsafe conditions." },
  { code: "C-019", name: "5S Workplace Organization", category: "Operational Excellence", dept: null, baseline: 2, freq: 12, validity: 24, safety: false, mandatory: false,
    description: "Sort, Set-in-order, Shine, Standardise, Sustain methodology applied to the work area.",
    criteria: "Maintains 5S standard of area; participates in audits; sustains improvements." },
  { code: "C-020", name: "Emergency Response & Evacuation", category: "Safety", dept: null, baseline: 2, freq: 6, validity: 12, safety: true, mandatory: true,
    description: "Response to fire, chemical spill and medical emergencies; evacuation roles and assembly.",
    criteria: "Knows alarm signals, evacuation routes, assembly point and role-specific emergency duties." },
  { code: "C-021", name: "Fire Safety & Fire Fighting", category: "Safety", dept: null, baseline: 2, freq: 12, validity: 12, safety: true, mandatory: true,
    description: "Fire prevention, use of first-aid firefighting equipment and hot-work controls.",
    criteria: "Operates extinguishers correctly, understands classes of fire and hot-work permit rules." },
  { code: "C-022", name: "First Aid", category: "Safety", dept: null, baseline: 2, freq: 12, validity: 24, safety: true, mandatory: true,
    description: "Provision of immediate first aid for injuries and medical conditions at the workplace.",
    criteria: "Assesses casualty, provides first aid within scope, hands over to medical services with records." },
  { code: "C-023", name: "Lockout–Tagout (LOTO) & Machine Guarding", category: "Safety", dept: null, baseline: 2, freq: 6, validity: 12, safety: true, mandatory: true,
    description: "Energy isolation during maintenance and verification of machine guarding.",
    criteria: "Applies LOTO steps correctly, verifies zero energy, checks guards before restart." },
  { code: "C-024", name: "Hazardous Material Handling", category: "Safety", dept: null, baseline: 2, freq: 12, validity: 12, safety: true, mandatory: false,
    description: "Safe handling, storage and spill response for chemicals and hazardous materials.",
    criteria: "Reads SDS, uses correct PPE and storage segregation, follows spill response procedure." },
  { code: "C-025", name: "Environmental Awareness & Waste Management", category: "Compliance", dept: "EHS", baseline: 2, freq: 12, validity: 24, safety: false, mandatory: false,
    description: "Environmental aspects, waste segregation and regulatory awareness.",
    criteria: "Segregates waste streams correctly and understands site environmental aspects register." },
  { code: "C-026", name: "Data Recording & Reporting", category: "Compliance", dept: null, baseline: 2, freq: 12, validity: 24, safety: false, mandatory: false,
    description: "Accurate recording of production, quality and training data; basic reporting.",
    criteria: "Records data accurately and on time; produces simple trend summaries from records." },
  { code: "C-027", name: "Root Cause Analysis & CAPA", category: "Quality", dept: null, baseline: 3, freq: 12, validity: 36, safety: false, mandatory: false,
    description: "Structured problem solving (5-Why, fishbone) and corrective/preventive action management.",
    criteria: "Facilitates simple RCA, defines effective CAPA and verifies closure with evidence." },
  { code: "C-028", name: "Communication & Team Coordination", category: "Behavioral", dept: null, baseline: 2, freq: 12, validity: 36, safety: false, mandatory: false,
    description: "Shift handover, team briefing and effective workplace communication.",
    criteria: "Conducts structured handovers, communicates issues clearly, participates in briefings." },
];

// ── job roles + required competencies ────────────────────────────────────────
type RoleSeedJob = { code: string; title: string; grade: string; dept: string; count: number; area?: string[]; shift?: string[]; reqs: [string, number][] };
const JOB_ROLE_SEED: RoleSeedJob[] = [
  { code: "JR-PRD-01", title: "Machine Operator (Making)", grade: "Worker", dept: "PRD", count: 21, area: ["PRD-MK1", "PRD-MK2"], shift: ["Morning", "Evening", "Night", "Rotating"],
    reqs: [["C-001", 3], ["C-007", 2], ["C-016", 2], ["C-017", 2], ["C-018", 2], ["C-019", 2], ["C-020", 2], ["C-023", 2]] },
  { code: "JR-PRD-02", title: "Machine Operator (Packing)", grade: "Worker", dept: "PRD", count: 19, area: ["PRD-PK1", "PRD-PK2"], shift: ["Morning", "Evening", "Night", "Rotating"],
    reqs: [["C-002", 3], ["C-007", 2], ["C-016", 2], ["C-017", 2], ["C-018", 2], ["C-019", 2], ["C-020", 2], ["C-023", 2]] },
  { code: "JR-PRD-03", title: "Blend Preparation Operator", grade: "Worker", dept: "PRD", count: 5, area: ["PRD-BLD"], shift: ["Morning", "Evening"],
    reqs: [["C-003", 3], ["C-017", 2], ["C-018", 2], ["C-024", 2], ["C-019", 2], ["C-020", 2]] },
  { code: "JR-PRD-04", title: "Line Leader", grade: "Staff", dept: "PRD", count: 4, area: ["PRD-MK1", "PRD-MK2", "PRD-PK1", "PRD-PK2"], shift: ["Morning", "Evening", "Night"],
    reqs: [["C-001", 3], ["C-002", 3], ["C-007", 3], ["C-008", 2], ["C-016", 2], ["C-017", 3], ["C-018", 2], ["C-019", 3], ["C-027", 2], ["C-028", 2]] },
  { code: "JR-PRD-05", title: "Production Supervisor", grade: "Officer", dept: "PRD", count: 3, area: ["PRD-MK1", "PRD-PK1", "PRD-BLD"], shift: ["General", "Morning", "Evening"],
    reqs: [["C-001", 3], ["C-002", 3], ["C-006", 2], ["C-015", 2], ["C-016", 3], ["C-017", 3], ["C-018", 3], ["C-019", 3], ["C-020", 3], ["C-023", 3], ["C-027", 3], ["C-028", 2]] },
  { code: "JR-PRD-06", title: "Production Manager", grade: "Manager", dept: "PRD", count: 1, area: ["PRD-MK1"], shift: ["General"],
    reqs: [["C-006", 3], ["C-015", 3], ["C-016", 3], ["C-017", 3], ["C-018", 3], ["C-027", 3], ["C-028", 3]] },

  { code: "JR-QAS-01", title: "QA Inspector", grade: "Staff", dept: "QAS", count: 6, area: ["QAS-IPC", "QAS-FGI"], shift: ["General", "Morning", "Evening"],
    reqs: [["C-004", 3], ["C-007", 3], ["C-017", 2], ["C-018", 2], ["C-026", 2], ["C-027", 2]] },
  { code: "JR-QAS-02", title: "Laboratory Analyst", grade: "Staff", dept: "QAS", count: 4, area: ["QAS-LAB"], shift: ["General", "Morning"],
    reqs: [["C-005", 3], ["C-004", 3], ["C-006", 2], ["C-017", 2], ["C-018", 2], ["C-026", 2]] },
  { code: "JR-QAS-03", title: "QA Officer", grade: "Officer", dept: "QAS", count: 3, area: ["QAS-IPC", "QAS-FGI"], shift: ["General"],
    reqs: [["C-004", 3], ["C-006", 3], ["C-007", 3], ["C-017", 3], ["C-027", 3], ["C-026", 2], ["C-018", 2]] },
  { code: "JR-QAS-04", title: "QA Manager", grade: "Manager", dept: "QAS", count: 1, area: ["QAS-LAB"], shift: ["General"],
    reqs: [["C-006", 3], ["C-027", 4], ["C-017", 3], ["C-026", 3], ["C-028", 3], ["C-018", 3]] },

  { code: "JR-ENG-01", title: "Process Engineer", grade: "Officer", dept: "ENG", count: 3, area: ["ENG-PRC"], shift: ["General"],
    reqs: [["C-006", 3], ["C-011", 2], ["C-015", 2], ["C-016", 2], ["C-027", 3], ["C-017", 2], ["C-018", 2]] },
  { code: "JR-ENG-02", title: "Utility Engineer", grade: "Officer", dept: "ENG", count: 2, area: ["ENG-UTL"], shift: ["General", "Morning"],
    reqs: [["C-011", 3], ["C-008", 2], ["C-009", 2], ["C-017", 2], ["C-018", 3], ["C-023", 2], ["C-025", 2]] },
  { code: "JR-ENG-03", title: "Engineering Manager", grade: "Manager", dept: "ENG", count: 1, area: ["ENG-PRC"], shift: ["General"],
    reqs: [["C-011", 3], ["C-027", 3], ["C-015", 2], ["C-018", 3], ["C-028", 3]] },

  { code: "JR-MNT-01", title: "Maintenance Technician (Mechanical)", grade: "Worker", dept: "MNT", count: 5, area: ["MNT-MEC"], shift: ["General", "Morning", "Night"],
    reqs: [["C-008", 3], ["C-010", 3], ["C-018", 2], ["C-023", 3], ["C-017", 2], ["C-020", 2]] },
  { code: "JR-MNT-02", title: "Maintenance Technician (Electrical)", grade: "Worker", dept: "MNT", count: 4, area: ["MNT-ELE"], shift: ["General", "Evening", "Night"],
    reqs: [["C-009", 3], ["C-010", 3], ["C-018", 2], ["C-023", 3], ["C-017", 2], ["C-020", 2]] },
  { code: "JR-MNT-03", title: "Automation Technician", grade: "Staff", dept: "MNT", count: 2, area: ["MNT-ELE"], shift: ["General"],
    reqs: [["C-009", 3], ["C-008", 2], ["C-010", 3], ["C-023", 3], ["C-026", 2], ["C-018", 2]] },
  { code: "JR-MNT-04", title: "Maintenance Supervisor", grade: "Officer", dept: "MNT", count: 1, area: ["MNT-MEC"], shift: ["General"],
    reqs: [["C-008", 3], ["C-009", 3], ["C-010", 3], ["C-011", 2], ["C-023", 3], ["C-027", 3], ["C-018", 3], ["C-020", 3]] },

  { code: "JR-WHS-01", title: "Warehouse Assistant", grade: "Worker", dept: "WHS", count: 5, area: ["WHS-RMS", "WHS-FGS"], shift: ["General", "Morning", "Evening"],
    reqs: [["C-013", 2], ["C-017", 2], ["C-018", 2], ["C-019", 2], ["C-026", 2]] },
  { code: "JR-WHS-02", title: "Forklift Operator", grade: "Worker", dept: "WHS", count: 4, area: ["WHS-FGS", "WHS-RMS"], shift: ["General", "Morning", "Evening"],
    reqs: [["C-012", 3], ["C-013", 2], ["C-018", 2], ["C-017", 2], ["C-019", 2]] },
  { code: "JR-WHS-03", title: "Store Keeper", grade: "Staff", dept: "WHS", count: 2, area: ["WHS-RMS"], shift: ["General"],
    reqs: [["C-013", 3], ["C-014", 2], ["C-026", 3], ["C-017", 2], ["C-018", 2]] },
  { code: "JR-WHS-04", title: "Warehouse Supervisor", grade: "Officer", dept: "WHS", count: 1, area: ["WHS-FGS"], shift: ["General"],
    reqs: [["C-013", 3], ["C-014", 3], ["C-012", 2], ["C-026", 2], ["C-027", 2], ["C-018", 3], ["C-019", 3]] },

  { code: "JR-SCM-01", title: "Receiving Assistant", grade: "Worker", dept: "SCM", count: 3, area: ["SCM-RCV"], shift: ["General", "Morning"],
    reqs: [["C-014", 3], ["C-017", 2], ["C-018", 2], ["C-019", 2], ["C-026", 2]] },
  { code: "JR-SCM-02", title: "Supply Chain Officer", grade: "Officer", dept: "SCM", count: 4, area: ["SCM-PLN", "SCM-RCV"], shift: ["General"],
    reqs: [["C-015", 3], ["C-014", 2], ["C-013", 2], ["C-026", 2], ["C-018", 2], ["C-028", 2]] },

  { code: "JR-EHS-01", title: "Safety Officer", grade: "Officer", dept: "EHS", count: 2, area: ["EHS-OFC"], shift: ["General"],
    reqs: [["C-018", 4], ["C-020", 4], ["C-021", 3], ["C-022", 3], ["C-023", 3], ["C-024", 3], ["C-025", 3], ["C-027", 3]] },
  { code: "JR-EHS-02", title: "EHS Coordinator", grade: "Staff", dept: "EHS", count: 2, area: ["EHS-OFC"], shift: ["General"],
    reqs: [["C-018", 3], ["C-020", 3], ["C-021", 3], ["C-022", 3], ["C-025", 2], ["C-026", 2]] },

  { code: "JR-HRD-01", title: "HR Officer", grade: "Officer", dept: "HRD", count: 3, area: ["HRD-ADM"], shift: ["General"],
    reqs: [["C-028", 3], ["C-026", 3], ["C-017", 2], ["C-018", 2], ["C-019", 2]] },
  { code: "JR-HRD-02", title: "Training Officer", grade: "Officer", dept: "HRD", count: 1, area: ["HRD-ADM"], shift: ["General"],
    reqs: [["C-028", 3], ["C-026", 3], ["C-017", 3], ["C-027", 2], ["C-018", 2], ["C-019", 2], ["C-016", 2]] },
];

// ── training programs ────────────────────────────────────────────────────────
type ProgSeed = { code: string; title: string; category: string; competency: string; hours: number; mode: string; dept: string | null; description: string };
const PROGRAM_SEED: ProgSeed[] = [
  { code: "TP-01", title: "Machine Operation Fundamentals (Making)", category: "Technical", competency: "C-001", hours: 16, mode: "On-job", dept: "PRD", description: "Making machine operation from start-up to quality checks, delivered on the line with a certified trainer." },
  { code: "TP-02", title: "Advanced Packing Machine Operation", category: "Technical", competency: "C-002", hours: 12, mode: "On-job", dept: "PRD", description: "Format changeovers, jam clearance and packing quality optimisation." },
  { code: "TP-03", title: "Quality Inspection Techniques", category: "Quality", competency: "C-004", hours: 8, mode: "Classroom", dept: "QAS", description: "Sampling plans, gauge usage and defect classification for inspectors." },
  { code: "TP-04", title: "SPC & Data Analysis Workshop", category: "Quality", competency: "C-006", hours: 8, mode: "Classroom", dept: null, description: "Control charts, capability and interpretation for process owners." },
  { code: "TP-05", title: "SOP Compliance & GMP Refresher", category: "Compliance", competency: "C-017", hours: 4, mode: "Classroom", dept: null, description: "Annual refresher on SOP discipline and GMP expectations." },
  { code: "TP-06", title: "Workplace Safety & PPE Induction", category: "Safety", competency: "C-018", hours: 4, mode: "Classroom", dept: null, description: "Hazard awareness, PPE selection and incident reporting." },
  { code: "TP-07", title: "Fire Safety & Evacuation Drill", category: "Safety", competency: "C-021", hours: 4, mode: "Blended", dept: null, description: "Fire prevention, extinguisher use and evacuation exercise." },
  { code: "TP-08", title: "First Aid Refresher", category: "Safety", competency: "C-022", hours: 8, mode: "Classroom", dept: null, description: "Practical first-aid refresher with certified instructor." },
  { code: "TP-09", title: "LOTO & Machine Guarding", category: "Safety", competency: "C-023", hours: 6, mode: "Blended", dept: null, description: "Energy isolation practice and guarding verification." },
  { code: "TP-10", title: "5S Workplace Organization", category: "Operational Excellence", competency: "C-019", hours: 6, mode: "Blended", dept: null, description: "5S principles with area-level implementation exercise." },
  { code: "TP-11", title: "Basic Mechanical Troubleshooting", category: "Technical", competency: "C-008", hours: 12, mode: "Blended", dept: "MNT", description: "Structured mechanical fault-finding on training rig." },
  { code: "TP-12", title: "Basic Electrical Troubleshooting", category: "Technical", competency: "C-009", hours: 12, mode: "Blended", dept: "MNT", description: "Safe electrical diagnosis: sensors, motors, PLC I/O." },
  { code: "TP-13", title: "Forklift Safe Operation", category: "Safety", competency: "C-012", hours: 8, mode: "On-job", dept: "WHS", description: "Authorised forklift operation course with practical assessment." },
  { code: "TP-14", title: "Hazardous Material Handling", category: "Safety", competency: "C-024", hours: 4, mode: "Classroom", dept: null, description: "SDS interpretation, segregation and spill response." },
  { code: "TP-15", title: "Root Cause Analysis & CAPA", category: "Quality", competency: "C-027", hours: 8, mode: "Classroom", dept: null, description: "5-Why and fishbone practice on real case studies." },
  { code: "TP-16", title: "Emergency Response Team Training", category: "Safety", competency: "C-020", hours: 6, mode: "Blended", dept: null, description: "ERT duties, communication and drill participation." },
];

const TRAINERS = [
  "Farhana Yasmin (Training Officer)", "Md. Delwar Hossain (Production Supervisor)", "Rezaul Karim (EHS Officer)",
  "Shirin Akter (QA Manager)", "Kamrul Hasan (Maintenance Supervisor)", "Nusrat Jahan (External – BSTI Certified)",
  "Md. Anisur Rahman (HR Manager)", "Golam Sarwar (External Trainer)",
];
const LOCATIONS = ["Training Room A", "Training Room B", "Shop Floor – Line Area", "QA Laboratory", "Warehouse Bay 2", "Utilities Control Room", "First Aid Room"];

// ─────────────────────────────────────────────────────────────────────────────
export async function seedDatabase(): Promise<{ seeded: boolean }> {
  // A dedicated connection created per invocation — never a module-level
  // client, which could hold a handle to a db file that was replaced or
  // deleted underneath a long-running server.
  const db = new PrismaClient();
  let seeded = false;
  try {
    seeded = await seedInto(db);
  } finally {
    await db.$disconnect().catch(() => {});
  }
  return { seeded };
}

async function seedInto(db: PrismaClient): Promise<boolean> {
  // Idempotency guard: never seed on top of an existing populated database.
  if ((await db.user.count()) > 0) {
    console.log("Database already seeded — skipping.");
    return false;
  }

  console.log("Seeding synthetic dataset …");

  // clean (FK-safe order)
  await db.notification.deleteMany();
  await db.auditLog.deleteMany();
  await db.attendanceRecord.deleteMany();
  await db.enrollment.deleteMany();
  await db.trainingSession.deleteMany();
  await db.trainingProgram.deleteMany();
  await db.qualification.deleteMany();
  await db.assessment.deleteMany();
  await db.roleCompetency.deleteMany();
  await db.user.deleteMany();
  await db.employee.deleteMany();
  await db.competency.deleteMany();
  await db.jobRole.deleteMany();
  await db.productionArea.deleteMany();
  await db.department.deleteMany();
  await db.role.deleteMany();
  await db.setting.deleteMany();

  // 1 ─ roles
  const roleIds: Record<string, string> = {};
  for (const r of ROLE_SEED) {
    const created = await db.role.create({ data: { code: r.code, name: r.name, description: r.description, permissions: JSON.stringify(r.permissions) } });
    roleIds[r.code] = created.id;
  }

  // 2 ─ departments & areas
  const deptIds: Record<string, string> = {};
  for (const d of DEPT_SEED) {
    deptIds[d.code] = (await db.department.create({ data: d })).id;
  }
  const areaIds: Record<string, string> = {};
  for (const [deptCode, areas] of Object.entries(AREA_SEED)) {
    for (const a of areas) {
      areaIds[a.code] = (await db.productionArea.create({ data: { code: a.code, name: a.name, departmentId: deptIds[deptCode] } })).id;
    }
  }

  // 3 ─ competencies
  const compIds: Record<string, string> = {};
  const compByCode: Record<string, CompSeed> = {};
  for (const c of COMPETENCY_SEED) {
    compByCode[c.code] = c;
    compIds[c.code] = (await db.competency.create({
      data: {
        code: c.code, name: c.name, description: c.description, category: c.category,
        departmentId: c.dept ? deptIds[c.dept] : null,
        baselineLevel: c.baseline, assessmentCriteria: c.criteria,
        assessmentFrequencyMonths: c.freq, validityMonths: c.validity,
        safetyCritical: c.safety, mandatory: c.mandatory,
      },
    })).id;
  }

  // 4 ─ job roles + role competency requirements
  const jobRoleIds: Record<string, string> = {};
  for (const j of JOB_ROLE_SEED) {
    jobRoleIds[j.code] = (await db.jobRole.create({
      data: { code: j.code, title: j.title, grade: j.grade, departmentId: deptIds[j.dept] },
    })).id;
    for (const [compCode, level] of j.reqs) {
      await db.roleCompetency.create({
        data: { jobRoleId: jobRoleIds[j.code], competencyId: compIds[compCode], requiredLevel: level },
      });
    }
  }

  // 5 ─ employees
  const today = startOfDay(new Date());
  type EmpRec = { id: string; name: string; dept: string; jobCode: string; employeeCode: string; required: { comp: string; level: number }[] };
  const employees: EmpRec[] = [];
  let empSeq = 1001;

  // department heads (for supervisor assignment)
  const deptHeadJob: Record<string, string> = {
    PRD: "JR-PRD-06", QAS: "JR-QAS-04", ENG: "JR-ENG-03", MNT: "JR-MNT-04",
    WHS: "JR-WHS-04", SCM: "JR-SCM-02", EHS: "JR-EHS-01", HRD: "JR-HRD-02",
  };
  const deptHeadName: Record<string, string> = {};

  // generate managers/officers first so their names are known for supervisor fields
  const orderedRoles = [...JOB_ROLE_SEED].sort((a, b) => {
    const order = (g: string) => (g === "Manager" ? 0 : g === "Officer" ? 1 : 2);
    return order(a.grade) - order(b.grade);
  });

  for (const j of orderedRoles) {
    for (let i = 0; i < j.count; i++) {
      const name = synthName();
      if (deptHeadJob[j.dept] === j.code && !deptHeadName[j.dept]) deptHeadName[j.dept] = name;

      const gradeSuffixes: Record<string, string[]> = {
        Worker: ["I", "II", "II", "III"],
        Staff: ["", "", "Senior "],
        Officer: ["", "Senior ", ""],
        Manager: [""],
      };
      const suffix = pick(gradeSuffixes[j.grade]);
      const designation = j.grade === "Worker" ? `${j.title.replace(/\s*\(.*\)$/, "")} ${suffix}`.trim() : `${suffix}${j.title}`.trim();

      const isRecent = j.grade === "Worker" && chance(0.12);
      const joiningYear = isRecent ? rint(2023, 2025) : rint(2006, 2024);
      const joiningDate = new Date(joiningYear, rint(0, 11), rint(1, 28));
      const cat = isRecent && chance(0.5) ? "Trainee" : chance(0.72) ? "Permanent" : "Contract";
      const status = cat === "Trainee" ? "probation" : chance(0.94) ? "active" : chance(0.5) ? "on_leave" : "notice_period";

      const emp = await db.employee.create({
        data: {
          employeeCode: `SE-${empSeq}`,
          name,
          departmentId: deptIds[j.dept],
          productionAreaId: j.area ? areaIds[pick(j.area)] : null,
          jobRoleId: jobRoleIds[j.code],
          designation,
          joiningDate,
          status,
          supervisorName: "", // set below
          shift: pick(j.shift ?? ["General"]),
          category: cat,
        },
      });
      empSeq += 1;
      employees.push({
        id: emp.id, name, dept: j.dept, jobCode: j.code, employeeCode: emp.employeeCode,
        required: j.reqs.map(([c, l]) => ({ comp: c, level: l })),
      });
    }
  }
  const PLANT_MANAGER = "Md. Ashraful Alam (Plant Manager)";
  for (const e of employees) {
    const headName = deptHeadName[e.dept] ?? PLANT_MANAGER;
    const isHead = deptHeadName[e.dept] === e.name;
    await db.employee.update({ where: { id: e.id }, data: { supervisorName: isHead ? PLANT_MANAGER : headName } });
  }

  // training officer & supervisor demo anchors
  const trainingOfficerEmp = employees.find((e) => e.jobCode === "JR-HRD-02")!;
  const productionSupervisorEmp = employees.find((e) => e.jobCode === "JR-PRD-05")!;
  const demoEmployeeEmp = employees.find((e) => e.jobCode === "JR-PRD-01" && e.dept === "PRD")!;

  console.log(`  employees: ${employees.length}`);

  // 6 ─ assessments
  const ASSESSORS = ["Farhana Yasmin", "Md. Delwar Hossain", "Shirin Akter", "Kamrul Hasan", "Rezaul Karim"];
  const ASSESSMENT_NOTES = [
    "Reassessed following on-job observation.", "Assessed during annual competency review.",
    "Level confirmed after practical demonstration.", "Improved following completion of refresher training.",
    null, null, null,
  ];
  let assessedCount = 0, notAssessedCount = 0, gapCount = 0;
  for (const e of employees) {
    // demo-linked employees always fully assessed so their profiles look complete
    const isDemo = e.id === trainingOfficerEmp.id || e.id === productionSupervisorEmp.id || e.id === demoEmployeeEmp.id;
    for (const req of e.required) {
      const comp = compByCode[req.comp];
      if (!isDemo && chance(0.08)) { notAssessedCount++; continue; }
      // gap distribution: 62% met, 27% gap-1, 8% gap-2, 3% gap-3
      const r = rnd();
      let delta = r < 0.62 ? 0 : r < 0.89 ? 1 : r < 0.97 ? 2 : 3;
      let level = Math.min(4, Math.max(1, req.level - delta));
      if (delta === 0 && chance(0.06)) level = Math.min(4, req.level + 1); // over-qualified
      if (delta > 0) gapCount++;
      // recency: mostly recent; safety-critical sometimes overdue
      let monthsAgo = chance(0.72) ? rint(1, 5) : rint(6, 14);
      if (comp.safety && chance(0.16)) monthsAgo = comp.freq + rint(1, 4); // expired assessment
      const assessedAt = addMonths(today, -monthsAgo);
      await db.assessment.create({
        data: {
          employeeId: e.id, competencyId: compIds[req.comp], level,
          assessedBy: pick(ASSESSORS), assessedById: null,
          assessedAt, notes: pick(ASSESSMENT_NOTES),
        },
      });
      assessedCount++;
    }
  }
  console.log(`  assessments: ${assessedCount} (not assessed slots: ${notAssessedCount}, gaps: ${gapCount})`);

  // ── index latest assessments for qualification/enrollment logic
  const latestAssessment = new Map<string, { level: number; assessedAt: Date }>();
  for (const e of employees) {
    // re-query per employee to keep ordering authoritative
    const rows = await db.assessment.findMany({ where: { employeeId: e.id }, orderBy: { assessedAt: "desc" } });
    for (const a of rows) {
      const key = `${e.id}:${a.competencyId}`;
      if (!latestAssessment.has(key)) latestAssessment.set(key, { level: a.level, assessedAt: a.assessedAt });
    }
  }

  // 7 ─ qualifications (safety-critical requirements)
  let qExpired = 0, q7 = 0, q30 = 0, qValid = 0, certSeq = 1;
  for (const e of employees) {
    for (const req of e.required) {
      const comp = compByCode[req.comp];
      if (!comp.safety) continue;
      if (chance(0.1)) continue; // some never qualified
      const r = rnd();
      let expiresAt: Date;
      if (r < 0.10) { expiresAt = addDays(today, -rint(5, 60)); qExpired++; }        // expired
      else if (r < 0.18) { expiresAt = addDays(today, rint(1, 7)); q7++; }           // ≤ 7 days
      else if (r < 0.30) { expiresAt = addDays(today, rint(8, 30)); q30++; }         // ≤ 30 days
      else if (r < 0.85) { expiresAt = addDays(today, rint(31, 300)); qValid++; }    // valid
      else { expiresAt = addDays(today, rint(301, 500)); qValid++; }
      const issuedAt = addMonths(expiresAt, -comp.validity);
      await db.qualification.create({
        data: {
          employeeId: e.id, competencyId: compIds[req.comp],
          issuedAt, expiresAt,
          certificateRef: `CERT-${issuedAt.getFullYear()}-${pad(certSeq++)}`,
          notes: null,
        },
      });
    }
  }
  console.log(`  qualifications: expired=${qExpired}, ≤7d=${q7}, ≤30d=${q30}, valid=${qValid}`);

  // 8 ─ training programs
  const progIds: Record<string, string> = {};
  for (const p of PROGRAM_SEED) {
    progIds[p.code] = (await db.trainingProgram.create({
      data: {
        code: p.code, title: p.title, category: p.category, description: p.description,
        competencyId: compIds[p.competency], durationHours: p.hours, deliveryMode: p.mode,
      },
    })).id;
  }

  // 9 ─ training sessions (+ enrollments + attendance)
  //     past 10 months: completed sessions; current +3 months: scheduled.
  const sessionTargets: { prog: ProgSeed; date: Date }[] = [];
  for (let m = 10; m >= 1; m--) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const monthStart = startOfDay(monthDate);
    const picks = [
      PROGRAM_SEED[4], PROGRAM_SEED[5], PROGRAM_SEED[6], PROGRAM_SEED[9], // safety/compliance refreshers
      PROGRAM_SEED[rint(0, PROGRAM_SEED.length - 1)],
    ];
    for (const p of picks) sessionTargets.push({ prog: p, date: addDays(monthStart, rint(2, 26)) });
  }
  // upcoming: within 7, within 30, and later
  const upcomingProgs = [PROGRAM_SEED[7], PROGRAM_SEED[8], PROGRAM_SEED[13], PROGRAM_SEED[15], PROGRAM_SEED[2], PROGRAM_SEED[10], PROGRAM_SEED[3], PROGRAM_SEED[12]];
  const upcomingOffsets = [2, 5, 12, 18, 25, 40, 55, 75];
  upcomingProgs.forEach((p, i) => sessionTargets.push({ prog: p, date: addDays(today, upcomingOffsets[i]) }));

  let sessionSeq = 1;
  const sessionRecords: { id: string; prog: ProgSeed; date: Date; status: string; capacity: number; targetDept: string | null }[] = [];
  for (const t of sessionTargets) {
    const isPast = t.date < today;
    const isToday = startOfDay(t.date).getTime() === today.getTime();
    const status = isPast ? "completed" : isToday ? "in_progress" : "scheduled";
    const capacity = rint(12, 24);
    const code = `TS-${new Date().getFullYear()}-${pad(sessionSeq++, 3)}`;
    const s = await db.trainingSession.create({
      data: {
        code, programId: progIds[t.prog.code],
        title: t.prog.title,
        scheduledDate: t.date,
        startTime: pick(["08:30", "09:00", "10:00", "13:30", "14:00"]),
        durationHours: t.prog.hours,
        location: pick(LOCATIONS),
        trainer: pick(TRAINERS),
        capacity, status,
        targetDepartmentId: t.prog.dept ? deptIds[t.prog.dept] : null,
        notes: null,
      },
    });
    sessionRecords.push({ id: s.id, prog: t.prog, date: t.date, status, capacity, targetDept: t.prog.dept });

    // enrollments — prefer employees with a TNA gap on the program's competency
    const compCode = t.prog.competency;
    const pool = employees.filter((e) => (t.prog.dept ? e.dept === t.prog.dept : true));
    const withGap = pool.filter((e) => {
      const req = e.required.find((x) => x.comp === compCode);
      if (!req) return false;
      const la = latestAssessment.get(`${e.id}:${compIds[compCode]}`);
      return !la || la.level < req.level;
    });
    const withoutGap = pool.filter((e) => !withGap.includes(e));
    const wanted = Math.min(capacity - rint(0, 3), rint(8, 18));
    const chosen: EmpRec[] = [];
    for (const e of withGap) { if (chosen.length < wanted) chosen.push(e); }
    for (const e of withoutGap) { if (chosen.length < wanted && chance(0.35)) chosen.push(e); }

    for (const e of chosen) {
      const dup = await db.enrollment.findUnique({ where: { sessionId_employeeId: { sessionId: s.id, employeeId: e.id } } });
      if (dup) continue;
      await db.enrollment.create({ data: { sessionId: s.id, employeeId: e.id, status: "enrolled" } });
      if (status === "completed") {
        const roll = rnd();
        const att = roll < 0.86 ? "present" : roll < 0.95 ? "absent" : "excused";
        const qualified = att === "present" && chance(0.9);
        await db.attendanceRecord.create({
          data: {
            sessionId: s.id, employeeId: e.id, status: att, qualified,
            remarks: att === "absent" ? pick(["Shift duty – not released", "Sick leave", "Production priority"]) : null,
            recordedAt: addDays(t.date, 1),
          },
        });
      }
    }
  }
  console.log(`  training sessions: ${sessionRecords.length}`);

  // 10 ─ users (demo accounts; synthetic)
  await db.user.create({
    data: {
      email: "admin@tna-demo.com", name: "Md. Anisur Rahman",
      passwordHash: hashPassword("Admin@1234"), roleId: roleIds["administrator"], status: "active",
    },
  });
  await db.user.create({
    data: {
      email: "training@tna-demo.com", name: "Farhana Yasmin",
      passwordHash: hashPassword("Training@1234"), roleId: roleIds["training_officer"],
      employeeId: trainingOfficerEmp.id, status: "active",
    },
  });
  await db.user.create({
    data: {
      email: "supervisor@tna-demo.com", name: "Md. Delwar Hossain",
      passwordHash: hashPassword("Supervisor@1234"), roleId: roleIds["department_supervisor"],
      employeeId: productionSupervisorEmp.id, status: "active",
    },
  });
  await db.user.create({
    data: {
      email: "employee@tna-demo.com", name: demoEmployeeEmp.name,
      passwordHash: hashPassword("Employee@1234"), roleId: roleIds["employee"],
      employeeId: demoEmployeeEmp.id, status: "active",
    },
  });

  // 11 ─ settings (TNA rules & thresholds, editable by Administrator)
  await db.setting.create({
    data: {
      key: "tna_rules",
      description: "Configurable prioritisation rules for the Training Needs Analysis engine.",
      value: JSON.stringify({
        expiredMandatoryQualification: "critical",
        safetyCriticalGap: "critical",
        gapTwoPlus: "high",
        gapOne: "medium",
        notAssessed: "high",
        notAssessedSafety: "critical",
        assessmentExpired: "medium",
        assessmentExpiredSafety: "high",
        expiringSoonDays: 30,
        assessmentValidityDefaultMonths: 24,
      }),
      updatedBy: "System",
    },
  });
  await db.setting.create({
    data: {
      key: "alert_thresholds",
      description: "Qualification alert windows and notification behaviour.",
      value: JSON.stringify({ within7Days: true, within30Days: true, emailEnabled: false, emailConfigured: false }),
      updatedBy: "System",
    },
  });

  // 12 ─ notifications: use the production alert engine (stable dedupe keys,
  // per-user expiry alerts, upcoming-session reminders) + a seed notice
  const { refreshAlerts } = await import("../src/lib/notifications");
  await refreshAlerts();
  await db.notification.create({
    data: {
      audienceRole: "administrator", type: "system", severity: "info",
      title: "Synthetic dataset initialised",
      message: "The demo database was seeded with synthetic manufacturing workforce data for the portfolio simulation.",
      linkView: "settings",
      entityId: "seed-notice",
    },
  });

  // 13 ─ honest audit entry
  await db.auditLog.create({
    data: {
      userName: "System", action: "seed", entity: "database",
      details: `Seeded synthetic dataset: ${employees.length} employees, ${COMPETENCY_SEED.length} competencies, ${assessedCount} assessments, ${sessionRecords.length} training sessions.`,
    },
  });

  const totals = {
    departments: DEPT_SEED.length,
    productionAreas: Object.values(AREA_SEED).flat().length,
    jobRoles: JOB_ROLE_SEED.length,
    employees: employees.length,
    competencies: COMPETENCY_SEED.length,
    roleRequirements: JOB_ROLE_SEED.reduce((s, j) => s + j.reqs.length, 0),
    assessments: assessedCount,
    qualifications: qExpired + q7 + q30 + qValid,
    programs: PROGRAM_SEED.length,
    sessions: sessionRecords.length,
    users: 4,
  };
  console.log("Seed complete:", JSON.stringify(totals, null, 2));
  return true;
}

// CLI entry point: `bun prisma/seed.ts` (or `bun run db:seed`).
// When imported as a module (e.g. by the app's runtime auto-seed in
// src/lib/ensure-seed.ts) this block must NOT execute.
const isDirectRun =
  typeof process.argv[1] === "string" && process.argv[1].replace(/\\/g, "/").includes("prisma/seed");
if (isDirectRun) {
  seedDatabase().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
