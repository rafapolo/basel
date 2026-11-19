// Modo jogo (2026-11-19): uma bicicleta vermelha que sai do meio da Mittlere Brücke e corre pela cidade atrás de sete
// lugares (Marktplatz, Münsterplatz, Pfalz, Barfi, Rheinbord, Claraplatz e a chegada na estação SBB), contra o relógio. É uma
// e-bike (S-Pedelec): até 45 km/h. W/S ou ↑/↓ pedalam e freiam, A/D ou ←/→ viram, B toca a campainha, V troca a câmera
// (atrás / primeira pessoa), Esc sai. Bater num bonde ou num carro, ou cair no Reno, acaba a corrida: volta à largada.
// Sair e entrar de novo pelo botão retoma de onde parou (posição, lugares feitos e relógio).
// Em tela de toque, quatro botões. Os prédios são sólidos: uma grade de 1 m com a projeção dos telhados do LOD2
// (montada só na primeira volta); as pontes, pela altura das faixas do OSM.
const C = window.cidade;
const { THREE, camera, controls, altura } = C;
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;

// ---------- lugares da corrida ----------
const ALVOS = [
  { n: 'Marktplatz', x: -124.2, z: 18.9 },
  { n: 'Münsterplatz', x: 162.6, z: 186.6 },
  { n: 'Pfalz', x: 247.9, z: 175.2 },
  { n: 'Barfüsserplatz', x: -8.4, z: 413.3 },
  { n: 'Rheinbord', x: 192.3, z: -172.3 },
  { n: 'Claraplatz', x: 340.3, z: -356.7 },
  { n: 'Bahnhof SBB', x: 64, z: 1088 }, // a chegada: Centralbahnplatz, na frente da estação (20 m livres em volta na grade)
];
const RAIO_ALVO = 9;

// ---------- grade de ocupação (prédios) e de altura das pontes ----------
const R = C.relevo, G = { x0: R.x0, z0: R.z0, nx: Math.floor((R.nx - 1) * R.passo), nz: Math.floor((R.ny - 1) * R.passo) };
let ocup = null, hPonte = null;
function montarGrade() {
  ocup = new Uint8Array(G.nx * G.nz);
  hPonte = new Float32Array(G.nx * G.nz).fill(NaN);
  const p = C.posicoes, nt = C.nTris;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < nt; t++) {
    a.fromArray(p, t * 9); b.fromArray(p, t * 9 + 3); c.fromArray(p, t * 9 + 6);
    n.subVectors(b, a).cross(c.clone().sub(a));
    if (Math.abs(n.y) < 0.35 * n.length()) continue; // só telhados e topos: a projeção deles é a planta do prédio
    const x0 = Math.floor(Math.min(a.x, b.x, c.x) - G.x0), x1 = Math.ceil(Math.max(a.x, b.x, c.x) - G.x0);
    const z0 = Math.floor(Math.min(a.z, b.z, c.z) - G.z0), z1 = Math.ceil(Math.max(a.z, b.z, c.z) - G.z0);
    const d = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
    if (Math.abs(d) < 1e-6) continue;
    for (let j = Math.max(0, z0); j <= Math.min(G.nz - 1, z1); j++) for (let i = Math.max(0, x0); i <= Math.min(G.nx - 1, x1); i++) {
      const px = G.x0 + i + 0.5, pz = G.z0 + j + 0.5;
      const u = ((b.x - px) * (c.z - pz) - (c.x - px) * (b.z - pz)) / d, v = ((c.x - px) * (a.z - pz) - (a.x - px) * (c.z - pz)) / d;
      if (u >= -0.02 && v >= -0.02 && u + v <= 1.04) ocup[j * G.nx + i] = 1;
    }
  }
  // pontes: cada faixa do OSM com ponte vira uma tira de altura (reta entre as cabeceiras, como em cidade.js)
  for (const l of C.ruas.linhas) {
    if (!l.ponte || l.c.length < 4) continue;
    const c0 = l.c, larg = (l.t === 'footway' || l.t === 'cycleway' || l.t === 'path' ? 3 : 8) / 2 + 1;
    const hA = C.cotaPonta(altura, c0[0], c0[1], c0[2], c0[3]), hB = C.cotaPonta(altura, c0.at(-2), c0.at(-1), c0.at(-4), c0.at(-3));
    let total = 0; for (let i = 0; i < c0.length - 2; i += 2) total += Math.hypot(c0[i + 2] - c0[i], c0[i + 3] - c0[i + 1]);
    let s = 0;
    for (let i = 0; i < c0.length - 2; i += 2) {
      const ax = c0[i], az = c0[i + 1], bx = c0[i + 2], bz = c0[i + 3], L = Math.hypot(bx - ax, bz - az) || 1;
      for (let k = 0; k <= L; k += 0.5) {
        const x = ax + ((bx - ax) * k) / L, z = az + ((bz - az) * k) / L, h = hA + (hB - hA) * ((s + k) / (total || 1)) + 0.6;
        for (let dj = -larg; dj <= larg; dj++) for (let di = -larg; di <= larg; di++) {
          if (di * di + dj * dj > larg * larg) continue;
          const ci = Math.floor(x + di - G.x0), cj = Math.floor(z + dj - G.z0);
          if (ci < 0 || cj < 0 || ci >= G.nx || cj >= G.nz) continue;
          const q = cj * G.nx + ci;
          hPonte[q] = Number.isNaN(hPonte[q]) ? h : Math.max(hPonte[q], h);
          ocup[q] = 0; // o tabuleiro passa por cima de qualquer coisa
        }
      }
      s += L;
    }
  }
}
const cel = (x, z) => { const i = Math.floor(x - G.x0), j = Math.floor(z - G.z0); return i < 0 || j < 0 || i >= G.nx || j >= G.nz ? -1 : j * G.nx + i; };
const bloqueado = (x, z) => { const q = cel(x, z); return q < 0 || ocup[q] === 1; };
// altura do piso: Mittlere (marcos.js), outras pontes (grade), relevo
function piso(x, z) {
  const m = C.cotaPonte(x, z);
  if (m != null) return { y: m, ponte: true };
  const q = cel(x, z), h = q >= 0 ? hPonte[q] : NaN;
  if (!Number.isNaN(h)) return { y: h, ponte: true };
  return { y: altura(x, z), ponte: false };
}
const naAgua = (x, z) => { const p = piso(x, z); return !p.ponte && p.y < C.nivelReno - 0.25; };

