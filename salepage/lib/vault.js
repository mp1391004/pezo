const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const vaultPath = path.join(os.homedir(), 'Library', 'Application Support', 'Pezo Builder', 'credentials.enc');

function stream(key, nonce, size) {
  const chunks = [];
  let total = 0;
  for (let counter = 0; total < size; counter++) {
    const c = Buffer.alloc(8);
    c.writeBigUInt64BE(BigInt(counter));
    const block = crypto.createHash('sha256').update(Buffer.concat([key, nonce, c])).digest();
    chunks.push(block); total += block.length;
  }
  return Buffer.concat(chunks).subarray(0, size);
}

function readVault() {
  if (process.platform !== 'darwin' || !fs.existsSync(vaultPath)) return {};
  try {
    const encoded = execFileSync('security', ['find-generic-password', '-s', 'pezo-builder-vault', '-a', process.env.USER || 'local-user', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const key = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const raw = fs.readFileSync(vaultPath);
    if (raw.subarray(0, 3).toString() !== 'PZ1') throw new Error('bad vault');
    const nonce = raw.subarray(3, 19), mac = raw.subarray(19, 51), cipher = raw.subarray(51);
    const expected = crypto.createHash('sha256').update(Buffer.concat([key, nonce, cipher])).digest();
    if (!crypto.timingSafeEqual(mac, expected)) throw new Error('bad mac');
    const mask = stream(key, nonce, cipher.length);
    const plain = Buffer.alloc(cipher.length);
    for (let i = 0; i < cipher.length; i++) plain[i] = cipher[i] ^ mask[i];
    return JSON.parse(plain.toString('utf8'));
  } catch { return {}; }
}

module.exports = { readVault };
