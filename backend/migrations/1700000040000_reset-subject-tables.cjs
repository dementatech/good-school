/* eslint-disable */
exports.shorthands = undefined;

// Hard reset of the subject/combination subsystem and everything hanging off
// it — drops and recreates all 12 tables so production starts from a clean,
// empty slate on the current schema instead of carrying forward whatever
// pre-this-feature data is sitting in them. THIS IS DESTRUCTIVE: every row in
// subject, subject_stage, subject_combination, combination_subject,
// school_combination, school_combination_subject, subject_offering,
// student_subject, student_combination, subject_teacher_assignment,
// staff_subject_specialization, and department_subject is permanently
// deleted when this migration runs. Recreated shape is copied verbatim
// (via `pg_dump --schema-only`) from the schema produced by migrations
// 12000 through 39000 — not retyped by hand — so it matches exactly.
//
// Run this only when you intend to wipe that data (e.g. production has no
// real subject/combination/enrollment data yet worth keeping). There is no
// way to recover the dropped rows after this runs.

exports.up = (pgm) => {
  // Children first.
  pgm.sql(`
    drop table if exists department_subject;
    drop table if exists staff_subject_specialization;
    drop table if exists subject_teacher_assignment;
    drop table if exists student_subject;
    drop table if exists student_combination;
    drop table if exists subject_offering;
    drop table if exists school_combination_subject;
    drop table if exists school_combination;
    drop table if exists combination_subject;
    drop table if exists subject_combination;
    drop table if exists subject_stage;
    drop table if exists subject;
  `);

  pgm.sql(`
    CREATE TABLE public.subject (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        curriculum_id uuid NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        category text DEFAULT 'core'::text NOT NULL,
        is_examinable boolean DEFAULT true NOT NULL,
        is_active boolean DEFAULT true NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        phase text NOT NULL,
        short_name text NOT NULL,
        status text DEFAULT 'approved'::text NOT NULL,
        proposed_by_school_id uuid,
        reviewed_by uuid,
        reviewed_at timestamp with time zone,
        rejection_reason text,
        is_general_paper boolean DEFAULT false NOT NULL,
        CONSTRAINT subject_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
    );

    CREATE TABLE public.subject_stage (
        subject_id uuid NOT NULL,
        curriculum_stage_id uuid NOT NULL
    );

    CREATE TABLE public.subject_combination (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        curriculum_id uuid NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        description text,
        is_active boolean DEFAULT true NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE public.combination_subject (
        combination_id uuid NOT NULL,
        subject_id uuid NOT NULL,
        role text NOT NULL,
        CONSTRAINT combination_subject_role_check CHECK ((role = ANY (ARRAY['principal'::text, 'subsidiary'::text, 'compulsory'::text])))
    );

    CREATE TABLE public.school_combination (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        school_id uuid NOT NULL,
        academic_year_id uuid NOT NULL,
        catalog_combination_id uuid,
        code text NOT NULL,
        name text NOT NULL,
        description text,
        is_offered boolean DEFAULT true NOT NULL,
        min_class_size integer,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE public.school_combination_subject (
        school_combination_id uuid NOT NULL,
        subject_id uuid NOT NULL,
        role text NOT NULL,
        CONSTRAINT school_combination_subject_role_check CHECK ((role = ANY (ARRAY['principal'::text, 'subsidiary'::text, 'compulsory'::text])))
    );

    CREATE TABLE public.subject_offering (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        school_id uuid NOT NULL,
        subject_id uuid NOT NULL,
        academic_year_id uuid NOT NULL,
        is_offered boolean DEFAULT true NOT NULL,
        is_compulsory boolean DEFAULT false NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE public.student_subject (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        student_user_id uuid NOT NULL,
        school_id uuid NOT NULL,
        subject_id uuid NOT NULL,
        academic_year_id uuid NOT NULL,
        status text DEFAULT 'active'::text NOT NULL,
        status_changed_at timestamp with time zone DEFAULT now() NOT NULL,
        status_changed_by uuid,
        reason text,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT student_subject_status_check CHECK ((status = ANY (ARRAY['active'::text, 'dropped'::text, 'added'::text])))
    );

    CREATE TABLE public.student_combination (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        student_user_id uuid NOT NULL,
        school_id uuid NOT NULL,
        school_combination_id uuid NOT NULL,
        subsidiary_subject_id uuid,
        academic_year_id uuid NOT NULL,
        status text DEFAULT 'confirmed'::text NOT NULL,
        selected_at timestamp with time zone DEFAULT now() NOT NULL,
        confirmed_by uuid,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT student_combination_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'reassigned'::text])))
    );

    CREATE TABLE public.subject_teacher_assignment (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        school_id uuid NOT NULL,
        subject_id uuid NOT NULL,
        academic_year_id uuid NOT NULL,
        class_id uuid NOT NULL,
        stream_id uuid,
        staff_id uuid NOT NULL,
        is_lead boolean DEFAULT true NOT NULL,
        status text DEFAULT 'active'::text NOT NULL,
        start_date date NOT NULL,
        end_date date,
        assigned_by uuid,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT subject_teacher_assignment_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text])))
    );

    CREATE TABLE public.staff_subject_specialization (
        staff_id uuid NOT NULL,
        subject_id uuid NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE public.department_subject (
        department_id uuid NOT NULL,
        subject_id uuid NOT NULL
    );

    ALTER TABLE ONLY public.subject ADD CONSTRAINT subject_pkey PRIMARY KEY (id);
    ALTER TABLE ONLY public.subject_stage ADD CONSTRAINT subject_stage_pkey PRIMARY KEY (subject_id, curriculum_stage_id);
    ALTER TABLE ONLY public.subject_combination ADD CONSTRAINT subject_combination_pkey PRIMARY KEY (id);
    ALTER TABLE ONLY public.combination_subject ADD CONSTRAINT combination_subject_pkey PRIMARY KEY (combination_id, subject_id);
    ALTER TABLE ONLY public.school_combination ADD CONSTRAINT school_combination_pkey PRIMARY KEY (id);
    ALTER TABLE ONLY public.school_combination_subject ADD CONSTRAINT school_combination_subject_pkey PRIMARY KEY (school_combination_id, subject_id);
    ALTER TABLE ONLY public.subject_offering ADD CONSTRAINT subject_offering_pkey PRIMARY KEY (id);
    ALTER TABLE ONLY public.student_subject ADD CONSTRAINT student_subject_pkey PRIMARY KEY (id);
    ALTER TABLE ONLY public.student_combination ADD CONSTRAINT student_combination_pkey PRIMARY KEY (id);
    ALTER TABLE ONLY public.subject_teacher_assignment ADD CONSTRAINT subject_teacher_assignment_pkey PRIMARY KEY (id);
    ALTER TABLE ONLY public.staff_subject_specialization ADD CONSTRAINT staff_subject_specialization_pkey PRIMARY KEY (staff_id, subject_id);
    ALTER TABLE ONLY public.department_subject ADD CONSTRAINT department_subject_pkey PRIMARY KEY (department_id, subject_id);

    CREATE UNIQUE INDEX subject_curriculum_id_phase_code_unique_index ON public.subject USING btree (curriculum_id, phase, code);
    CREATE UNIQUE INDEX subject_curriculum_id_phase_short_name_unique_index ON public.subject USING btree (curriculum_id, phase, short_name);
    CREATE INDEX subject_curriculum_id_phase_index ON public.subject USING btree (curriculum_id, phase);
    CREATE UNIQUE INDEX subject_one_general_paper_per_curriculum ON public.subject USING btree (curriculum_id) WHERE is_general_paper;
    CREATE UNIQUE INDEX subject_combination_curriculum_id_code_unique_index ON public.subject_combination USING btree (curriculum_id, code);
    CREATE UNIQUE INDEX school_combination_school_year_code_unique ON public.school_combination USING btree (school_id, academic_year_id, code);
    CREATE INDEX subject_offering_school_id_academic_year_id_index ON public.subject_offering USING btree (school_id, academic_year_id);
    CREATE UNIQUE INDEX subject_offering_school_subject_year_unique ON public.subject_offering USING btree (school_id, subject_id, academic_year_id);
    CREATE INDEX student_subject_school_id_academic_year_id_subject_id_index ON public.student_subject USING btree (school_id, academic_year_id, subject_id);
    CREATE UNIQUE INDEX student_subject_student_subject_year_unique ON public.student_subject USING btree (student_user_id, subject_id, academic_year_id);
    CREATE UNIQUE INDEX student_combination_one_current_per_year ON public.student_combination USING btree (student_user_id, school_id, academic_year_id) WHERE (status <> 'reassigned'::text);
    CREATE INDEX student_combination_school_combination_id_index ON public.student_combination USING btree (school_combination_id);
    CREATE INDEX subject_teacher_assignment_lookup ON public.subject_teacher_assignment USING btree (school_id, academic_year_id, subject_id, class_id);
    CREATE UNIQUE INDEX subject_teacher_assignment_one_active_lead ON public.subject_teacher_assignment USING btree (school_id, subject_id, academic_year_id, class_id, COALESCE(stream_id, '00000000-0000-0000-0000-000000000000'::uuid), staff_id) WHERE ((status = 'active'::text) AND (is_lead = true));
    CREATE INDEX subject_teacher_assignment_staff_id_index ON public.subject_teacher_assignment USING btree (staff_id);
    CREATE INDEX staff_subject_specialization_subject_id_index ON public.staff_subject_specialization USING btree (subject_id);
    CREATE INDEX department_subject_subject_id_index ON public.department_subject USING btree (subject_id);

    ALTER TABLE ONLY public.subject ADD CONSTRAINT subject_curriculum_id_fkey FOREIGN KEY (curriculum_id) REFERENCES public.curriculum(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.subject ADD CONSTRAINT subject_proposed_by_school_id_fkey FOREIGN KEY (proposed_by_school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
    ALTER TABLE ONLY public.subject ADD CONSTRAINT subject_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.subject_stage ADD CONSTRAINT subject_stage_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.subject_stage ADD CONSTRAINT subject_stage_curriculum_stage_id_fkey FOREIGN KEY (curriculum_stage_id) REFERENCES public.curriculum_stage(id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.subject_combination ADD CONSTRAINT subject_combination_curriculum_id_fkey FOREIGN KEY (curriculum_id) REFERENCES public.curriculum(id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.combination_subject ADD CONSTRAINT combination_subject_combination_id_fkey FOREIGN KEY (combination_id) REFERENCES public.subject_combination(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.combination_subject ADD CONSTRAINT combination_subject_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.school_combination ADD CONSTRAINT school_combination_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.school_combination ADD CONSTRAINT school_combination_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.school_combination ADD CONSTRAINT school_combination_catalog_combination_id_fkey FOREIGN KEY (catalog_combination_id) REFERENCES public.subject_combination(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.school_combination_subject ADD CONSTRAINT school_combination_subject_school_combination_id_fkey FOREIGN KEY (school_combination_id) REFERENCES public.school_combination(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.school_combination_subject ADD CONSTRAINT school_combination_subject_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(id) ON DELETE RESTRICT;

    ALTER TABLE ONLY public.subject_offering ADD CONSTRAINT subject_offering_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.subject_offering ADD CONSTRAINT subject_offering_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.subject_offering ADD CONSTRAINT subject_offering_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.student_subject ADD CONSTRAINT student_subject_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.student_subject ADD CONSTRAINT student_subject_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.student_subject ADD CONSTRAINT student_subject_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(id) ON DELETE RESTRICT;
    ALTER TABLE ONLY public.student_subject ADD CONSTRAINT student_subject_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.student_subject ADD CONSTRAINT student_subject_status_changed_by_fkey FOREIGN KEY (status_changed_by) REFERENCES public.users(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.student_combination ADD CONSTRAINT student_combination_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.student_combination ADD CONSTRAINT student_combination_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.student_combination ADD CONSTRAINT student_combination_school_combination_id_fkey FOREIGN KEY (school_combination_id) REFERENCES public.school_combination(id) ON DELETE RESTRICT;
    ALTER TABLE ONLY public.student_combination ADD CONSTRAINT student_combination_subsidiary_subject_id_fkey FOREIGN KEY (subsidiary_subject_id) REFERENCES public.subject(id) ON DELETE RESTRICT;
    ALTER TABLE ONLY public.student_combination ADD CONSTRAINT student_combination_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.student_combination ADD CONSTRAINT student_combination_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.users(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.subject_teacher_assignment ADD CONSTRAINT subject_teacher_assignment_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.subject_teacher_assignment ADD CONSTRAINT subject_teacher_assignment_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(id) ON DELETE RESTRICT;
    ALTER TABLE ONLY public.subject_teacher_assignment ADD CONSTRAINT subject_teacher_assignment_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE RESTRICT;
    ALTER TABLE ONLY public.subject_teacher_assignment ADD CONSTRAINT subject_teacher_assignment_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE RESTRICT;
    ALTER TABLE ONLY public.subject_teacher_assignment ADD CONSTRAINT subject_teacher_assignment_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.streams(id) ON DELETE RESTRICT;
    ALTER TABLE ONLY public.subject_teacher_assignment ADD CONSTRAINT subject_teacher_assignment_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(user_id) ON DELETE RESTRICT;
    ALTER TABLE ONLY public.subject_teacher_assignment ADD CONSTRAINT subject_teacher_assignment_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.staff_subject_specialization ADD CONSTRAINT staff_subject_specialization_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(user_id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.staff_subject_specialization ADD CONSTRAINT staff_subject_specialization_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.department_subject ADD CONSTRAINT department_subject_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.department(id) ON DELETE CASCADE;
    ALTER TABLE ONLY public.department_subject ADD CONSTRAINT department_subject_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(id) ON DELETE CASCADE;
  `);

  // `curriculum` itself isn't touched by this reset, so every existing
  // curriculum just lost 100% of its subjects, including General Paper.
  // Reseed the GP constant for each of them now — same logic as
  // subjects.repository.ts's `ensureGeneralPaperSubject` — so the "every
  // A-Level curriculum has an approved GP" invariant holds again the moment
  // this migration finishes, not only for curricula created afterward.
  pgm.sql(`
    do $$
    declare
      cur record;
      next_code text;
    begin
      for cur in select id from curriculum loop
        if not exists (select 1 from subject where curriculum_id = cur.id and is_general_paper) then
          select 'S' || lpad((coalesce(max((substring(code from '^S([0-9]+)$'))::int), 0) + 1)::text, 3, '0')
            into next_code
            from subject
            where curriculum_id = cur.id and phase = 'A_LEVEL' and code ~ '^S[0-9]+$';
          insert into subject
            (curriculum_id, phase, code, short_name, name, category, is_examinable, is_active, status, is_general_paper)
          values
            (cur.id, 'A_LEVEL', next_code, 'GP', 'General Paper', 'subsidiary', true, true, 'approved', true);
        end if;
      end loop;
    end $$;
  `);
};

// No down migration — this is a one-way reset. If you need the old data
// back, restore from a backup taken before running this.
exports.down = false;
