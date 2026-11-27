import { beforeAll, describe, expect, test } from "vitest";
import { api, apiOk, useApp, type Session } from "./helpers/app.js";
import {
  ARTS_AND_SUBS,
  aLevelSubjects,
  createSchool,
  offer,
  superAdmin,
  uneb,
  type CatalogSubject,
  type TestSchool,
} from "./helpers/fixtures.js";

// A-Level combinations: the platform catalog (super admin) and each school's
// own list (adopted from the catalog or custom). Written after a school
// couldn't add a new catalog combination (HIST/IRE/LUG) because its code
// clashed with one of the school's own codes.

useApp();

interface Combination {
  id: string;
  code: string;
  name: string;
  catalogCombinationId?: string | null;
  subjects: { subjectId: string; role: string }[];
}

let sa: Session;
let subj: Record<string, CatalogSubject>;
let curriculumId: string;

const principals = (...codes: string[]) => codes.map((c) => ({ subjectId: subj[c].id, role: "principal" }));
const subsidiary = (code: string) => ({ subjectId: subj[code].id, role: "subsidiary" });

async function catalogCombination(...codes: string[]): Promise<Combination> {
  return apiOk<Combination>(sa, "POST", `/api/v1/academic/combinations?curriculumId=${curriculumId}`, {
    subjects: principals(...codes),
  });
}

async function readySchool(): Promise<TestSchool> {
  const school = await createSchool();
  await offer(school, Object.values(subj).map((s) => s.id));
  return school;
}

function adopt(school: TestSchool, catalogCombinationId: string) {
  return api<Combination>(school.admin, "POST", `/api/v1/academic/school-combinations?academicYearId=${school.academicYearId}`, {
    catalogCombinationId,
  });
}

function createCustom(school: TestSchool, subjects: { subjectId: string; role: string }[], extra: object = {}) {
  return api<Combination>(school.admin, "POST", `/api/v1/academic/school-combinations?academicYearId=${school.academicYearId}`, {
    subjects,
    ...extra,
  });
}

beforeAll(async () => {
  sa = await superAdmin();
  curriculumId = await uneb();
  subj = await aLevelSubjects(sa, [...ARTS_AND_SUBS]);
});

