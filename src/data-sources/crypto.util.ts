import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for AES-GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a consistent 32-byte key from environment configuration or secure machine fallback.
 */
function getEncryptionKey(): Buffer {
  const secret =
    process.env.ENCRYPTION_KEY ||
    process.env.SECRET_KEY ||
    'fl-tik-influencer-monitor-default-secure-key-2026';
  return crypto.scryptSync(secret, 'fl-tik-salt-secure-storage', 32);
}

/**
 * Encrypt a plaintext secret string using AES-256-GCM.
 * Output format: "iv:authTag:ciphertext" (all hex encoded)
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext || plaintext.trim().length === 0) {
    return '';
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload || !encryptedPayload.includes(':')) {
    return '';
  }

  try {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      return '';
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    return '';
  }
}

/**
 * Safely masks a secret string for UI presentation without revealing sensitive content.
 * e.g., "my-api-key-12345678" -> "••••••••••••5678"
 */
export function maskSecret(secret?: string | null): string {
  if (!secret || secret.trim().length === 0) {
    return '';
  }

  const trimmed = secret.trim();
  if (trimmed.length <= 6) {
    return '••••••••';
  }

  const visibleTrailing = Math.min(4, Math.floor(trimmed.length / 3));
  const maskedLength = Math.max(8, trimmed.length - visibleTrailing);
  const trailingPart = trimmed.slice(-visibleTrailing);

  return `${'•'.repeat(maskedLength)}${trailingPart}`;
}

/**
 * Sanitizes URLs to remove basic auth credentials before logging or returning to client.
 */
export function sanitizeUrl(rawUrl?: string | null): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = '••••';
    }
    return parsed.toString();
  } catch {
    return rawUrl.replace(/:\/\/[^:]+:[^@]+@/, '://••••:••••@');
  }
}

