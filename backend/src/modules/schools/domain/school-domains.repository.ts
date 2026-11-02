import { resolve4, resolve6 } from "node:dns/promises";
import { pool } from "../../../shared/db/index.js";

// A school's own web address. This module records the domain and checks its
// DNS; nginx and HTTPS are set up on the host by
// deploy/domains/provision-domains.sh, which watches the school_domain table,
// so the app container never needs root on the server.

export type SchoolDomainStatus = "pending_dns" | "provisioning" | "active" | "failed" | "removing";

export interface SchoolDomain {
  domain: string;
  status: SchoolDomainStatus;
  lastError: string | null;
  activatedAt: string | null;
  /** The address the school's DNS record must point at. */
  serverIp: string | null;
}

export class InvalidDomainError extends Error {}
export class DomainTakenError extends Error {}
export class DomainInUseError extends Error {}

/** Must stay in step with the check in deploy/domains/provision-domains.sh. */
const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const defaultAppUrl = () => process.env.APP_URL ?? "http://localhost:3000";
const serverIp = () => process.env.SERVER_PUBLIC_IP?.trim() || null;

/** Accepts what people paste ("https://Portal.School.ac.ug/") and returns the bare host. */
export function normalizeDomain(input: string): string {
  const domain = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
  if (!DOMAIN_PATTERN.test(domain)) {
    throw new InvalidDomainError("Enter a domain like portal.yourschool.ac.ug.");
  }
  const platformHosts = [hostOfUrl(defaultAppUrl()), ...(process.env.PLATFORM_HOSTS ?? "").split(",")];
  if (platformHosts.map((h) => h.trim().toLowerCase()).includes(domain)) {
    throw new InvalidDomainError("That's Good School's own address, so a school can't use it.");
  }
  return domain;
}

function hostOfUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** The host a request came in on, without its port. nginx passes it through as-is. */
export function hostFromHeader(header: string | undefined): string {
  return (header ?? "").split(":")[0].trim().toLowerCase();
}

interface Row {
  domain: string;
  status: SchoolDomainStatus;
  last_error: string | null;
  activated_at: string | null;
}

const toRecord = (r: Row): SchoolDomain => ({
  domain: r.domain,
  status: r.status,
  lastError: r.last_error,
  activatedAt: r.activated_at,
  serverIp: serverIp(),
});

const COLUMNS = "domain, status, last_error, activated_at";

/** What a school with no domain yet still needs: where a record would point. */
export async function getSchoolDomain(schoolId: string): Promise<SchoolDomain | { domain: null; serverIp: string | null }> {
  const { rows } = await pool.query<Row>(`select ${COLUMNS} from school_domain where school_id = $1`, [schoolId]);
  return rows[0] ? toRecord(rows[0]) : { domain: null, serverIp: serverIp() };
}

/** Sets the domain to wait for DNS. A domain set up on the host has to be removed first. */
export async function setSchoolDomain(schoolId: string, input: string, createdBy: string): Promise<SchoolDomain> {
  const domain = normalizeDomain(input);
  try {
    const { rows } = await pool.query<Row>(
      `insert into school_domain (school_id, domain, created_by)
       values ($1, $2, $3)
       on conflict (school_id) do update
         set domain = excluded.domain, status = 'pending_dns', last_error = null, updated_at = now()
         where school_domain.status = 'pending_dns'
       returning ${COLUMNS}`,
      [schoolId, domain, createdBy],
    );
    if (!rows[0]) throw new DomainInUseError("Remove this school's current domain first.");
    return toRecord(rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new DomainTakenError("Another school is already using that domain.");
    }
    throw err;
  }
}

export type DnsCheck = { ok: true } | { ok: false; message: string };

/** Let's Encrypt validates over IPv6 if there's an AAAA record, so a stray one
 * fails the certificate even when the A record is right. */
export async function checkDns(domain: string, expectedIp: string): Promise<DnsCheck> {
  let ips: string[];
  try {
    ips = await resolve4(domain);
  } catch {
    return { ok: false, message: `No A record found for ${domain} yet. New records can take a while to appear.` };
  }
  if (!ips.includes(expectedIp) || ips.length > 1) {
    return { ok: false, message: `${domain} points at ${ips.join(", ")}. It needs to point only at ${expectedIp}.` };
  }
  const ipv6 = await resolve6(domain).catch(() => [] as string[]);
  if (ipv6.length > 0) {
    return { ok: false, message: `${domain} also has an AAAA record (${ipv6.join(", ")}). Remove it, then check again.` };
  }
  return { ok: true };
}

/** Checks DNS and, if it's right, hands the domain to the host job. */
export async function verifySchoolDomain(schoolId: string): Promise<SchoolDomain | null> {
  const { rows } = await pool.query<Row>(`select ${COLUMNS} from school_domain where school_id = $1`, [schoolId]);
  const current = rows[0];
  if (!current) return null;
  if (current.status !== "pending_dns" && current.status !== "failed") return toRecord(current);
  const expected = serverIp();
  const check: DnsCheck = expected
    ? await checkDns(current.domain, expected)
    : { ok: false, message: "SERVER_PUBLIC_IP isn't set on the server." };
  const updated = await pool.query<Row>(
    `update school_domain
        set status = $2, last_error = $3, updated_at = now()
      where school_id = $1 and status in ('pending_dns', 'failed')
      returning ${COLUMNS}`,
    [schoolId, check.ok ? "provisioning" : "pending_dns", check.ok ? null : check.message],
  );
  return updated.rows[0] ? toRecord(updated.rows[0]) : toRecord(current);
}

/** Drops a domain nothing was set up for; anything else goes to the host job to take down. */
export async function removeSchoolDomain(schoolId: string): Promise<SchoolDomain | null> {
  const removed = await pool.query(`delete from school_domain where school_id = $1 and status = 'pending_dns'`, [schoolId]);
  if (removed.rowCount) return null;
  const { rows } = await pool.query<Row>(
    `update school_domain set status = 'removing', last_error = null, updated_at = now()
      where school_id = $1 returning ${COLUMNS}`,
    [schoolId],
  );
  return rows[0] ? toRecord(rows[0]) : null;
}

/** The school a live custom domain belongs to; null for the platform's own addresses. */
export async function findSchoolIdByActiveDomain(host: string): Promise<string | null> {
  if (!host) return null;
  const { rows } = await pool.query<{ school_id: string }>(
    `select school_id from school_domain where domain = $1 and status = 'active'`,
    [host],
  );
  return rows[0]?.school_id ?? null;
}

/** Where links for this school's people should go: its own address once live. */
export async function appUrlForSchool(schoolId: string | null): Promise<string> {
  if (schoolId) {
    const { rows } = await pool.query<{ domain: string }>(
      `select domain from school_domain where school_id = $1 and status = 'active'`,
      [schoolId],
    );
    if (rows[0]) return `https://${rows[0].domain}`;
  }
  return defaultAppUrl();
}
