import { randomInt } from "crypto";

/**
 * Password policy shared by registration and password reset (the client mirrors this for UX,
 * but this is the copy that counts).
 */
export function validatePassword(
  password: unknown,
  context: { fullName?: string | null; dob?: string | null; email?: string | null } = {}
): string | null {
  if (typeof password !== "string" || password.length < 8) return "Password must be at least 8 characters long";
  if (password.length > 128) return "Password must be at most 128 characters long";
  if (!/\d/.test(password)) return "Password must contain at least one number";
  if (!/[!@#$%^&*(),.?":{}|<>_\-+=~`'\\/[\];]/.test(password)) return "Password must contain at least one symbol";

  const lower = password.toLowerCase();
  if (context.fullName && lower === context.fullName.toLowerCase()) return "Password cannot be your name";
  if (context.dob && password === context.dob) return "Password cannot be your Date of Birth";
  if (context.email && lower === context.email.toLowerCase()) return "Password cannot be your email address";
  return null;
}

/** A random password that satisfies validatePassword (letters, a digit, a symbol), for accounts an admin creates or resets. */
export function generateTempPassword(length = 16): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*?-_=+";
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(digits), pick(digits), pick(symbols), pick(symbols), ...Array.from({ length: length - 4 }, () => pick(letters))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