// ---------- bicicleta vermelha com ciclista ----------
function criarBici() {
  const g = new THREE.Group();
  const vermelho = new THREE.MeshStandardMaterial({ color: 0xc4161c, roughness: 0.35, metalness: 0.4 });
  const preto = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 });
  const cromo = new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.25, metalness: 0.9 });
  const tubo = (a, b, r, mat) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), L = va.distanceTo(vb);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), mat);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    m.castShadow = true; return m;
  };
  // quadro em z (frente = +z): roda traseira em z = −0,52, dianteira em +0,52, raio 0,34
  const R0 = 0.34, eixoT = [0, R0, -0.52], eixoD = [0, R0, 0.52], pedal = [0, 0.3, -0.02], selim = [0, 0.95, -0.2], guidao = [0, 1.02, 0.38];
  const rodas = [];
  for (const e of [eixoT, eixoD]) {
    const r = new THREE.Group(); r.position.set(...e);
    const pneu = new THREE.Mesh(new THREE.TorusGeometry(R0, 0.03, 8, 28), preto); pneu.rotation.y = Math.PI / 2; pneu.castShadow = true;
    r.add(pneu);
    for (let k = 0; k < 6; k++) { const s = tubo([0, 0, 0], [0, Math.cos(k / 6 * TAU) * R0, Math.sin(k / 6 * TAU) * R0], 0.006, cromo); r.add(s); }
    g.add(r); rodas.push(r);
  }
  g.add(tubo(eixoT, pedal, 0.022, vermelho), tubo(pedal, selim, 0.026, vermelho), tubo(eixoT, selim, 0.02, vermelho),
    tubo(selim, [0, 0.9, 0.33], 0.026, vermelho), tubo(pedal, [0, 0.9, 0.33], 0.03, vermelho), tubo([0, 0.9, 0.33], eixoD, 0.022, vermelho),
    tubo([0, 0.9, 0.33], guidao, 0.02, cromo), tubo([-0.26, 1.02, 0.38], [0.26, 1.02, 0.38], 0.016, preto));
  const sel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.26), preto); sel.position.set(0, 0.98, -0.22); g.add(sel);
  // pedivela (gira com a pedalada)
  const pedivela = new THREE.Group(); pedivela.position.set(...pedal);
  pedivela.add(tubo([0.07, 0, 0], [0.07, 0.17, 0], 0.012, cromo), tubo([-0.07, 0, 0], [-0.07, -0.17, 0], 0.012, cromo));
  g.add(pedivela);
  // ciclista: casaco azul-escuro, capacete branco
  const roupa = new THREE.MeshStandardMaterial({ color: 0x24324a, roughness: 0.8 }), pele = new THREE.MeshStandardMaterial({ color: 0xd9a984, roughness: 0.8 });
  const calca = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.85 }), capacete = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4 });
  g.add(tubo([0, 1.02, -0.18], [0, 1.5, 0.05], 0.15, roupa));
  const cab = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), pele); cab.position.set(0, 1.68, 0.1); g.add(cab);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, TAU, 0, Math.PI / 2), capacete); cap.position.set(0, 1.71, 0.09); g.add(cap);
  for (const s of [-1, 1]) g.add(tubo([s * 0.17, 1.42, 0.02], [s * 0.24, 1.04, 0.36], 0.04, roupa));
  const pernas = [];
  for (const s of [-1, 1]) { const p = tubo([0, 0, 0], [0, 1, 0], 0.055, calca); g.add(p); pernas.push({ m: p, s }); }
  // luzes: farol baixo no guidão (cone de luz para a frente e para baixo) e lanterna vermelha no bagageiro; as lentes
  // brilham (emissivas) e as luzes de verdade ficam sempre na cena, com intensidade 0 de dia (ligar e desligar uma luz
  // obriga o three a recompilar todos os materiais)
  const lenteF = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff3d6, emissiveIntensity: 0 });
  const lenteT = new THREE.MeshStandardMaterial({ color: 0x3a0505, emissive: 0xff1a10, emissiveIntensity: 0 });
  const farolM = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.07, 12).rotateX(Math.PI / 2), lenteF); farolM.position.set(0, 0.93, 0.46);
  const rack = tubo([0, 0.74, -0.2], [0, 0.74, -0.68], 0.012, preto);
  const lanternaM = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.025), lenteT); lanternaM.position.set(0, 0.72, -0.7);
  const farol = new THREE.SpotLight(0xfff1d0, 0, 38, 0.42, 0.55, 1.4);
  farol.position.set(0, 0.95, 0.5); farol.target.position.set(0, -0.6, 7); // farol baixo: ilumina o chão à frente, não a parede farol.castShadow = false;
  const lanterna = new THREE.PointLight(0xff2010, 0, 5, 2); lanterna.position.set(0, 0.72, -0.78);
  g.add(farolM, rack, lanternaM, farol, farol.target, lanterna);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { rodas, pedivela, pernas, R0, pedal, selim, luzes: { farol, lanterna, lenteF, lenteT } };
  return g;
}
const vA = new THREE.Vector3(), vB = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
function animarPernas(b, fase) {
  const { pernas, pedal, selim } = b.userData;
  for (const { m, s } of pernas) {
    const a = fase + (s > 0 ? 0 : Math.PI);
    vA.set(s * 0.09, selim[1] + 0.02, selim[2] + 0.02);
    vB.set(s * 0.09, pedal[1] + Math.cos(a) * 0.17, pedal[2] + Math.sin(a) * 0.17);
    const L = vA.distanceTo(vB);
    m.position.copy(vA).add(vB).multiplyScalar(0.5);
    m.scale.set(1, L, 1);
    m.quaternion.setFromUnitVectors(Y, vB.clone().sub(vA).normalize());
  }
}

