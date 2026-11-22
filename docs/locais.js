// Lugares com cara própria (2026-11-22): o letreiro MARKTHALLE em letras pretas sobre a fachada do Steinentorberg (como na
// foto da feira de quinta) e fileiras de bicicletas estacionadas na frente dela e na Centralbahnplatz (estação SBB), onde
// Basel deixa centenas. Coordenadas locais medidas nos sólidos do swissBUILDINGS3D (prédio 5921 e Centralbahnstrasse 10.1).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function criarLocais({ cena, altura, leve = false }) {
  const g = new THREE.Group(); g.name = 'locais';
  // letreiro: letras soltas num canvas transparente, de frente para o Steinentorberg (sul, +z), no alto da fachada
  { const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128; const c = cv.getContext('2d');
    c.fillStyle = '#151515'; c.font = '900 104px Inter, Helvetica, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('MARKTHALLE', 512, 70);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(34, 4.25), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.6, side: THREE.DoubleSide }));
    m.position.set(-176, altura(-176, 1052) + 14.2, 1049.5); g.add(m); } // em cima da fachada da frente, à beira do telhado
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
