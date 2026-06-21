const moeda = new Audio("/assets/sounds/coin.mp3");
moeda.preload = "auto";
moeda.load();

export function tocarMoeda() {
  try {
    moeda.currentTime = 0;
    moeda.play().catch(() => {});
  } catch {}
}
