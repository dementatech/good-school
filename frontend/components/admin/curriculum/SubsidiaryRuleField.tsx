'use client';

import { PRINCIPALS_PER_COMBINATION, subsidiaryRuleFor, unebSubjectName } from '@/lib/uneb';

export interface SubsidiaryOption {
  id: string;
  name: string;
  unebCode: string | null;
}

/**
 * The subsidiary ids a combination form should submit. Where UNEB fixes the
 * subsidiary it's that one (or nothing, letting the server add it / explain
 * why it can't); otherwise whatever the admin ticked — an empty list lets the
 * server offer both Sub-Maths and Sub-ICT.
 */
export function effectiveSubsidiaryIds(
  principalCodes: (string | null)[],
  options: SubsidiaryOption[],
  chosen: string[],
): string[] {
  const rule = subsidiaryRuleFor(principalCodes);
  if (!rule.required) return chosen;
  const required = options.find((o) => o.unebCode === rule.required);
  return required ? [required.id] : [];
}

// Shows the UNEB subsidiary rule for the picked principals: a locked choice
// where the rule fixes it, a tick list where the student may choose.
export function SubsidiaryRuleField({
  principalCount,
  principalCodes,
  options,
  value,
  onChange,
  missingRequiredHint,
}: {
  principalCount: number;
  principalCodes: (string | null)[];
  options: SubsidiaryOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Shown when the rule's subsidiary isn't among `options`. */
  missingRequiredHint: string;
}) {
  if (principalCount !== PRINCIPALS_PER_COMBINATION) {
    return (
      <p className="text-xs text-text-faint">
        Pick {PRINCIPALS_PER_COMBINATION} principal subjects first — the subsidiary follows from them.
      </p>
    );
  }

  const rule = subsidiaryRuleFor(principalCodes);
  if (rule.required) {
    const required = options.find((o) => o.unebCode === rule.required);
    return (
      <div className="rounded-lg bg-bg-subtle px-3 py-2 text-sm space-y-0.5">
        <p className="font-medium">{required?.name ?? unebSubjectName(rule.required)}</p>
        <p className="text-xs text-text-muted">UNEB rule: {rule.reason}.</p>
        {!required && <p className="text-xs text-warning">{missingRequiredHint}</p>}
      </div>
    );
  }

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-text-muted">
        {rule.reason}. Tick the options students choose between — leave all unticked to offer both
        Subsidiary Mathematics and Subsidiary ICT.
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.id}
            className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-sm border ${
              value.includes(o.id) ? 'bg-primary-700 text-white border-primary-700' : 'border-border text-text-secondary'
            }`}
          >
            <input type="checkbox" className="sr-only" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
            {o.name}
          </label>
        ))}
      </div>
    </div>
  );
}
