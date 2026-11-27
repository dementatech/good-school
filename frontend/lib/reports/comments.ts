/**
 * Auto-generated report card comments for the class teacher and head teacher,
 * written from the learner's average (A-Level: principal average). Six tiers
 * follow the usual grade bands. Each tier has two wordings per role, picked
 * by the learner's id, so a class doesn't read as one comment copied down the
 * page; the same learner always gets the same wording.
 */

type Tier = 'excellent' | 'veryGood' | 'good' | 'fair' | 'weak' | 'poor';

function tierOf(average: number): Tier {
  if (average >= 80) return 'excellent';
  if (average >= 70) return 'veryGood';
  if (average >= 60) return 'good';
  if (average >= 50) return 'fair';
  if (average >= 40) return 'weak';
  return 'poor';
}

// {name} is the learner's first name.
const CLASS_TEACHER: Record<Tier, string[]> = {
  excellent: [
    '{name} has produced excellent work this term and shows a strong grasp of every subject. Keep up the hard work, consistency and positive attitude in class.',
    'An outstanding performance. {name} is focused, works independently and takes part actively in lessons. Keep aiming high and keep helping others.',
  ],
  veryGood: [
    '{name} has performed very well this term and is clearly committed to learning. With a little more effort in the weaker subjects, top grades are within reach.',
    'A very good result. {name} is attentive and hardworking; more practice and revision will turn these good grades into excellent ones.',
  ],
  good: [
    '{name} has done good work this term. There is room to improve: more revision, regular practice and asking questions in class will lift these results.',
    'A good effort from {name}. Better time management and more consistent revision will help reach a higher grade next term.',
  ],
  fair: [
    '{name} has shown fair performance this term. More effort, regular revision and completing all assignments on time are needed to improve.',
    'A fair result. {name} can do better by concentrating more in class, revising daily and seeking help in difficult subjects.',
  ],
  weak: [
    '{name} has not performed well this term. Much more effort is needed: attend every lesson, revise daily and seek help from subject teachers.',
    'A weak performance. {name} needs to work harder, revise consistently and make use of teachers’ guidance to improve next term.',
  ],
  poor: [
    '{name}’s performance this term is poor and is a serious concern. Close follow-up at home and at school, and a lot more effort, are needed to improve.',
    'Very low results this term. {name} must take studies far more seriously; we request a meeting with the parent to agree on a plan for improvement.',
  ],
};

const HEAD_TEACHER: Record<Tier, string[]> = {
  excellent: [
    'Excellent results. {name} is a role model to others; keep up this high standard of work and discipline.',
    'Congratulations on an outstanding performance, {name}. Maintain this excellence.',
  ],
  veryGood: [
    'Very good performance, {name}. Keep working hard and aim for excellence next term.',
    'A very good report. {name} has the ability to reach the top; keep pushing.',
  ],
  good: [
    'Good work, {name}. Greater effort and focus will bring even better results.',
    'A good report. {name} should aim higher by revising more consistently.',
  ],
  fair: [
    'Fair results, {name}. More hard work and commitment are required next term.',
    '{name} can do much better. Work harder and make better use of study time.',
  ],
  weak: [
    'Below expectations, {name}. A lot more effort and seriousness are needed next term.',
    'Weak results. {name} must improve; the school and parents should follow up closely.',
  ],
  poor: [
    'Poor performance. {name} needs urgent improvement; the parent is requested to see the school.',
    'Very poor results, {name}. Serious effort and close supervision are required immediately.',
  ],
};

function pick(options: string[], seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return options[Math.abs(hash) % options.length];
}

/** First name for the comment (names are stored first name first): "JAMES Okello" → "James". */
function firstNameOf(fullName: string): string {
  const name = fullName.trim().split(/\s+/)[0] ?? '';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export function reportComments(
  average: number | null,
  studentName: string,
  studentId: string,
): { classTeacher: string; headTeacher: string } | null {
  if (average === null) return null;
  const tier = tierOf(average);
  const name = firstNameOf(studentName) || 'The learner';
  const fill = (t: string) => t.replace(/\{name\}/g, name);
  return {
    classTeacher: fill(pick(CLASS_TEACHER[tier], `${studentId}:ct`)),
    headTeacher: fill(pick(HEAD_TEACHER[tier], `${studentId}:ht`)),
  };
}
