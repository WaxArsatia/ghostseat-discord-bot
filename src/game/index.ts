import { GameService } from "./application/GameService.js";
import { GameVoiceTracker } from "./application/GameVoiceTracker.js";
import { GameCatalog } from "./domain/GameCatalog.js";
import { SQLiteGameRepository } from "./infrastructure/SQLiteGameRepository.js";

const repository = new SQLiteGameRepository();
const catalog = GameCatalog.load();

export const gameService = new GameService(repository, catalog);
export const gameVoiceTracker = new GameVoiceTracker(gameService);

export function initializeGameStorage(): void {
  gameService.initialize();
}

export function shutdownGameRuntime(): void {
  gameVoiceTracker.shutdown();
}