// ---------- farol do próximo alvo ----------
function criarFarol() {
  const g = new THREE.Group();
  const coluna = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 70, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  coluna.position.y = 35;
  const anel = new THREE.Mesh(new THREE.TorusGeometry(RAIO_ALVO * 0.8, 0.25, 8, 48), new THREE.MeshBasicMaterial({ color: 0xf2c14e }));
  anel.rotation.x = Math.PI / 2; anel.position.y = 0.4;
  g.add(coluna, anel);
  g.userData.anel = anel;
  return g;
}

// ---------- interface ----------
const css = document.createElement('style');
css.textContent = `
body.jogando #painel, body.jogando #topo, body.jogando #ficha, body.jogando #creditos { opacity: 0; pointer-events: none; transition: opacity .4s; }
#jogo { position: fixed; inset: 0; z-index: 40; pointer-events: none; font: 600 14px/1.3 system-ui, sans-serif; color: #f6efe0; }
#jogo[hidden] { display: none; }
#jogo .caixa { position: absolute; background: rgba(20,18,24,.72); border-radius: 12px; padding: 10px 14px; backdrop-filter: blur(6px); }
#jogo .topo { top: 14px; left: 50%; transform: translateX(-50%); display: flex; gap: 18px; align-items: center; white-space: nowrap; }
#jogo .topo b { color: #f2c14e; font-size: 16px; }
#jogo-seta { display: inline-block; width: 0; height: 0; border-left: 9px solid transparent; border-right: 9px solid transparent; border-bottom: 18px solid #f2c14e; transition: transform .1s linear; }
#jogo .vel { right: 16px; bottom: 16px; text-align: right; }
#jogo .vel b { font-size: 30px; display: block; line-height: 1; }
#jogo .ajuda { left: 16px; bottom: 16px; font-weight: 500; font-size: 12px; opacity: .85; max-width: 46ch; }
#jogo .msg { top: 38%; left: 50%; transform: translate(-50%, -50%); font-size: 22px; text-align: center; opacity: 0; transition: opacity .3s; }
#jogo .msg.on { opacity: 1; }
#jogo .msg small { display: block; font-size: 14px; font-weight: 500; margin-top: 6px; opacity: .85; }
#jogo-sair { position: absolute; top: 14px; left: 16px; pointer-events: auto; border: 0; border-radius: 999px; padding: 7px 14px; background: rgba(20,18,24,.72); color: #f6efe0; font: 600 13px system-ui; cursor: pointer; }
#jogo .toque { position: absolute; bottom: 90px; display: none; gap: 10px; pointer-events: auto; }
#jogo .toque button { width: 64px; height: 64px; border-radius: 50%; border: 0; background: rgba(20,18,24,.6); color: #fff; font-size: 24px; touch-action: none; user-select: none; -webkit-user-select: none; }
#jogo .toque.esq { left: 16px; } #jogo .toque.dir { right: 16px; }
@media (pointer: coarse) { #jogo .toque { display: flex; } #jogo .ajuda { display: none; } }
@media (max-width: 640px) { #jogo .topo { gap: 10px; font-size: 12px; } }`;
document.head.appendChild(css);
const hud = document.createElement('div');
hud.id = 'jogo'; hud.hidden = true;
hud.innerHTML = `
<button id="jogo-sair" type="button">✕ esc</button>
<div class="caixa topo"><span id="jogo-seta"></span><span><span id="jogo-alvo"></span> · <span id="jogo-dist"></span></span><span id="jogo-cont"></span><b id="jogo-tempo">0:00</b></div>
<div class="caixa vel"><b id="jogo-kmh">0</b>km/h</div>
<div class="caixa ajuda" id="jogo-ajuda"></div>
<div class="caixa msg" id="jogo-msg"></div>
<div class="toque esq"><button data-k="esq" aria-label="left">◀</button><button data-k="dir" aria-label="right">▶</button></div>
<div class="toque dir"><button data-k="tras" aria-label="brake">▼</button><button data-k="frente" aria-label="pedal">▲</button></div>`;
document.body.appendChild(hud);

