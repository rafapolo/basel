// Lugares com cara própria (2026-11-22): o letreiro MARKTHALLE em letras pretas sobre a fachada do Steinentorberg (como na
// foto da feira de quinta) e fileiras de bicicletas estacionadas na frente dela e na Centralbahnplatz (estação SBB), onde
// Basel deixa centenas. Coordenadas locais medidas nos sólidos do swissBUILDINGS3D (prédio 5921 e Centralbahnstrasse 10.1).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Refeito com fotos do Commons (2026-11-22: «Basel - Markthalle.jpg», «Markthalle Basel.jpg», «Markthalle (50765362043).jpg»;
// «Bahnhof Basel SBB (2026-08-01).jpg», «Basel SBB, Bahnhof.jpg»):
// - Markthalle: o swissBUILDINGS3D faz da cúpula uma pirâmide de 8 faces (base a 29,1 m, lanterna a 36,7–40,9 m). Por cima
//   vai uma abóbada de 8 gomos curva, da cornija à lanterna (de cobre avermelhado fosco), as 8 nervuras e o anel da base em verde-menta e a
//   lanterna de vidro; o letreiro (cinza-escuro, letras espaçadas) em pé sobre a cornija do bloco da entrada (21,1 m).
// - SBB: no lugar do telhado de quatro águas da frente, o arco envidraçado entre as torres com moldura verde, o escudo
//   suíço no alto e um relógio em cada torre (marca a hora do céu).
const MINT = 0x86bfa9;
const tubo = (pts, r, fechado = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, fechado, 'centripetal'), pts.length * 4, r, 6, fechado);

function markthalle(g, leve) {
  const Y0 = 23.6, C = [-172.5, 1009.3]; // chão do sólido e centro da cúpula
  const BASE = [[-194.8, 1014.9], [-192.3, 997.5], [-184.2, 1028.9], [-178.2, 986.9], [-166.8, 1031.4], [-160.9, 989.4], [-152.8, 1020.8], [-150.3, 1003.4]]
    .sort((a, b) => Math.atan2(a[1] - C[1], a[0] - C[0]) - Math.atan2(b[1] - C[1], b[0] - C[0]));
  // abóbada: perfil de quarto de elipse da cornija do bloco da entrada (21,3 m, 1,25× o octógono do sólido) à lanterna
  // (37,3 m); assim cobre também a saia de telhado entre 21 e 29 m que o sólido tem: na foto a cúpula desce até a cornija
  const hb = Y0 + 21.3, H = 16, rhoL = 0.31, R0 = 1.25, NF = 14;
  const ponto = (k, phi, s = 1.004) => { const [x, z] = BASE[k % 8], rho = (rhoL + (R0 - rhoL) * Math.cos(phi)) * s;
    return new THREE.Vector3(C[0] + (x - C[0]) * rho, hb + H * Math.sin(phi), C[1] + (z - C[1]) * rho); };
  const pos = [];
  for (let k = 0; k < 8; k++) for (let j = 0; j < NF; j++) {
    const f0 = (j / NF) * Math.PI / 2, f1 = ((j + 1) / NF) * Math.PI / 2;
    const a = ponto(k, f0), b = ponto(k + 1, f0), c = ponto(k + 1, f1), d = ponto(k, f1);
    pos.push(...a.toArray(), ...c.toArray(), ...b.toArray(), ...a.toArray(), ...d.toArray(), ...c.toArray());
  }
  const gd = new THREE.BufferGeometry(); gd.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gd.computeVertexNormals();
  const cupula = new THREE.Mesh(gd, new THREE.MeshStandardMaterial({ color: 0x8e5547, roughness: 0.85, side: THREE.DoubleSide }));
  const meridiano = (k) => Array.from({ length: NF + 1 }, (_, j) => ponto(k, (j / NF) * Math.PI / 2, 1.02));
  const anel = (phi, s) => Array.from({ length: 8 }, (_, k) => ponto(k, phi, s));
  const verde = new THREE.MeshStandardMaterial({ color: MINT, roughness: 0.6 });
  const geoVerde = mergeGeometries([...Array.from({ length: 8 }, (_, k) => tubo(meridiano(k), 0.7)), tubo(anel(0, 1.02), 0.9, true), tubo(anel(Math.PI / 2, 1.03), 0.5, true)]);
  // lanterna: prisma de vidro de 8 lados sobre o topo, com tampa de cobre verde
  const L = anel(Math.PI / 2, 1.05), topo = hb + H, alt = 4.6, vidroPos = [], capPos = [], pico = new THREE.Vector3(C[0], topo + alt + 2.8, C[1]);
  for (let k = 0; k < 8; k++) { const a = L[k], b = L[(k + 1) % 8], a2 = a.clone().setY(topo + alt), b2 = b.clone().setY(topo + alt);
    vidroPos.push(...a.toArray(), ...b2.toArray(), ...b.toArray(), ...a.toArray(), ...a2.toArray(), ...b2.toArray()); capPos.push(...a2.toArray(), ...pico.toArray(), ...b2.toArray()); }
  const geo = (p) => { const x = new THREE.BufferGeometry(); x.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); x.computeVertexNormals(); return x; };
  const vidro = new THREE.Mesh(geo(vidroPos), new THREE.MeshStandardMaterial({ color: 0x55666c, roughness: 0.15, metalness: 0.6, side: THREE.DoubleSide }));
  const chapeu = new THREE.Mesh(geo(capPos), verde), tampa = new THREE.Mesh(mergeGeometries([tubo(L.map((v) => v.clone().setY(topo + alt)), 0.3, true), ...L.map((v) => new THREE.CylinderGeometry(0.14, 0.14, alt, 4).translate(v.x, topo + alt / 2, v.z))]), verde);
  const verdes = new THREE.Mesh(geoVerde, verde);
  for (const m of [cupula, verdes, vidro, tampa, chapeu]) { m.castShadow = !leve; m.receiveShadow = true; g.add(m); }
  // letreiro: letras cinza-escuras espaçadas, de pé na cornija do bloco da entrada (frente de (−189,2, 1037,4) a (−165,2, 1040,9))
  { const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128; const c = cv.getContext('2d');
    c.fillStyle = '#34373a'; c.font = '700 112px "Futura", "Century Gothic", Inter, Helvetica, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    if ('letterSpacing' in c) c.letterSpacing = '14px';
    c.fillText('MARKTHALLE', 512, 118);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(22, 2.75), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.6, side: THREE.DoubleSide }));
    const ang = Math.atan2(1040.9 - 1037.4, -165.2 + 189.2); // a fachada gira ~8°
    m.rotation.y = -ang; m.position.set(-177.2 - Math.sin(ang) * 0.6, Y0 + 21.1 + 1.38, 1039.15 + Math.cos(ang) * 0.6); m.castShadow = !leve; g.add(m); }
}

