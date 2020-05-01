export const timeout = (timeoutMs: number) => {
    return new Promise((resolve) => {
        setTimeout(resolve, timeoutMs);
    });
};
