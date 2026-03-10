# Discord Voice Bot - Project Overview

## Purpose
A Discord bot that listens to slash commands to join a specified voice channel and stays there until a leave command is issued.

## Tech Stack
- Runtime: Bun
- Language: TypeScript (strict mode)
- Discord: discord.js v14 + @discordjs/voice
- Module system: ESM (type: module)

## Code Style & Conventions
- Clean Code Architecture
- Strict TypeScript
- ESM imports
- Camel case for variables/functions, PascalCase for classes/interfaces

## Project Structure (planned)
```
src/
  bot/         - Client setup and initialization
  commands/    - Slash command handlers (join, leave)
  services/    - VoiceService for connection management
  config/      - Config/env loading
  types/       - Shared TypeScript types
index.ts       - Entry point
```
