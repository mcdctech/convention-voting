/**
 * Password generation utilities
 */
import bcrypt from "bcrypt";
import { FIVE_LETTER_WORDS } from "./word-list.js";

const BCRYPT_ROUNDS = 10;

/**
 * Generate a random password in the format: word + 3-digit number
 * Example: "apple123", "river456"
 */
export function generatePassword(): string {
  // Select a random word from the list
  const word =
    FIVE_LETTER_WORDS[Math.floor(Math.random() * FIVE_LETTER_WORDS.length)];

  // Generate a random 3-digit number (100-999)
  const number = Math.floor(Math.random() * 900) + 100;

  return `${word}${number}`;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Compare a plain text password with a hashed password
 */
export async function comparePassword(
  plainPassword: string,
  hashedPassword: string,
): Promise<boolean> {
  return await bcrypt.compare(plainPassword, hashedPassword);
}
