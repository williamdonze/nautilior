/**
 * Mode de rendu de la plongée.
 * active = true : la plongée est dessinée par le moteur WebGPU (src/gpu), le reste par Three.js.
 * Décidé une fois au démarrage (main.js), avant la construction du monde.
 */
export const gpuMode = { active: false, device: null };
