export type GameUserError = Error & {
  readonly kind: "GameUserError";
  readonly userMessage: string;
};

export function createGameUserError(userMessage: string): GameUserError {
  const error = new Error(userMessage) as GameUserError;
  Object.defineProperty(error, "kind", {
    value: "GameUserError",
    enumerable: true,
  });
  Object.defineProperty(error, "userMessage", {
    value: userMessage,
    enumerable: true,
  });
  error.name = "GameUserError";
  return error;
}

export function isGameUserError(error: unknown): error is GameUserError {
  return (
    error instanceof Error &&
    (error as { kind?: unknown }).kind === "GameUserError" &&
    typeof (error as { userMessage?: unknown }).userMessage === "string"
  );
}
