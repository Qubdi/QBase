import dns from 'node:dns/promises';
import net from 'node:net';

export class ForbiddenTargetError extends Error {
    constructor(host: string, why: string) {
        super(
            `Connections to ${host} are blocked (${why}). ` +
                `Ask the server admin to add it to INTROSPECT_ALLOW_HOSTS.`
        );
        this.name = 'ForbiddenTargetError';
    }
}

export type IpClass =
    | 'public'
    | 'loopback'
    | 'private'
    | 'link_local'
    | 'unspecified'
    | 'multicast'
    | 'reserved';

const toBytesV4 = (ip: string): number[] => ip.split('.').map(Number);

/** Parses any IPv6 text form (::, embedded IPv4) into 16 bytes. */
export function parseIPv6(ip: string): number[] | null {
    let text = ip.split('%')[0].toLowerCase();
    let tail: number[] = [];
    const lastColon = text.lastIndexOf(':');
    if (text.includes('.')) {
        const v4 = text.slice(lastColon + 1);
        if (net.isIPv4(v4)) {
            const b = toBytesV4(v4);
            tail = b;
            text = `${text.slice(0, lastColon + 1)}0:0`;
        } else {
            return null;
        }
    }
    const halves = text.split('::');
    if (halves.length > 2) return null;
    const parse = (s: string) =>
        s === '' ? [] : s.split(':').map((g) => parseInt(g, 16));
    const head = parse(halves[0]);
    const rest = halves.length === 2 ? parse(halves[1]) : [];
    const groups =
        halves.length === 2
            ? [...head, ...Array(8 - head.length - rest.length).fill(0), ...rest]
            : head;
    if (groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g > 0xffff)) {
        return null;
    }
    const bytes = groups.flatMap((g) => [g >> 8, g & 255]);
    if (tail.length === 4) {
        bytes.splice(12, 4, ...tail);
    }
    return bytes;
}

function classifyV4(b: number[]): IpClass {
    const [a, c] = b;
    if (a === 0) return 'unspecified';
    if (a === 127) return 'loopback';
    if (a === 10) return 'private';
    if (a === 172 && c >= 16 && c <= 31) return 'private';
    if (a === 192 && c === 168) return 'private';
    if (a === 100 && c >= 64 && c <= 127) return 'private'; // CGNAT
    if (a === 169 && c === 254) return 'link_local'; // incl. cloud metadata
    if (a >= 224 && a <= 239) return 'multicast';
    if (a >= 240) return 'reserved';
    if (a === 192 && c === 0 && b[2] === 0) return 'reserved';
    if (a === 192 && c === 0 && b[2] === 2) return 'reserved';
    if (a === 198 && (c === 18 || c === 19)) return 'reserved';
    if (a === 198 && c === 51 && b[2] === 100) return 'reserved';
    if (a === 203 && c === 0 && b[2] === 113) return 'reserved';
    return 'public';
}

export function classifyIp(ip: string): IpClass {
    if (net.isIPv4(ip)) return classifyV4(toBytesV4(ip));
    const b = net.isIPv6(ip) ? parseIPv6(ip) : null;
    if (!b) return 'reserved'; // unparseable: never trust it
    if (b.every((x) => x === 0)) return 'unspecified';
    if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return 'loopback';
    // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::/96) carry an IPv4 target
    if (
        b.slice(0, 10).every((x) => x === 0) &&
        b[10] === 0xff &&
        b[11] === 0xff
    ) {
        return classifyV4(b.slice(12));
    }
    // IPv4-translated (::ffff:0:a.b.c.d, RFC 2765) names an IPv4 target the same way
    if (
        b.slice(0, 8).every((x) => x === 0) &&
        b[8] === 0xff &&
        b[9] === 0xff &&
        b[10] === 0 &&
        b[11] === 0
    ) {
        return classifyV4(b.slice(12));
    }
    if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
        // 64:ff9b::/96 holds the IPv4 address in its last four bytes; the rest of
        // 64:ff9b::/32 (the local-use 64:ff9b:1::/48 included) puts it elsewhere
        return b.slice(4, 12).every((x) => x === 0)
            ? classifyV4(b.slice(12))
            : 'reserved';
    }
    // transition ranges that wrap an IPv4 address in a form the checks above do
    // not decode: never a place to connect to
    if (b[0] === 0x20 && b[1] === 0x02) return 'reserved'; // 6to4, 2002::/16
    if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0 && b[3] === 0) {
        return 'reserved'; // Teredo, 2001::/32
    }
    if (b.slice(0, 12).every((x) => x === 0)) return 'reserved'; // ::a.b.c.d, ::/96
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return 'link_local';
    if ((b[0] & 0xfe) === 0xfc) return 'private'; // fc00::/7
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return 'private'; // fec0::/10, deprecated site-local
    if (b[0] === 0xff) return 'multicast';
    if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) {
        return 'reserved'; // documentation range
    }
    return 'public';
}

