/** api.md §4.1a. The available amount in kopecks (ADR-0007: integers only). */
export const serializeBalance = (availableKopecks: number) => ({ balance: { availableKopecks } });
