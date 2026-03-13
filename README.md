# Ghostseat 👻🪑

A simple Discord bot that silently occupies a voice channel to keep it marked as **active**. Useful for time tracking tools that detect activity based on voice channel presence — Ghostseat joins, haunts the channel indefinitely doing absolutely nothing, and vanishes only when told to.

## What it does

- `/voice join` — Bot joins the voice channel you are currently in and stays there permanently
- `/voice leave` — Bot disconnects from the voice channel
- `/voice leaderboard [limit]` — Shows top members by accumulated voice active time in the server
- `/game profile` — Shows your Voicebound Arena progress, stats, and loadout
- `/game spin [amount]` — Uses tickets to roll equipment with Epic/Legendary pity
- `/game inventory` — Lists your owned equipment (collection mode)
- `/game equip [slot] [item_id]` and `/game unequip [slot]` — Manages 3-slot loadout
- `/game convert [amount]` — Converts shards to tickets (`10 shard -> 1 ticket`)
- `/game duel @user` — Runs auto 1v1 duel (public summary + private paginated log)
- `/game leaderboard [limit]` — Shows game leaderboard sorted by `level DESC, exp DESC`
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
2. Run `/voice join` — the bot joins your channel and stays
3. Stay in a non-AFK voice channel to accumulate game progress (`1 ticket + 10 EXP / 15 minutes`)
4. Use `/game spin`, `/game inventory`, and `/game equip` to build your loadout
5. Use `/game duel @user` for automatic PvP and `/game leaderboard` for progression ranking
6. Run `/voice leaderboard` to see who has the highest active voice time
7. Run `/voice leave` when you are done

## Voice activity leaderboard behavior

- Tracks each non-bot member's connected time in voice channels per server
- Data is persisted in `data/voice-leaderboard.json`
- Ongoing sessions are included in `/voice leaderboard` results in real time
- `/voice leaderboard` accepts optional `limit` (1-25, default 10)

## Voicebound Arena MVP behavior

- Account scope is per guild (server)
- Progress accrual is eligible only while user is in voice and not in the server AFK channel
- Every eligible 15 minutes grants `+1 ticket` and `+10 EXP`
- Duel EXP rewards: winner `+20`, loser `+10`
- Level cap `50`, with level-up formula and base stat growth from `GAME_DESIGN.md`
- Gacha uses dual pity (Epic and Legendary) and duplicates convert to shards only
- Data is persisted in SQLite at `data/game.sqlite`

## Scripts

| Command                                       | Description                            |
| --------------------------------------------- | -------------------------------------- |
| `bun start`                                   | Start the bot                          |
| `bun run deploy`                              | Register slash commands with the guild |
| `bun run typecheck`                           | Run TypeScript checks                  |
| `python src/scripts/generate_item_catalog.py` | Generate game item catalog JSON        |
| `bun install`                                 | Install dependencies                   |