// face de relógio num canvas (mostrador branco, 12 marcas) e dois ponteiros que seguem a hora do céu
function relogio() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
  c.fillStyle = '#f4f1e8'; c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.fill(); c.lineWidth = 5; c.strokeStyle = '#2b2b2b'; c.stroke();
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.moveTo(64 + Math.sin(a) * 46, 64 - Math.cos(a) * 46); c.lineTo(64 + Math.sin(a) * 54, 64 - Math.cos(a) * 54); c.lineWidth = i % 3 ? 3 : 6; c.stroke(); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

function sbb(g, leve, ceu) {
  const Y0 = 28.75, n = new THREE.Vector2(0.493, -0.869), u = new THREE.Vector2(0.869, 0.493); // normal da fachada (para a praça) e direção
  const M = [31.25, 1182.75], rotY = Math.atan2(u.y, u.x); // meio da frente do bloco central (a 17,1 m)
  // arco envidraçado: meia elipse de 29 m de vão e 10,5 m de flecha sobre a cornija, caixilhos e moldura verdes
  { const W = 1024, Hc = 384, cv = document.createElement('canvas'); cv.width = W; cv.height = Hc; const c = cv.getContext('2d');
    const arco = (r) => { c.beginPath(); c.ellipse(W / 2, Hc, (W / 2) * r, Hc * r, 0, Math.PI, 0); c.closePath(); };
    arco(1); c.fillStyle = '#86bfa9'; c.fill(); arco(0.93); c.fillStyle = '#7a8d92'; c.fill(); c.save(); arco(0.93); c.clip();
    c.strokeStyle = '#a9cbbb'; c.lineWidth = 5; for (let x = 0; x < W; x += 34) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, Hc); c.stroke(); }
    c.lineWidth = 4; for (let y = Hc - 48; y > 0; y -= 48) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, 0, W, Hc * 0.45); c.restore();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(29.4, 11.0), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide }));
    m.rotation.y = Math.PI - rotY; m.position.set(M[0] + n.x * 0.35, Y0 + 17.1 + 5.5, M[1] + n.y * 0.35); m.castShadow = !leve; g.add(m);
    // escudo suíço no alto do arco
    const cs = document.createElement('canvas'); cs.width = cs.height = 64; const s = cs.getContext('2d');
    s.fillStyle = '#d52b1e'; s.fillRect(0, 0, 64, 64); s.fillStyle = '#fff'; s.fillRect(26, 12, 12, 40); s.fillRect(12, 26, 40, 12);
    const ts = new THREE.CanvasTexture(cs); ts.colorSpace = THREE.SRGBColorSpace;
    const e = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshStandardMaterial({ map: ts, roughness: 0.6 }));
    e.rotation.y = Math.PI - rotY; e.position.set(M[0] + n.x * 0.5, Y0 + 17.1 + 11.4, M[1] + n.y * 0.5); g.add(e); }
  // relógios: na frente de cada torre (centro + 3,75 m na normal), a 19,5 m
  const face = new THREE.MeshStandardMaterial({ map: relogio(), roughness: 0.5 }), preto = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6 });
  const ponteiros = [];
  for (const [x, z] of [[12.3, 1174.9], [48.1, 1195.3]]) {
    const r = new THREE.Group(); r.rotation.y = Math.PI - rotY; r.position.set(x + n.x * 3.8, Y0 + 19.5, z + n.y * 3.8);
    r.add(new THREE.Mesh(new THREE.CircleGeometry(1.35, 24), face));
    const hor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.04).translate(0, 0.3, 0.05), preto), min = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.04).translate(0, 0.47, 0.07), preto);
    r.add(hor, min); ponteiros.push([hor, min]); g.add(r);
  }
  const acerta = (st) => { const h = st.hora ?? 12; for (const [a, b] of ponteiros) { a.rotation.z = -((h % 12) / 12) * Math.PI * 2; b.rotation.z = -(h % 1) * Math.PI * 2; } };
  if (ceu) { acerta(ceu.estado()); ceu.aoMudar(acerta); }
}

