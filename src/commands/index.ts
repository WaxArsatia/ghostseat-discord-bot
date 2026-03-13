import { Collection } from "discord.js";
import type { Command } from "../types/index.js";
import { game } from "./game.js";
import { voice } from "./voice.js";

export const commands = new Collection<string, Command>([
  [game.data.name, game],
  [voice.data.name, voice],
]);
