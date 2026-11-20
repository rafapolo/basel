// Fronteiras (data/fronteira.json, script/fronteira.py, swissBOUNDARIES3D): a nacional, com a Alemanha e a França, numa
// cortina vermelha e branca de 14 m que some para cima, e o contorno de Basel-Stadt (Riehen e Bettingen incluídos) numa
// cortina preta e branca de 6 m, 3 m para dentro. Translúcidas, sem sombra, visíveis de longe; liga e desliga no painel.
import * as THREE from 'three';

export function criarFronteira({ cena, dados }) {
  if (!dados) return null;
  const grupo = new THREE.Group(); grupo.name = 'fronteiras';
  const cortina = (linhas, h, c1, c2, trecho, alfa) => {
    const P = [], C = [], I = [];
    const a = new THREE.Color(c1), b = new THREE.Color(c2);
    for (const l of linhas) {
      let s = 0;
      for (let i = 0; i < l.length; i += 3) {
        if (i) s += Math.hypot(l[i] - l[i - 3], l[i + 1] - l[i - 2]);
        const c = Math.floor(s / trecho) % 2 ? b : a, v = P.length / 3;
        P.push(l[i], l[i + 2] - 1.5, l[i + 1], l[i], l[i + 2] + h, l[i + 1]);
        C.push(c.r, c.g, c.b, alfa, c.r, c.g, c.b, 0);
        if (i) I.push(v - 2, v - 1, v, v - 1, v + 1, v);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4)); g.setIndex(I);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    m.renderOrder = 2; m.frustumCulled = false; m.userData.semNeve = true; grupo.add(m);
  };
  // faixa tracejada no chão, para ler de cima (a cortina vista do alto é um fio); sem névoa: Riehen e Bettingen ficam a
  // 4–7 km e a linha do cantão aparece inteira mesmo onde a cidade já sumiu
  const faixa = (linhas, larg, c1, c2, trecho) => {
    const P = [], C = [], I = [], a = new THREE.Color(c1), b = new THREE.Color(c2);
    for (const l of linhas) {
      let s = 0;
      for (let i = 0; i < l.length; i += 3) {
        const i0 = Math.max(0, i - 3), i1 = Math.min(l.length - 3, i + 3), dx = l[i1] - l[i0], dz = l[i1 + 1] - l[i0 + 1], L = Math.hypot(dx, dz) || 1, nx = -dz / L * larg / 2, nz = dx / L * larg / 2;
        if (i) s += Math.hypot(l[i] - l[i - 3], l[i + 1] - l[i - 2]);
        const c = Math.floor(s / trecho) % 2 ? b : a, v = P.length / 3, y = l[i + 2] + 0.6;
        P.push(l[i] + nx, y, l[i + 1] + nz, l[i] - nx, y, l[i + 1] - nz);
        C.push(c.r, c.g, c.b, 0.95, c.r, c.g, c.b, 0.95);
        if (i) I.push(v - 2, v - 1, v, v - 1, v + 1, v);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4)); g.setIndex(I);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    m.renderOrder = 3; m.frustumCulled = false; m.userData.semNeve = true; grupo.add(m);
  };
  cortina(dados.nacional, 14, '#d52b1e', '#ffffff', 12, 0.8);
  cortina(dados.cantao, 6, '#151515', '#ffffff', 8, 0.75);
  faixa(dados.nacional, 8, '#d52b1e', '#ffffff', 24);
  faixa(dados.cantao, 5, '#151515', '#ffffff', 16);
  cena.add(grupo);
  return { grupo, ligar: (on) => { grupo.visible = on; } };
}
