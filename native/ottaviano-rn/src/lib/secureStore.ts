import * as Keychain from "react-native-keychain";

/**
 * Tiny Keychain-backed secure store — the bare-RN replacement for
 * `expo-secure-store`. Each key is its own Keychain service entry, so the
 * operator and customer refresh tokens live in separate, hardware-encrypted
 * slots (API-V1.md: the refresh secret lives only in the device Keychain).
 */

// Method names mirror `expo-secure-store` so call sites read identically.
export async function getItemAsync(key: string): Promise<string | null> {
  const creds = await Keychain.getGenericPassword({ service: key });
  return creds ? creds.password : null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  await Keychain.setGenericPassword("token", value, { service: key });
}

export async function deleteItemAsync(key: string): Promise<void> {
  await Keychain.resetGenericPassword({ service: key });
}
