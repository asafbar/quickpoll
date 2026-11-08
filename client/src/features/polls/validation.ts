export function textLength(value: string) {
  return [...value.trim()].length;
}

export function validText(value: string, limit: number) {
  const length = textLength(value);
  return length > 0 && length <= limit && !/[\0\uD800-\uDFFF]/u.test(value);
}
