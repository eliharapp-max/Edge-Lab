// Web Crypto API utilities for local encryption

// Generate a recovery key (12-word phrase style or long random string)
export function generateRecoveryKey() {
  // Generate 128 bits of entropy (16 bytes)
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  
  // Convert to hex string (32 characters)
  const hex = Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  
  // Format as 4 groups of 8 characters for readability
  return `${hex.slice(0, 8)}-${hex.slice(8, 16)}-${hex.slice(16, 24)}-${hex.slice(24, 32)}`
}

// Derive encryption key from PIN + username using PBKDF2
export async function deriveKey(pin, username, salt) {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin + username),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// Generate salt for key derivation
export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(16))
}

// Encrypt data using AES-GCM
export async function encryptData(data, key) {
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV for GCM
  
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    encoder.encode(JSON.stringify(data))
  )

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(encrypted), iv.length)

  // Convert to base64 for storage
  return btoa(String.fromCharCode(...combined))
}

// Decrypt data using AES-GCM
export async function decryptData(encryptedData, key) {
  try {
    // Convert from base64
    const combined = Uint8Array.from(
      atob(encryptedData).split('').map(c => c.charCodeAt(0))
    )

    // Extract IV and encrypted data
    const iv = combined.slice(0, 12)
    const encrypted = combined.slice(12)

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encrypted
    )

    const decoder = new TextDecoder()
    return JSON.parse(decoder.decode(decrypted))
  } catch (error) {
    throw new Error('Decryption failed. Invalid key or corrupted data.')
  }
}

// Derive key from recovery key (for PIN reset)
export async function deriveKeyFromRecovery(recoveryKey, username, salt) {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(recoveryKey + username),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// Hash PIN for verification (using SHA-256)
export async function hashPIN(pin, username, salt) {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin + username + Array.from(salt).join(''))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Verify PIN
export async function verifyPIN(pin, username, salt, storedHash) {
  const computedHash = await hashPIN(pin, username, salt)
  return computedHash === storedHash
}

