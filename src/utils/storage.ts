import type { ClassifierResult, MapperConfig } from "../algorithm/types";

const STORAGE_KEY_RESULT = "topoMark_result";
const STORAGE_KEY_CONFIG = "topoMark_config";
const STORAGE_KEY_TIMESTAMP = "topoMark_timestamp";

/**
 * Cache the classifier result so the popup doesn't need to re-run.
 */
export async function saveResult(result: ClassifierResult): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY_RESULT]: result,
    [STORAGE_KEY_TIMESTAMP]: Date.now(),
  });
}

export async function loadResult(): Promise<ClassifierResult | null> {
  const data = await chrome.storage.local.get([STORAGE_KEY_RESULT]);
  return (data[STORAGE_KEY_RESULT] as ClassifierResult) ?? null;
}

/**
 * Persist user configuration.
 */
export async function saveConfig(config: MapperConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_CONFIG]: config });
}

export async function loadConfig(): Promise<MapperConfig | null> {
  const data = await chrome.storage.local.get([STORAGE_KEY_CONFIG]);
  return (data[STORAGE_KEY_CONFIG] as MapperConfig) ?? null;
}

export async function loadTimestamp(): Promise<number | null> {
  const data = await chrome.storage.local.get([STORAGE_KEY_TIMESTAMP]);
  return (data[STORAGE_KEY_TIMESTAMP] as number) ?? null;
}
