import dns from 'node:dns/promises';
import net from 'node:net';

const blockedHostnames = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  'host.docker.internal',
  'gateway.docker.internal'
]);

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0) >>> 0;
}

function inV4Range(ip, base, bits) {
  const value = ipv4ToInt(ip);
  const baseValue = ipv4ToInt(base);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

export function isPrivateAddress(address) {
  if (!address) return true;
  const version = net.isIP(address);
  if (version === 4) {
    return [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4]
    ].some(([base, bits]) => inV4Range(address, base, bits));
  }
  if (version === 6) {
    const ip = address.toLowerCase();
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(ip)) return true;
    if (ip.startsWith('ff')) return true;
    if (ip.startsWith('2001:db8:')) return true;
    if (ip.startsWith('::ffff:')) {
      const mapped = ip.slice(7);
      return net.isIP(mapped) === 4 ? isPrivateAddress(mapped) : true;
    }
    return false;
  }
  return true;
}

export async function validatePublicUrl(rawUrl, cache = new Map()) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('URL inválida.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Solo se permiten URLs http/https.');
  }
  if (url.username || url.password) {
    throw new Error('No se permiten credenciales dentro de la URL.');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || blockedHostnames.has(hostname) || hostname.endsWith('.local')) {
    throw new Error('Ese host no está permitido.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('No se permiten IPs privadas o reservadas.');
    return url;
  }

  let records = cache.get(hostname);
  if (!records) {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
    cache.set(hostname, records);
  }
  if (!records.length) throw new Error('El host no resolvió a ninguna IP.');
  if (records.some(record => isPrivateAddress(record.address))) {
    throw new Error('El host resuelve a una red privada o reservada.');
  }
  return url;
}

export function isSafeBrowserScheme(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return ['http:', 'https:', 'data:', 'blob:'].includes(url.protocol);
  } catch {
    return false;
  }
}
