// Fundo (2026-11-21): fora do quadrado da cidade não há dados; o chão vira um campo verde variado (prados, lavouras,
// matas), abaixo de tudo, que escurece com a hora; fora do país (Alemanha e França, pelo polígono da swisstopo em
// fronteira.json) o mesmo campo, mais escuro.
import * as THREE from 'three';

// a cor do campo vem da textura; o material só escurece com a hora (dia 1 → noite ~0,1)
const DIA = new THREE.Color('#e2e2d6'), NOITE = new THREE.Color('#1a1d26');
export function criarFundo({ cena, dados, y = -6 }) {
  const J = dados?.janela ?? 20000, N = 2048;
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d');
  // campo: colcha de prados, lavouras e manchas de mata (verdes, verde-amarelados, ocres), com nuvens de tom por cima
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#6f8a48'; g.fillRect(0, 0, N, N);
  const VERDES = ['#5f7d3c', '#7a9450', '#8aa25a', '#6b8a44', '#93a663', '#a6ad6a', '#56743a', '#b3a86a', '#7d8f4a', '#4a6534'];
  for (let i = 0; i < 9000; i++) { // talhões: retângulos tortos de 60 a 600 m
    const x = rnd() * N, z = rnd() * N, w = 3 + rnd() * 30, h = 3 + rnd() * 22;
    g.save(); g.translate(x, z); g.rotate(rnd() * Math.PI); g.globalAlpha = 0.35 + rnd() * 0.5; g.fillStyle = VERDES[Math.floor(rnd() * VERDES.length)]; g.fillRect(-w / 2, -h / 2, w, h); g.restore();
  }
  for (let i = 0; i < 900; i++) { // matas: manchas pequenas e só um pouco mais escuras (grandes e escuras, pareciam sombras de nuvem)
    const x = rnd() * N, z = rnd() * N, r = 2 + rnd() * 9;
    g.globalAlpha = 0.28; g.fillStyle = rnd() < 0.5 ? '#4e6c38' : '#456334'; g.beginPath(); g.ellipse(x, z, r, r * (0.5 + rnd()), rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  // fora da Suíça: o mesmo campo, mais escuro
  if (dados?.pais) {
    const masc = document.createElement('canvas'); masc.width = masc.height = N; const m = masc.getContext('2d');
    m.fillStyle = 'rgba(0,0,0,0.22)'; m.fillRect(0, 0, N, N); // um pouco mais escuro só (a 50% e com borda dura, na névoa parecia a sombra de uma nuvem enorme) m.globalCompositeOperation = 'destination-out'; m.fillStyle = '#000';
    for (const a of dados.pais) { m.beginPath(); for (let i = 0; i < a.length; i += 2) { const u = ((a[i] + J) / (2 * J)) * N, v = ((a[i + 1] + J) / (2 * J)) * N; i ? m.lineTo(u, v) : m.moveTo(u, v); } m.closePath(); m.fill(); }
    g.filter = 'blur(6px)'; g.drawImage(masc, 0, 0); g.filter = 'none'; // borda macia (~120 m)
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // plano no xz: u segue +x e v segue +z (a mesma convenção do canvas acima)
  const geo = new THREE.PlaneGeometry(2 * J, 2 * J).rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: DIA.clone(), fog: true }); // com névoa: o campo some no horizonte como a cidade
  mat.userData.semNeve = true;
  const chao = new THREE.Mesh(geo, mat); chao.position.y = y; chao.renderOrder = -1; chao.name = 'fundo';
  cena.add(chao);
  const c = new THREE.Color();
  // dia 0..1 (sol) e noite 0..1 (o botão): o chão de fora acompanha, sempre mais escuro que a cidade
  return { chao, atualizar(noite, dia = 1) { c.copy(NOITE).lerp(DIA, Math.max(0, Math.min(1, dia)) * (1 - noite)); mat.color.copy(c); } };
}
