import { Collection } from "discord.js";
import type { Command } from "../types/index.js";
import { voice } from "./voice.js";

export const commands = new Collection<string, Command>([
  [voice.data.name, voice],
]);
