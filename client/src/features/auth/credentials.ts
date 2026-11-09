export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validEmail(email: string) {
  const [local, domain, extra] = email.split("@");
  return email.length <= 254 && !!domain && extra === undefined && local.length <= 64 &&
    /^[a-z0-9!#$%&'*+/=?^`{|}~_-]+(?:\.[a-z0-9!#$%&'*+/=?^`{|}~_-]+)*$/.test(local) &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain);
}

export function validPassword(password: string) {
  if (password.length > 256 || /[\0\uD800-\uDFFF]/u.test(password)) return false;
  const length = [...password].length;
  return length >= 8 && length <= 128;
}
