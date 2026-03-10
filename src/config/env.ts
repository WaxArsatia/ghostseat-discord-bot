function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  token: requireEnv("DISCORD_TOKEN"),
  clientId: requireEnv("CLIENT_ID"),
  guildId: requireEnv("GUILD_ID"),
} as const;
