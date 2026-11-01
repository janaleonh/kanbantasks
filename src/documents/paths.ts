import type { NasInput } from './types';

export function safeSegments(path: string): string[] {
  if (/[\\\u0000-\u001F]/.test(path)) throw new Error('Der Ordnerpfad enthält ungültige Zeichen.');
  const segments = path.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) throw new Error('Übergeordnete Pfade sind nicht erlaubt.');
  return segments;
}

export function normalizeServer(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Bitte gib die vollständige NAS-Adresse ein, z. B. https://nas.example.de:5006.'); }
  if (url.protocol !== 'https:') throw new Error('Bitte verwende eine HTTPS-Adresse für dein NAS.');
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new Error('Trage nur die NAS-Adresse ein. Benutzer und Startordner haben eigene Felder.');
  return url.origin;
}

export function normalizeInput(input: NasInput): NasInput {
  if (!input.username.trim() || input.username.includes(':')) throw new Error('Bitte gib einen gültigen NAS-Benutzernamen ohne Doppelpunkt ein.');
  const homeNetwork = normalizeNetwork(input.homeNetwork);
  return { server: normalizeServer(input.server), root: `/${safeSegments(input.root.trim()).join('/')}`, username: input.username.trim(), homeNetwork, autoSync: !!input.autoSync };
}

export function remoteUrl(config: Pick<NasInput, 'server' | 'root'>, path: string, directory = false) {
  const segments = [...safeSegments(config.root), ...safeSegments(path)];
  return `${normalizeServer(config.server)}/${segments.map(encodeURIComponent).join('/')}${directory && segments.length ? '/' : ''}`;
}

export function relativeHref(href: string, config: Pick<NasInput, 'server' | 'root'>, requestedPath: string): string | null {
  try {
    // Inspect decoded segments before URL normalizes literal dot traversal.
    const rawPath = href.replace(/^https:\/\/[^/]+/i, '').split(/[?#]/)[0];
    if (rawPath.split('/').some((segment) => {
      const decoded = decodeURIComponent(segment);
      return decoded === '.' || decoded === '..' || /[/\\\u0000-\u001F]/.test(decoded);
    })) return null;
    const url = new URL(href, remoteUrl(config, requestedPath, true));
    if (url.origin !== normalizeServer(config.server) || url.username || url.password || url.search || url.hash) return null;
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (segments.some((segment) => /[/\\\u0000-\u001F]/.test(segment))) return null;
    const root = safeSegments(config.root);
    if (root.some((segment, index) => segments[index] !== segment)) return null;
    return segments.slice(root.length).join('/');
  } catch { return null; }
}

export function parentPath(path: string) { return safeSegments(path).slice(0, -1).join('/'); }
export function isWithin(path: string, folder: string) { return folder === '' || path === folder || path.startsWith(`${folder}/`); }

function ipv4(value: string) {
  const parts = value.split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) throw new Error('Bitte gib einen gültigen IPv4-Heimnetzbereich an, z. B. 192.168.178.0/24.');
  return parts.reduce((number, part) => ((number << 8) | Number(part)) >>> 0, 0);
}

export function normalizeNetwork(value: string) {
  const [address, prefix, extra] = value.trim().split('/');
  if (extra !== undefined || !prefix || !/^\d{1,2}$/.test(prefix) || Number(prefix) < 8 || Number(prefix) > 32) throw new Error('Bitte übernimm dein Heim-WLAN oder trage einen gültigen Heimnetzbereich mit /8 bis /32 ein.');
  const number = ipv4(address);
  const mask = (0xffffffff << (32 - Number(prefix))) >>> 0;
  const network = (number & mask) >>> 0;
  const privateAddress = (n: number) => (n >>> 24) === 10 || (n >>> 20) === 0xac1 || (n >>> 16) === 0xc0a8;
  const last = (network | (~mask >>> 0)) >>> 0;
  if ((!privateAddress(network) || !privateAddress(last)) && Number(prefix) < 24) throw new Error('Für einen nicht privaten Adressbereich verwende bitte ein enges Heimnetz mit /24 bis /32.');
  return `${[24, 16, 8, 0].map((bits) => (network >>> bits) & 255).join('.')}/${Number(prefix)}`;
}

export function networkMatches(address: string | null | undefined, network: string) {
  if (!address) return false;
  try {
    const [base, prefix] = normalizeNetwork(network).split('/');
    const mask = (0xffffffff << (32 - Number(prefix))) >>> 0;
    return ((ipv4(address) & mask) >>> 0) === ipv4(base);
  } catch { return false; }
}

export function detectedNetwork(address: string, subnet?: string | null) {
  let prefix = 24;
  if (subnet) {
    const binary = ipv4(subnet).toString(2).padStart(32, '0');
    if (!/^1+0*$/.test(binary)) throw new Error('Der WLAN-Netzbereich konnte nicht bestimmt werden. Bitte trage ihn manuell ein.');
    prefix = binary.indexOf('0') < 0 ? 32 : binary.indexOf('0');
  }
  return normalizeNetwork(`${address}/${prefix}`);
}

export function formatBytes(bytes: number | null) {
  if (bytes === null) return 'Größe unbekannt';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
}
