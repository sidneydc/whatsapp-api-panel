export const createDelay = async (duration = 1000) => {
    return await new Promise((resolve) => setTimeout(() => {
        resolve(true);
    }, duration));
};
//# sourceMappingURL=create-delay.js.map