# Ghostseat 👻🪑

A simple Discord bot that silently occupies a voice channel to keep it marked as **active**. Useful for time tracking tools that detect activity based on voice channel presence — Ghostseat joins, haunts the channel indefinitely doing absolutely nothing, and vanishes only when told to.

## What it does

- `/join` — Bot joins the voice channel you are currently in and stays there permanently
- `/leave` — Bot disconnects from the voice channel
- `/leaderboard` — Shows top members by accumulated voice active time in the server
- Auto-rejoins if it gets disconnected unexpectedly (network blip, server hiccup, etc.)
- No audio, no noise — purely passive presence to keep the channel alive

## Requirements

- [Bun](https://bun.sh) runtime
- A Discord bot token with the `applications.commands` and `bot` OAuth2 scopes

## Setup

**1. Clone and install dependencies**

```bash
bun install
```

**2. Configure environment variables**

```bash
cp .env.example .env
```

Fill in `.env`:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_server_id
```

> Get these from the [Discord Developer Portal](https://discord.com/developers/applications).
> `GUILD_ID`: right-click your server icon in Discord → **Copy Server ID** (requires Developer Mode enabled).

**3. Invite the bot to your server**

In the Developer Portal → **OAuth2 → URL Generator**, select scopes `bot` + `applications.commands` and permissions `Connect`, `Speak`, `View Channels`. Open the generated URL and invite the bot.

**4. Register slash commands**

```bash
bun run deploy
```

**5. Start the bot**

```bash
bun start
```

You should see:

```
[Bot] Ready! Logged in as Ghostseat#0000
```

## Usage

1. Join any voice channel in your server
2. Run `/join` — the bot joins your channel and stays
3. Run `/leaderboard` to see who has the highest active voice time
4. Run `/leave` when you are done

## Voice activity leaderboard behavior

- Tracks each non-bot member's connected time in voice channels per server
- Data is persisted in `data/voice-leaderboard.json`
- Ongoing sessions are included in `/leaderboard` results in real time
- `/leaderboard` accepts optional `limit` (1-25, default 10)

## Scripts

| Command             | Description                            |
| ------------------- | -------------------------------------- |
| `bun start`         | Start the bot                          |
| `bun run deploy`    | Register slash commands with the guild |
| `bun run typecheck` | Run TypeScript checks                  |
| `bun install`       | Install dependencies                   |
