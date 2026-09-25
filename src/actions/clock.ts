"use server";

export async function serverNowAction(): Promise<number> {
  return Date.now();
}