const ipv4ToInt = (ip: string) =>
    toBytesV4(ip).reduce((acc, n) => acc * 256 + n, 0);

/** Does `ip` match an allow-list entry (exact IP or IPv4 CIDR)? */
export function matchesIpEntry(ip: string, entry: string): boolean {
    if (entry.includes('/')) {
        const [base, bitsText] = entry.split('/');
        const bits = Number(bitsText);
        if (!net.isIPv4(base) || !net.isIPv4(ip)) return false;
        if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
        const size = 2 ** (32 - bits);
        return (
            Math.floor(ipv4ToInt(ip) / size) ===
            Math.floor(ipv4ToInt(base) / size)
        );
    }
    return entry.toLowerCase() === ip.toLowerCase();
}

/** The widest IPv4 range an allow-list entry may name: a /8 is 16 million addresses. */
export const MIN_ALLOW_CIDR_BITS = 8;

/**
 * Why `entry` is not a usable INTROSPECT_ALLOW_HOSTS entry (a host name, an IP
 * or an IPv4 CIDR), or null when it is. A typo would otherwise match nothing
 * and a `0.0.0.0/0` would match everything, both without a word.
 */
export function allowEntryProblem(entry: string): string | null {
    if (entry.includes('/')) {
        const [base, bitsText, ...extra] = entry.split('/');
        if (extra.length > 0 || !net.isIPv4(base)) return 'a range must be an IPv4 address and a prefix length, like 10.1.0.0/16';
        if (!/^\d{1,2}$/.test(bitsText) || Number(bitsText) > 32) return 'the prefix length must be 0 to 32';
        if (Number(bitsText) < MIN_ALLOW_CIDR_BITS) {
            return `/${bitsText} is far too wide: ranges must be /${MIN_ALLOW_CIDR_BITS} or narrower`;
        }
        return null;
    }
    if (net.isIP(entry) !== 0) return null;
    // a host name: letters, digits, dots and hyphens
    return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(entry) && !entry.includes('..')
        ? null
        : 'not a host name, an IP address or a range';
}

export interface ResolvedTarget {
    address: string;
    family: 4 | 6;
}

export type LookupAll = (
    host: string
) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: LookupAll = (host) => dns.lookup(host, { all: true });

/**
 * Resolves a host and refuses private/loopback/link-local targets unless the
 * hostname or the resolved IP is in the allow-list. The caller must connect to
 * the returned address (not the hostname) so DNS cannot change in between.
 */
export async function resolveAllowedTarget(
    host: string,
    allow: string[] = [],
    lookup: LookupAll = defaultLookup
): Promise<ResolvedTarget> {
    // "[::1]" is a valid way to write an IPv6 literal in a URL; unwrap it so it
    // is classified as the address it is instead of being sent to DNS as a name
    const trimmed = host.trim().replace(/^\[(.*)\]$/, '$1');
    if (trimmed === '') throw new ForbiddenTargetError(host, 'empty host');
    const allowHost = allow.some(
        (a) => !a.includes('/') && a.toLowerCase() === trimmed.toLowerCase()
    );

    const addrs = net.isIP(trimmed)
        ? [{ address: trimmed, family: net.isIPv6(trimmed) ? 6 : 4 }]
        : await lookup(trimmed).catch(() => {
              throw new ForbiddenTargetError(host, 'host did not resolve');
          });
    if (addrs.length === 0) {
        throw new ForbiddenTargetError(host, 'host did not resolve');
    }

    for (const { address } of addrs) {
        const cls = classifyIp(address);
        if (cls === 'public') continue;
        const allowed =
            allowHost || allow.some((entry) => matchesIpEntry(address, entry));
        if (!allowed) {
            // the class only: the address a typed name resolves to is not for the
            // caller to learn, or any name would map the internal network
            throw new ForbiddenTargetError(host, `${cls} address`);
        }
    }
    const first = addrs[0];
    return { address: first.address, family: first.family === 6 ? 6 : 4 };
}
