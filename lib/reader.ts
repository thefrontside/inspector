export function toJson(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (ignore) {
    return String(value);
  }
}