describe("platform catalog (super admin)", () => {
  test("HIST/IRE/LUG is created with an automatic code, and both subsidiaries since the student chooses", async () => {
    const combo = await catalogCombination("P210", "P235", "P360");
    expect(combo.code).toMatch(/^C\d{3}$/);
    expect(combo.name).toBe("HIL/SMATH+SICT/GP");
    expect(combo.subjects.filter((s) => s.role === "subsidiary").map((s) => s.subjectId).sort()).toEqual(
      [subj.S475.id, subj.S850.id].sort(),
    );
  });

  test("Economics without Principal Maths forces Subsidiary Mathematics", async () => {
    const combo = await catalogCombination("P210", "P220", "P250");
    expect(combo.subjects.filter((s) => s.role === "subsidiary").map((s) => s.subjectId)).toEqual([subj.S475.id]);

    const wrong = await api(sa, "POST", `/api/v1/academic/combinations?curriculumId=${curriculumId}`, {
      subjects: [...principals("P210", "P220", "P250"), subsidiary("S850")],
    });
    expect(wrong.status).toBe(400);
  });

  test("needs exactly three principals", async () => {
    const res = await api(sa, "POST", `/api/v1/academic/combinations?curriculumId=${curriculumId}`, {
      subjects: principals("P210", "P235"),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exactly 3 principal/);
  });
});

describe("adding a catalog combination to a school", () => {
  test("a school can add HIST/IRE/LUG from the catalog", async () => {
    const catalog = await catalogCombination("P210", "P235", "P360");
    const school = await readySchool();

    const res = await adopt(school, catalog.id);
    expect(res.status).toBe(201);
    expect(res.body.data!.code).toBe(catalog.code);
    expect(res.body.data!.name).toBe(catalog.name);
    expect(res.body.data!.catalogCombinationId).toBe(catalog.id);
  });

  test("REGRESSION: the catalog code is already one of the school's own codes", async () => {
    const catalog = await catalogCombination("P210", "P235", "P360");
    const school = await readySchool();

    // The school's custom combinations are coded C001, C002, ... too — keep
    // adding them until one has the catalog combination's code.
    let last = "";
    for (let i = 0; i < 50 && last !== catalog.code; i++) {
      const res = await createCustom(school, principals("P210", "P250", "P360"), {});
      // Same subjects repeatedly is fine for this test; only the code matters.
      expect(res.status).toBe(201);
      last = res.body.data!.code;
    }
    expect(last).toBe(catalog.code);

    const res = await adopt(school, catalog.id);
    expect(res.status).toBe(201);
    expect(res.body.data!.code).not.toBe(catalog.code);
    expect(res.body.data!.code).toMatch(/^C\d{3}$/);
    expect(res.body.data!.name).toBe(catalog.name);
  });

  test("adding the same catalog combination twice is refused with a clear message", async () => {
    const catalog = await catalogCombination("P210", "P235", "P360");
    const school = await readySchool();

    expect((await adopt(school, catalog.id)).status).toBe(201);
    const again = await adopt(school, catalog.id);
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/already one of your school's combinations/);
  });

  test("an unknown catalog combination is a 400, not a crash", async () => {
    const school = await readySchool();
    const res = await adopt(school, "00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(400);
  });

  test("two schools can each add the same catalog combination", async () => {
    const catalog = await catalogCombination("P210", "P235", "P360");
    const a = await readySchool();
    const b = await readySchool();
    expect((await adopt(a, catalog.id)).status).toBe(201);
    expect((await adopt(b, catalog.id)).status).toBe(201);
  });
});

describe("a school's custom combinations", () => {
  test("HIST/IRE/LUG with Subsidiary ICT", async () => {
    const school = await readySchool();
    const res = await createCustom(school, [...principals("P210", "P235", "P360"), subsidiary("S850")]);
    expect(res.status).toBe(201);
    expect(res.body.data!.name).toBe("HIL/SICT/GP");
  });

  test("a typed code that's already used is refused, on create and on edit", async () => {
    const school = await readySchool();
    const first = await createCustom(school, principals("P210", "P235", "P360"), { code: "HIL" });
    expect(first.status).toBe(201);

    const dup = await createCustom(school, principals("P210", "P250", "P360"), { code: "hil" });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/already has a combination coded HIL/);

    const other = await createCustom(school, principals("P210", "P250", "P360"));
    const edit = await api(school.admin, "PATCH", `/api/v1/academic/school-combinations/${other.body.data!.id}`, {
      code: "HIL",
    });
    expect(edit.status).toBe(400);

    // Re-saving a combination with its own code is not a clash.
    const self = await api(school.admin, "PATCH", `/api/v1/academic/school-combinations/${first.body.data!.id}`, {
      code: "HIL",
    });
    expect(self.status).toBe(200);
  });

  test("General Paper can't be a member", async () => {
    const school = await readySchool();
    const { rows } = await (await import("./helpers/app.js")).pool.query<{ id: string }>(
      `select id from subject where is_general_paper and curriculum_id = $1`,
      [curriculumId],
    );
    const res = await createCustom(school, [...principals("P210", "P235", "P360"), { subjectId: rows[0].id, role: "subsidiary" }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/General Paper/);
  });

  test("a school can't see, edit or delete another school's combination", async () => {
    const a = await readySchool();
    const b = await readySchool();
    const combo = (await createCustom(a, principals("P210", "P235", "P360"))).body.data!;

    const listB = await apiOk<Combination[]>(b.admin, "GET", `/api/v1/academic/school-combinations?academicYearId=${b.academicYearId}`);
    expect(listB.find((c) => c.id === combo.id)).toBeUndefined();

    const edit = await api(b.admin, "PATCH", `/api/v1/academic/school-combinations/${combo.id}`, { description: "hijack" });
    expect(edit.status).toBe(404);
    const del = await api(b.admin, "DELETE", `/api/v1/academic/school-combinations/${combo.id}`);
    expect(del.status).toBe(404);
  });
});
