// Fundo (2026-11-21): fora do quadrado da cidade não há dados, então o chão é escuro e liso, sem névoa, abaixo de tudo,
// para a cidade ler como uma maquete sobre a mesa. Dentro da Suíça um castanho escuro que segue a hora (mais claro de dia,
// quase preto à noite); fora do país (Alemanha e França, pelo polígono da swisstopo em fronteira.json) mais escuro ainda.
import * as THREE from 'three';

const DIA = new THREE.Color('#3b372f'), NOITE = new THREE.Color('#0c0b0f');
export function criarFundo({ cena, dados, y = -6 }) {
  const J = dados?.janela ?? 20000, N = 1024;
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, N, N); // fora do país: ~48% do tom de dentro
  if (dados?.pais) {
    g.fillStyle = '#ffffff';
    for (const a of dados.pais) { g.beginPath(); for (let i = 0; i < a.length; i += 2) { const u = ((a[i] + J) / (2 * J)) * N, v = ((a[i + 1] + J) / (2 * J)) * N; i ? g.lineTo(u, v) : g.moveTo(u, v); } g.closePath(); g.fill(); }
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // plano no xz: u segue +x e v segue +z (a mesma convenção do canvas acima)
  const geo = new THREE.PlaneGeometry(2 * J, 2 * J).rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: DIA.clone(), fog: false });
  mat.userData.semNeve = true;
  const chao = new THREE.Mesh(geo, mat); chao.position.y = y; chao.renderOrder = -1; chao.name = 'fundo';
  cena.add(chao);
  const c = new THREE.Color();
  // dia 0..1 (sol) e noite 0..1 (o botão): o chão de fora acompanha, sempre mais escuro que a cidade
  return { chao, atualizar(noite, dia = 1) { c.copy(NOITE).lerp(DIA, Math.max(0, Math.min(1, dia)) * (1 - noite)); mat.color.copy(c); } };
}