export function criarLocais({ cena, altura, ceu, leve = false }) {
  const g = new THREE.Group(); g.name = 'locais';
  markthalle(g, leve); sbb(g, leve, ceu);
  // bicicletas estacionadas: rodas, quadro e guidão, em fileiras com tons e ângulos variados
  const roda = (z) => new THREE.TorusGeometry(0.33, 0.025, 4, 12).rotateY(Math.PI / 2).translate(0, 0.35, z);
  const parte = (w, h, d, x, y, z, rx = 0) => new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z);
  const geo = mergeGeometries([roda(0.52), roda(-0.52), parte(0.04, 0.04, 1.0, 0, 0.58, 0, -0.25), parte(0.04, 0.45, 0.04, 0, 0.55, -0.2, 0.3), parte(0.45, 0.03, 0.03, 0, 0.95, 0.42), parte(0.1, 0.04, 0.22, 0, 0.84, -0.22)]);
  const filas = [[-212, 1051.5, -140, 1051.5, 0.75], [-2, 1146, 60, 1146, 0.65], [-2, 1163, 60, 1163, 0.65], [66, 1150, 66, 1166, 0.7]];
  const pos = []; for (const [ax, az, bx, bz, passo] of filas) { const L = Math.hypot(bx - ax, bz - az); for (let s = 0; s < L; s += passo) if (Math.sin(s * 12.9898 + ax) > -0.55) pos.push([ax + (bx - ax) * s / L, az + (bz - az) * s / L, Math.atan2(bz - az, bx - ax)]); }
  const n = leve ? Math.floor(pos.length / 2) : pos.length;
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.4 }), n);
  const CORES = ['#1d1d1d', '#2f4a6b', '#7a1d1d', '#d8d4cc', '#2f6b3a', '#8a8a88', '#c8a020', '#1d1d1d'].map((c) => new THREE.Color(c));
  const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), um = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) { const [x, z, a] = pos[leve ? i * 2 : i]; q.setFromAxisAngle(Y, a + Math.PI / 2 + Math.sin(i * 7.1) * 0.12); im.setMatrixAt(i, mt.compose(p.set(x, altura(x, z), z), q, um)); im.setColorAt(i, CORES[i % CORES.length]); }
  im.castShadow = !leve; im.receiveShadow = true; g.add(im);
  cena.add(g);
  return { g, bicicletas: n };
}
