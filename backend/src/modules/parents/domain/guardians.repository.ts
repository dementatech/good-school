import { pool } from "../../../shared/db/index.js";

// Roadmap Step 4 — parent self-service. A parent's login is a `users` row
// (role 'parent', school_id null — school-less like super_admin, since one
// guardian can have children at several schools) linked lazily via
// `guardian.user_id` (see admin/domain/parent-accounts.repository.ts, which
// creates that link). This resolves the join from the opposite side: given
// the logged-in parent's own user id, who are their children?

export interface LinkedChild {
  id: string;
  systemId: string | null;
  name: string;
  relationship: string | null;
  isPrimary: boolean;
  className: string | null;
  schoolId: string;
}

export async function listChildrenForGuardianUser(userId: string): Promise<LinkedChild[]> {
  const { rows } = await pool.query<{
    student_user_id: string;
    system_id: string | null;
    name: string;
    relationship: string | null;
    is_primary: boolean;
    class_name: string | null;
    school_id: string;
  }>(
    `select st.user_id as student_user_id, su.system_id,
            trim(concat_ws(' ', st.first_name, st.last_name)) as name,
            sg.role as relationship, sg.is_primary_contact as is_primary,
            nullif(trim(concat_ws(' - ', stage_label(c.school_id, cs.id), str.name)), '') as class_name, su.school_id
       from guardian g
       join student_guardian sg on sg.guardian_id = g.id
       join students st on st.user_id = sg.student_user_id
       join users su on su.id = st.user_id
       left join student_enrollment en
         on en.student_user_id = st.user_id and en.status = 'active'
       left join classes c on c.id = en.class_id
       left join curriculum_stage cs on cs.id = c.curriculum_stage_id
       left join streams str on str.id = en.stream_id
      where g.user_id = $1 and g.merged_into_guardian_id is null
      order by name`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.student_user_id,
    systemId: r.system_id,
    name: r.name,
    relationship: r.relationship,
    isPrimary: r.is_primary,
    className: r.class_name,
    schoolId: r.school_id,
  }));
}
