import { Collection } from "discord.js";
import type { Command } from "../types/index.js";
import { join } from "./join.js";
import { leave } from "./leave.js";

export const commands = new Collection<string, Command>([
  [join.data.name, join],
  [leave.data.name, leave],
]);
