// Mirrors backend/src/modules/organization/domain/{department-catalog,
// department,position}.repository.ts

export type DepartmentType = 'academic' | 'non_academic';
export type PositionCategory = 'executive' | 'department_head' | 'teacher' | 'non_teaching';

export interface DepartmentCatalogEntry {
  id: string;
  name: string;
  departmentType: DepartmentType;
}

export interface DepartmentSubject {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
}

export interface Department {
  id: string;
  schoolId: string;
  catalogId: string | null;
  name: string;
  departmentType: DepartmentType;
  createdAt: string;
  subjects: DepartmentSubject[];
  headOfDepartmentPositionId: string | null;
}

export interface PositionHolder {
  staffPositionId: string;
  staffId: string;
  staffName: string;
  staffSystemId: string | null;
  startDate: string;
}

export interface Position {
  id: string;
  schoolId: string;
  title: string;
  category: PositionCategory;
  parentPositionId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  isUnique: boolean;
  isAcademicRoot: boolean;
  createdAt: string;
  holders: PositionHolder[];
}

export interface StaffPosition {
  id: string;
  positionId: string;
  title: string;
  departmentName: string | null;
  academicYearId: string;
  startDate: string;
  endDate: string | null;
  status: 'active' | 'ended';
}

export const DEPARTMENT_TYPE_LABEL: Record<DepartmentType, string> = {
  academic: 'Academic',
  non_academic: 'Non-academic',
};

export const POSITION_CATEGORIES: readonly PositionCategory[] = [
  'executive',
  'department_head',
  'teacher',
  'non_teaching',
];
export const POSITION_CATEGORY_LABEL: Record<PositionCategory, string> = {
  executive: 'Leadership',
  department_head: 'Head of department',
  teacher: 'Teacher',
  non_teaching: 'Non-teaching staff',
};

/** Builds an indented, parent-first ordering of the tree for a flat list render. */
export function orderAsTree(positions: Position[]): { position: Position; depth: number }[] {
  const byParent = new Map<string | null, Position[]>();
  for (const p of positions) {
    const list = byParent.get(p.parentPositionId) ?? [];
    list.push(p);
    byParent.set(p.parentPositionId, list);
  }
  const out: { position: Position; depth: number }[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const p of byParent.get(parentId) ?? []) {
      out.push({ position: p, depth });
      visit(p.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}
