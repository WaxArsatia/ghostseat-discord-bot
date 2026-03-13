import { Collection } from "discord.js";
import type { Command } from "../types/index.js";
import { join } from "./join.js";
import { leaderboard } from "./leaderboard.js";
import { leave } from "./leave.js";

export const commands = new Collection<string, Command>([
  [join.data.name, join],
  [leaderboard.data.name, leaderboard],
  [leave.data.name, leave],
]);
