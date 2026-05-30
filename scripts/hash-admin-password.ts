#!/usr/bin/env tsx
/**
 * Generates a salted scrypt hash for the admin password.
 *
 * Usage (preferred — keeps the plaintext out of shell history):
 *
 *   tsx scripts/hash-admin-password.ts
 *   # then type the password at the prompt (input is hidden)
 *
 * Or pipe it in:
 *
 *   printf '%s' 'my-password' | tsx scripts/hash-admin-password.ts
 *
 * Copy the printed `scrypt$...` line into the ADMIN_PASSWORD_HASH env var
 * (Vercel → Project → Settings → Environment Variables) and remove the old
 * plaintext ADMIN_PASSWORD. Rotating the password = re-run this and replace
 * the env var value.
 */
import { hashPassword } from "../src/lib/password";

function readFromStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.replace(/\r?\n$/, "")));
  });
}

function prompt(): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write("Admin password: ");
    const stdin = process.stdin;
    stdin.setEncoding("utf8");
    // Hide input.
    if (stdin.isTTY) stdin.setRawMode?.(true);
    let buf = "";
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\n" || c === "\r" || c === "") {
          if (stdin.isTTY) stdin.setRawMode?.(false);
          stdin.removeListener("data", onData);
          stdin.pause();
          process.stdout.write("\n");
          resolve(buf);
          return;
        } else if (c === "") {
          // Ctrl-C
          process.exit(1);
        } else if (c === "" || c === "\b") {
          buf = buf.slice(0, -1);
        } else {
          buf += c;
        }
      }
    };
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function main() {
  const password = process.stdin.isTTY ? await prompt() : await readFromStdin();
  if (!password) {
    console.error("No password provided.");
    process.exit(1);
  }
  console.log(hashPassword(password));
}

main();
