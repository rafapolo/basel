// As 6 câmeras fixas para comparar com a cidade real (tarefa 21). Uso: ?cam=<nome> (ver CAMERAS).
// alvo: [x, y, z] em metros locais; y = null → o chão naquele ponto; uma string → centro do prédio com esse nome.
// Ângulos em graus. Câmeras de rua (rua: true) ficam a 1,7 m do chão: dist 25 (o mínimo do OrbitControls) a 86°.
// Cada câmera pode fixar ano/modo/noite para o "antes e depois" ser sempre a mesma cena.
export const CAMERAS = {
  // vista do Reno desde a Pfalz: o eco da gravura de Merian (1615); é o fim e o começo do tour
  pfalz: { titulo: 'Reno e Mittlere Brücke, da Pfalz', alvo: [25, 4, -190], dist: 540, az: 24, polar: 70 },
  // Münster visto do alto: cena 1 do tour
  munster: { titulo: 'Münster', alvo: 'Münster', dist: 210, az: 200, polar: 64 },
  // Reno e margem do Kleinbasel: fim da cena 3 do tour
  reno: { titulo: 'Reno, margem de Kleinbasel', alvo: [-80, 0, -150], dist: 260, az: 150, polar: 72 },
  // Rathaus e Marktplatz do alto: cena 4 do tour
  rathaus: { titulo: 'Rathaus, do alto', alvo: 'Rathaus', dist: 280, az: 250, polar: 55 },
  // nível da rua: no lado oeste da Marktplatz (x≈−125, z≈30), olhando para o Rathaus (−81, 10)
  marktplatz: { titulo: 'Marktplatz, nível da rua', alvo: [-102, null, 20], dist: 25, az: -66, polar: 86, rua: true },
  // nível da rua: embaixo do Rheinsprung (x≈−53, z≈−102), subindo em direção à Münsterplatz
  rheinsprung: { titulo: 'Rheinsprung, nível da rua', alvo: [-36.5, null, -83], dist: 25, az: -139, polar: 86, rua: true },
};
export const ORDEM = Object.keys(CAMERAS);
