import crypto from 'crypto';

const OTP_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Encode = (buffer: Buffer) => {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += OTP_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += OTP_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
};

const base32Decode = (value: string) => {
  const cleaned = value.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const idx = OTP_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    buffer = (buffer << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
};

export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

export const buildOtpAuthUrl = (secret: string, email: string) => {
  const label = encodeURIComponent(email || 'boss-admin');
  const issuer = encodeURIComponent('BossDesk');
  return `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;
};

export const verifyTotp = (secret: string, code: string, window = 1) => {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) return false;
  const now = Date.now();
  for (let offset = -window; offset <= window; offset += 1) {
    const time = now + offset * 30000;
    const counter = Math.floor(time / 1000 / 30);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuffer.writeUInt32BE(counter & 0xffffffff, 4);
    const key = base32Decode(secret);
    const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
    const hmacOffset = hmac[hmac.length - 1] & 0x0f;
    const value =
      ((hmac[hmacOffset] & 0x7f) << 24) |
      ((hmac[hmacOffset + 1] & 0xff) << 16) |
      ((hmac[hmacOffset + 2] & 0xff) << 8) |
      (hmac[hmacOffset + 3] & 0xff);
    const expected = String(value % 1000000).padStart(6, '0');
    if (expected === normalized) {
      return true;
    }
  }
  return false;
};
