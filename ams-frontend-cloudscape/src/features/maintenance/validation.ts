export function wholeUnits(value: string, minimum = 0) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= minimum;
}