// ---------- estado ----------
let ativo = false, bici = null, farol = null, raf = 0, tAnt = 0;
const S = { x: 0, z: 0, y: 0, rumo: 0, v: 0, incl: 0, fase: 0, alvo: 0, t0: 0, fim: 0, tremor: 0, caiu: 0, morto: 0 };
const tecla = { frente: false, tras: false, esq: false, dir: false };
const MAPA = { KeyW: 'frente', ArrowUp: 'frente', KeyS: 'tras', ArrowDown: 'tras', KeyA: 'esq', ArrowLeft: 'esq', KeyD: 'dir', ArrowRight: 'dir' };
let salvo = null;

let msgT = 0;
function mensagem(txt, sub = '', ms = 2200) {
  const m = $('jogo-msg');
  m.innerHTML = `${txt}${sub ? `<small>${sub}</small>` : ''}`;
  m.classList.add('on');
  clearTimeout(msgT); msgT = setTimeout(() => m.classList.remove('on'), ms);
}

// campainha: dois parciais de seno que se apagam (WebAudio, só depois de uma tecla)
let ac = null;
function campainha() {
  try {
    ac ??= new AudioContext();
    const t = ac.currentTime;
    for (const [f, g0] of [[2380, 0.18], [3150, 0.08]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = f; g.gain.setValueAtTime(g0, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.95);
    }
  } catch { /* sem áudio */ }
}

const melhorChave = 'basel-jogo-melhor';
const lerMelhor = () => { try { return +localStorage.getItem(melhorChave) || 0; } catch { return 0; } };
const gravarMelhor = (ms) => { try { localStorage.setItem(melhorChave, String(ms)); } catch { /* sem armazenamento */ } };
const mmss = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function proximoAlvo() {
  const a = ALVOS[S.alvo];
  if (!a) return;
  farol.position.set(a.x, piso(a.x, a.z).y, a.z);
  $('jogo-alvo').textContent = a.n;
  $('jogo-cont').textContent = `${S.alvo + 1}/${ALVOS.length}`;
}

function iniciar() {
  if (ativo || window.tour?.ativo()) return;
  // a pé na vista de rua: a bici aparece onde se está, virada para onde se olha
  let aqui = null;
  if (C.rua()) {
    const p = camera.position, d = new THREE.Vector3(); camera.getWorldDirection(d);
    aqui = { x: p.x, z: p.z, rumo: Math.atan2(d.x, d.z) };
    C.sairRua(false);
  }
  if (!ocup) montarGrade();
  if (!bici) { bici = criarBici(); farol = criarFarol(); C.cena.add(bici, farol); }
  bici.visible = farol.visible = true;
  ativo = true;
  salvo = C.lerCamera();
  C.fecharFicha();
  controls.enabled = false;
  document.body.classList.add('jogando');
  hud.hidden = false;
  const retoma = pausa != null && !S.fim;
  if (retoma) { S.t0 += performance.now() - pausa; S.v = 0; proximoAlvo(); farol.visible = S.alvo < ALVOS.length; }
  else largada();
  pausa = null;
  if (aqui && !bloqueado(aqui.x, aqui.z)) { Object.assign(S, aqui, { v: 0 }); S.y = piso(S.x, S.z).y; }
  const melhor = lerMelhor();
  $('jogo-ajuda').innerHTML = t('W/S ou ↑/↓ pedala e freia · A/D ou ←/→ vira · B campainha · V câmera · Esc sai (o botão retoma) · cuidado com bondes, carros e o Reno',
    'W/S or ↑/↓ pedal and brake · A/D or ←/→ steer · B bell · V camera · Esc exits (the button resumes) · mind trams, cars and the Rhine',
    'W/S oder ↑/↓ treten und bremsen · A/D oder ←/→ lenken · B Klingel · V Kamera · Esc beendet (der Knopf macht weiter) · Achtung vor Trams, Autos und dem Rhein') +
    (melhor ? `<br>${t('melhor tempo', 'best time', 'Bestzeit')}: ${mmss(melhor)}` : '');
  if (aqui) mensagem(t('E-bike aqui', 'E-bike right here', 'E-Bike genau hier'), t(`siga a seta até ${ALVOS[S.alvo]?.n ?? 'a chegada'}`, `follow the arrow to ${ALVOS[S.alvo]?.n ?? 'the finish'}`, `folgen Sie dem Pfeil zu ${ALVOS[S.alvo]?.n ?? 'dem Ziel'}`), 2200);
  else if (retoma) mensagem(t('De volta à e-bike', 'Back on the e-bike', 'Zurück auf dem E-Bike'), `${S.alvo}/${ALVOS.length} · ${mmss(performance.now() - S.t0)}`, 1800);
  else mensagem(t('E-bike vermelha na Mittlere Brücke', 'Red e-bike on the Mittlere Brücke', 'Rotes E-Bike auf der Mittleren Brücke'),
    t(`Passe pelos ${ALVOS.length} lugares; siga a seta e a luz dourada.`, `Ride through all ${ALVOS.length} places; follow the arrow and the golden light.`, `Fahren Sie alle ${ALVOS.length} Orte an; folgen Sie dem Pfeil und dem goldenen Licht.`), 3800);
  tAnt = performance.now();
  raf = requestAnimationFrame(passo);
}

// largada: na Mittlere, do lado de Kleinbasel, virada para Grossbasel; relógio e lugares do zero
function largada() {
  // na calçada de montante (7 m do eixo, fora dos trilhos do bonde que corre pelo meio da ponte)
  const { A, B } = C.ponte, f = 0.62, L = Math.hypot(B[0] - A[0], B[1] - A[1]), nx = -(B[1] - A[1]) / L, nz = (B[0] - A[0]) / L;
  Object.assign(S, { x: A[0] + (B[0] - A[0]) * f + nx * 7, z: A[1] + (B[1] - A[1]) * f + nz * 7, rumo: Math.atan2(A[0] - B[0], A[1] - B[1]), v: 0, incl: 0, alvo: 0, fim: 0, caiu: 0, morto: 0, derrubados: 0 });
  S.y = piso(S.x, S.z).y;
  S.t0 = performance.now();
  bici.rotation.set(0, 0, 0);
  farol.visible = true;
  proximoAlvo();
}
// batida ou Reno: a bici tomba, a tela avisa e, 1,8 s depois, a corrida recomeça da largada
function morrer(agora, motivo) {
  if (S.morto) return;
  S.morto = agora; S.tremor = 0.6;
  const txt = {
    bonde: t('Bateu num bonde!', 'Hit by a tram!', 'Von einem Tram erwischt!'),
    carro: t('Bateu num carro!', 'Hit by a car!', 'Von einem Auto erwischt!'),
    reno: t('Tchibum! Caiu no Reno', 'Splash! Into the Rhine', 'Platsch! In den Rhein'),
  }[motivo];
  mensagem(txt, t('de volta à largada…', 'back to the start…', 'zurück zum Start…'), 1700);
}

let pausa = null; // instante em que se saiu no meio da corrida (para retomar e descontar do relógio)
function parar() {
  if (!ativo) return;
  ativo = false;
  pausa = S.fim || S.morto ? null : performance.now();
  cancelAnimationFrame(raf);
  hud.hidden = true;
  document.body.classList.remove('jogando');
  bici.visible = farol.visible = false;
  // a câmera fica por perto da bicicleta, em órbita
  C.porCamera({ alvo: [S.x, S.y + 1, S.z], dist: 60, az: S.rumo + Math.PI, polar: THREE.MathUtils.degToRad(62) });
  controls.enabled = true;
  controls.update();
  for (const k of Object.keys(tecla)) tecla[k] = false;
}

let vista = 0; // 0 = atrás, 1 = primeira pessoa
const camAlvo = new THREE.Vector3(), olhar = new THREE.Vector3(), olharS = new THREE.Vector3();
function passo(agora) {
  if (!ativo) return;
  raf = requestAnimationFrame(passo);
  const dt = Math.min(0.05, (agora - tAnt) / 1000); tAnt = agora;
  // ---- física ----
  if (S.morto) { // tombada: só a queda e a espera até recomeçar
    S.v *= 1 - 4 * dt; S.incl += (1.45 - S.incl) * Math.min(1, dt * 5);
    if (agora - S.morto > 1800) largada();
  }
  const vmax = 12.5; // e-bike rápida (S-Pedelec): 45 km/h
  if (S.morto) { /* sem pedal */ }
  else if (tecla.frente) S.v += (S.v < 0 ? 6 : 5.2 * (1 - (S.v / vmax) ** 2)) * dt; // o motor ajuda até perto do teto
  else if (tecla.tras) S.v = S.v > 0 ? Math.max(0, S.v - 9 * dt) : Math.max(-2.2, S.v - 2 * dt);
  else S.v *= 1 - 0.25 * dt;
  if (S.v > vmax) S.v -= (S.v - vmax) * 2 * dt;
  const giro = (tecla.esq ? 1 : 0) - (tecla.dir ? 1 : 0);
  const pega = Math.min(1, Math.abs(S.v) / 2.5);
  S.rumo += giro * dt * (1.9 - 0.8 * Math.min(1, Math.abs(S.v) / 12)) * pega * Math.sign(S.v || 1);
  if (!S.morto) S.incl += (-giro * Math.min(1, S.v / 7) * 0.32 - S.incl) * Math.min(1, dt * 6);
  const fx = Math.sin(S.rumo), fz = Math.cos(S.rumo);
  const xAnt = S.x, zAnt = S.z; // para varrer o trajeto do quadro (a 45 km/h, ~0,8 m a 15 fps)
  const nx = S.x + fx * S.v * dt, nz = S.z + fz * S.v * dt;
  const frente = 0.7 * Math.sign(S.v || 1);
  const livre = (x, z) => !bloqueado(x + fx * frente, z + fz * frente) && !bloqueado(x, z);
  if (livre(nx, nz)) { S.x = nx; S.z = nz; }
  else if (livre(nx, S.z)) { S.x = nx; S.v *= 1 - 1.5 * dt; }
  else if (livre(S.x, nz)) { S.z = nz; S.v *= 1 - 1.5 * dt; }
  else if (Math.abs(S.v) > 0.5) { if (Math.abs(S.v) > 3) { S.tremor = 0.35; campainha(); } S.v = -S.v * 0.2; }
  else S.v = 0;
  // Reno, bonde ou carro: fim da corrida (morrer() mostra o aviso; largada() vem 1,8 s depois)
  if (!S.morto && agora - S.t0 > 2000) { // 2 s de folga na largada
    if (naAgua(S.x, S.z)) { S.caiu = agora; morrer(agora, 'reno'); }
    else { const v = window.vida?.bate(S.x + fx * 0.4, S.z + fz * 0.4, 0.45); if (v) morrer(agora, v); }
  }
  // pedestres: quem a bici pega cai no chão (e levanta 6 s depois); a bici perde metade da velocidade
  if (!S.morto && Math.abs(S.v) > 1.5) {
    let k = 0;
    const passos = Math.max(1, Math.ceil(Math.hypot(S.x - xAnt, S.z - zAnt) / 0.4));
    for (let p = 1; p <= passos; p++) {
      const px = xAnt + ((S.x - xAnt) * p) / passos + fx * 0.6, pz = zAnt + ((S.z - zAnt) * p) / passos + fz * 0.6;
      k += (window.vida?.atropela(px, pz, 0.75, fx, fz) || 0) + (C.fasnacht?.()?.derruba(px, pz, 0.75, fx, fz) || 0);
    }
    if (k) {
      S.v *= 0.5; S.tremor = 0.25; S.derrubados = (S.derrubados || 0) + k; campainha();
      mensagem(t('Opa! Derrubou alguém', 'Oops! Knocked someone over', 'Hoppla! Jemanden umgefahren'), t(`${S.derrubados} no chão nesta corrida`, `${S.derrubados} knocked down this race`, `${S.derrubados} umgefahren in diesem Rennen`), 1400);
    }
  }
  const p0 = piso(S.x, S.z), naRio = S.morto && S.caiu, yAlvo = naRio ? C.nivelReno - 1.2 : p0.y;
  S.y += (yAlvo - S.y) * Math.min(1, dt * (naRio ? 2 : 14));
  const pf = piso(S.x + fx * 0.6, S.z + fz * 0.6).y, pt = piso(S.x - fx * 0.6, S.z - fz * 0.6).y;
  const arfagem = Math.atan2(pf - pt, 1.2);
  // ---- desenho da bici ----
  S.fase += (S.v / bici.userData.R0) * dt;
  bici.position.set(S.x, S.y, S.z);
  bici.rotation.set(0, 0, 0);
  bici.rotateY(S.rumo); bici.rotateX(-arfagem); bici.rotateZ(S.incl);
  for (const r of bici.userData.rodas) r.rotation.x = S.fase;
  const pedalada = tecla.frente || Math.abs(S.v) > 0.3 ? S.fase * 0.55 : bici.userData.pedivela.rotation.x;
  bici.userData.pedivela.rotation.x = pedalada;
  animarPernas(bici, pedalada);
  // ---- luzes: acendem sozinhas ao anoitecer (uNoite vai de 0 a 1 devagar) ----
  { const n = THREE.MathUtils.smoothstep(C.U.uNoite.value, 0.25, 0.6), L = bici.userData.luzes;
    L.farol.intensity = 26 * n; L.lanterna.intensity = 2.5 * n;
    L.lenteF.emissiveIntensity = 2.2 * n; L.lenteT.emissiveIntensity = (1.4 + 0.6 * (tecla.tras ? 1 : 0)) * n; } // freio: a lanterna brilha mais
  // ---- alvo ----
  const a = ALVOS[S.alvo];
  if (a) {
    farol.userData.anel.rotation.z += dt * 0.8;
    const d = Math.hypot(a.x - S.x, a.z - S.z);
    $('jogo-dist').textContent = `${Math.round(d)} m`;
    // seta: ângulo do alvo em relação ao rumo da câmera
    const ang = Math.atan2(a.x - S.x, a.z - S.z) - S.rumo;
    $('jogo-seta').style.transform = `rotate(${-ang}rad)`;
    if (d < RAIO_ALVO && !S.morto) {
      campainha();
      S.alvo++;
      if (S.alvo < ALVOS.length) { mensagem(a.n, t('próximo: ', 'next: ', 'nächstes: ') + ALVOS[S.alvo].n, 1800); proximoAlvo(); }
      else {
        S.fim = agora - S.t0;
        const melhor = lerMelhor(), recorde = !melhor || S.fim < melhor;
        if (recorde) gravarMelhor(S.fim);
        farol.visible = false;
        $('jogo-alvo').textContent = t('chegada', 'finish', 'Ziel'); $('jogo-dist').textContent = '✓'; $('jogo-seta').style.transform = 'scale(0)';
        mensagem(t(`Volta completa em ${mmss(S.fim)}`, `Lap done in ${mmss(S.fim)}`, `Runde in ${mmss(S.fim)}`),
          recorde ? t('novo recorde!', 'new best time!', 'neue Bestzeit!') : t(`melhor: ${mmss(melhor)}`, `best: ${mmss(melhor)}`, `Bestzeit: ${mmss(melhor)}`), 6000);
      }
    }
  }
  $('jogo-tempo').textContent = mmss(S.fim || agora - S.t0);
  $('jogo-kmh').textContent = Math.round(Math.abs(S.v) * 3.6);
  // ---- câmera ----
  if (vista === 1) {
    camera.position.set(S.x + fx * 0.15, S.y + 1.62, S.z + fz * 0.15);
    olhar.set(S.x + fx * 10, S.y + 1.3 + Math.tan(arfagem) * 10, S.z + fz * 10);
    camera.up.set(Math.cos(S.rumo) * S.incl * 0.4, 1, -Math.sin(S.rumo) * S.incl * 0.4).normalize();
    camera.lookAt(olhar);
    camera.up.set(0, 1, 0);
  } else {
    // atrás e acima; se um prédio ficar entre a bici e a câmera, ela chega mais perto
    let dist = 6.5;
    for (let k = 1; k <= 8; k++) { const s = (k / 8) * 6.5; if (bloqueado(S.x - fx * s, S.z - fz * s)) { dist = Math.max(1.8, s - 1); break; } }
    camAlvo.set(S.x - fx * dist, S.y + 2.4 + (6.5 - dist) * 0.25, S.z - fz * dist);
    camera.position.lerp(camAlvo, 1 - Math.exp(-dt * 5));
    olhar.set(S.x + fx * 3, S.y + 1.2, S.z + fz * 3);
    olharS.lerp(olhar, 1 - Math.exp(-dt * 8));
    camera.lookAt(olharS);
  }
  if (S.tremor > 0) { S.tremor -= dt; camera.position.x += (Math.random() - 0.5) * S.tremor * 0.4; camera.position.y += (Math.random() - 0.5) * S.tremor * 0.4; }
  controls.target.set(S.x, S.y + 1, S.z); // para a cidade (LOD, gente perto da câmera) saber onde se está
}

addEventListener('keydown', (e) => {
  if (!ativo) return;
  if (e.key === 'Escape') { parar(); return; }
  const k = MAPA[e.code];
  if (k) { tecla[k] = true; e.preventDefault(); }
  if (e.code === 'KeyB' && !e.repeat) campainha();
  if (e.code === 'KeyV' && !e.repeat) { vista = 1 - vista; if (vista === 0) olharS.copy(olhar); }
});
addEventListener('keyup', (e) => { const k = MAPA[e.code]; if (k) tecla[k] = false; });
addEventListener('blur', () => { for (const k of Object.keys(tecla)) tecla[k] = false; });
for (const b of hud.querySelectorAll('.toque button')) {
  const k = b.dataset.k;
  b.addEventListener('pointerdown', (e) => { tecla[k] = true; b.setPointerCapture(e.pointerId); e.preventDefault(); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { tecla[k] = false; });
}
$('jogo-sair').addEventListener('click', parar);
$('jogo-abrir').addEventListener('click', iniciar);
// para a vista de rua (cidade.js): o ponto está fora de qualquer prédio, com folga de f metros? (monta a grade se preciso)
const livreRua = (x, z, f = 1.5) => { if (!ocup) montarGrade(); for (const [dx, dz] of [[0, 0], [f, 0], [-f, 0], [0, f], [0, -f]]) if (bloqueado(x + dx, z + dz)) return false; return true; };
window.jogo = { iniciar, parar, ativo: () => ativo, estado: () => ({ ...S }), S, tecla, bloqueado, piso, livreRua };
if (new URLSearchParams(location.search).get('jogo') === '1') iniciar();
