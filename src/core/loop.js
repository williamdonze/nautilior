/**
 * Boucle de jeu : appelle update(dt, temps) puis render() à chaque frame.
 * dt est plafonné pour éviter les sauts après un changement d'onglet.
 */
export function startLoop(update, render) {
  let last = performance.now();
  let elapsed = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += dt;
    update(dt, elapsed);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
