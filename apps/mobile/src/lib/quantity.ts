export function normalizeWholeNumberInput(value: string) {
  const [wholePart = ""] = value.replace(/,/g, "").split(".");

  return wholePart.replace(/\D/g, "");
}

export function parseWholeQuantity(value: string) {
  const amount = Number(normalizeWholeNumberInput(value));

  return Number.isFinite(amount) ? amount : 0;
}

export function formatWholeQuantity(value: number) {
  const amount = Number.isFinite(value) ? value : 0;

  return String(Math.max(0, Math.trunc(amount)));
}

export function isWholeNumberInput(value: string) {
  const normalized = normalizeWholeNumberInput(value);

  return normalized.length > 0 && Number.isFinite(Number(normalized));
}
