const { createHash, randomBytes, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const repository = require("../repositories/auth");
const { SESSION_AGE_SECONDS } = require("../config/auth");

const deriveKey = promisify(scrypt);
const SCRYPT_OPTIONS = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const DUMMY_SALT = randomBytes(16);
const DUMMY_HASH = randomBytes(64);
let activeHashes = 0;

class InvalidRegistrationError extends Error {}
class AuthBusyError extends Error {}

function validateCredentials(input) {
  if (typeof input?.email !== "string" || typeof input.password !== "string") return null;
  const email = input.email.trim().toLowerCase();
  const [local, domain, extra] = email.split("@");
  const { password } = input;
  if (email.length > 254 || !domain || extra !== undefined || local.length > 64 ||
      !/^[a-z0-9!#$%&'*+/=?^`{|}~_-]+(?:\.[a-z0-9!#$%&'*+/=?^`{|}~_-]+)*$/.test(local) ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain) ||
      password.length > 256 || !password.isWellFormed() || password.includes("\0")) return null;

  const length = [...password].length;
  return length >= 8 && length <= 128 ? { email, password } : null;
}

async function hashPassword(password, salt) {
  if (activeHashes >= 4) throw new AuthBusyError();
  activeHashes++;
  try {
    return await deriveKey(password, salt, 64, SCRYPT_OPTIONS);
  } finally {
    activeHashes--;
  }
}

function sessionHash(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)
    ? createHash("sha256").update(token).digest() : null;
}

async function register(input) {
  const credentials = validateCredentials(input);
  if (!credentials) throw new InvalidRegistrationError();
  const { email, password } = credentials;
  const salt = randomBytes(16);
  const hash = await hashPassword(password, salt);
  return repository.insertOrganizer({ email, salt, hash });
}

async function login(input, previousToken) {
  const credentials = validateCredentials(input);
  if (!credentials) return null;

  const record = await repository.findCredentials(credentials.email);
  const supplied = await hashPassword(credentials.password, record?.salt ?? DUMMY_SALT);
  const matches = timingSafeEqual(record?.hash ?? DUMMY_HASH, supplied);
  if (!matches || !record) return null;

  const sessionToken = randomBytes(32).toString("base64url");
  await repository.issueSession({
    tokenHash: sessionHash(sessionToken),
    organizerId: record.id,
    ageSeconds: SESSION_AGE_SECONDS,
    previousHash: sessionHash(previousToken),
  });
  return { organizer: { id: record.id, email: record.email }, sessionToken };
}

async function authenticate(token) {
  const hash = sessionHash(token);
  return hash ? repository.findSession(hash) : null;
}

async function logout(token) {
  const hash = sessionHash(token);
  if (hash) await repository.revokeSession(hash);
}

module.exports = { register, login, authenticate, logout, InvalidRegistrationError, AuthBusyError };
