/** Marca de tiempo ISO. Se llama en los manejadores de eventos, nunca dentro del reducer. */
export const now = (): string => new Date().toISOString();
