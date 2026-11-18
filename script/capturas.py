#!/usr/bin/env python3
"""Tira as 6 capturas fixas da cidade (câmeras de docs/cameras.js) e mede fps e peso de abertura.

Uso (com o servidor no ar, ex.: `bunx serve docs -l 3021`):
  uv run --with playwright script/capturas.py http://localhost:3021 design/comparacao/2026-11-18
  uv run --with playwright script/capturas.py http://localhost:3021 saida/ --sem-medir   # só as capturas

Grava <saida>/<camera>.png (1280x720, sem painel nem textos) e <saida>/medicao.json.
Usa o Chromium embutido do Playwright (nunca o Google Chrome instalado).
Instalar uma vez: uv run --with playwright playwright install chromium
"""
import argparse, json, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

CAMERAS = ["pfalz", "munster", "reno", "rathaus", "marktplatz", "rheinsprung"]
ARGS = ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]
SEM_UI = "body > *:not(canvas){visibility:hidden !important}"


def abrir(b, url, w, h):
    ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
    pg = ctx.new_page()
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)) if "tour?.ativo" not in str(e) else None)
    pg.on("console", lambda m: erros.append(m.text) if m.type == "error" and "tour?.ativo" not in m.text else None)
    return ctx, pg, erros


ESPERA_MS = 2500


def esperar(pg):
    pg.wait_for_selector("#carregando.fora", state="attached", timeout=120000)
    pg.wait_for_timeout(ESPERA_MS)  # damping, sombras e fog assentam


def fps(pg, ms):
    return pg.evaluate("""(ms) => new Promise((ok) => {
      const t0 = performance.now(); let n = 0, pior = 0, ant = t0;
      const f = (t) => { n++; pior = Math.max(pior, t - ant); ant = t;
        if (t - t0 < ms) requestAnimationFrame(f); else ok({ fps: +(n * 1000 / (t - t0)).toFixed(1), pior_quadro_ms: +pior.toFixed(1) }); };
      requestAnimationFrame(f); })""", ms)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base", help="URL base, ex.: http://localhost:3021")
    ap.add_argument("saida", help="pasta de saída, ex.: design/comparacao/2026-11-18")
    ap.add_argument("--sem-medir", action="store_true", help="não mede fps nem peso")
    ap.add_argument("--largura", type=int, default=1280)
    ap.add_argument("--altura", type=int, default=720)
    ap.add_argument("--espera", type=int, default=2500, help="ms depois de carregar (a ortofoto leva ~10 s: use 10000)")
    ap.add_argument("--query", default="", help="parâmetros extras, ex.: 'ano=1900'")
    a = ap.parse_args()
    global ESPERA_MS
    ESPERA_MS = a.espera
    out = Path(a.saida); out.mkdir(parents=True, exist_ok=True)
    base = a.base.rstrip("/")
    extra = ("&" + a.query) if a.query else ""
    med = {"base": base, "viewport": [a.largura, a.altura], "data": time.strftime("%Y-%m-%d")}
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=ARGS)
        try:
            med["navegador"] = b.version
            # 1) peso de abertura: carga fria, só a página padrão (a Pfalz), contando bytes das respostas
            if not a.sem_medir:
                ctx, pg, _ = abrir(b, base, a.largura, a.altura)
                # bytes realmente transferidos (comprimidos), pelo CDP; sem cache (contexto novo)
                cdp = ctx.new_cdp_session(pg); cdp.send("Network.enable")
                urls, tam = {}, {}
                cdp.on("Network.requestWillBeSent", lambda e: urls.__setitem__(e["requestId"], e["request"]["url"]))
                def fim(e):
                    u = urls.get(e["requestId"], "?")
                    tam[u] = tam.get(u, 0) + int(e["encodedDataLength"])
                cdp.on("Network.loadingFinished", fim)
                bruto = [0]
                cdp.on("Network.dataReceived", lambda e: bruto.__setitem__(0, bruto[0] + int(e["dataLength"])))
                t0 = time.time()
                pg.goto(f"{base}/?cam=pfalz{extra}", wait_until="load")
                esperar(pg)
                med["tempo_ate_cidade_s"] = round(time.time() - t0 - ESPERA_MS / 1000, 1)
                total = sum(tam.values())
                cdp.detach()
                med["peso_abertura_descomprimido_mb"] = round(bruto[0] / 1e6, 2)
                med["peso_abertura_transferido_mb"] = round(total / 1e6, 2)
                med["peso_por_arquivo_mb"] = {u.split("//", 1)[-1]: round(v / 1e6, 3) for u, v in sorted(tam.items(), key=lambda x: -x[1]) if v > 20000}
                med["fps_parado_pfalz"] = fps(pg, 4000)
                # girando a câmera (um quadro novo a cada rAF) para forçar o desenho
                med["fps_girando_pfalz"] = pg.evaluate("""() => new Promise((ok) => {
                  const C = window.cidade, c0 = C.lerCamera(), t0 = performance.now(); let n = 0;
                  const f = (t) => { n++; C.porCamera({ ...c0, az: c0.az + (t - t0) / 1500 });
                    if (t - t0 < 4000) requestAnimationFrame(f); else ok(+(n * 1000 / (t - t0)).toFixed(1)); };
                  requestAnimationFrame(f); })""")
                med["gpu"] = pg.evaluate("""() => { const g = document.createElement('canvas').getContext('webgl2');
                  const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; }""")
                med["solidos_3d"] = pg.evaluate("() => window.cidade.estat.solidos")
                ctx.close()
            # 2) as 6 capturas (cada uma numa página nova, para a câmera ser exatamente a do ?cam=)
            med["cameras"] = {}
            for cam in CAMERAS:
                ctx, pg, erros = abrir(b, base, a.largura, a.altura)
                try:
                    pg.goto(f"{base}/?cam={cam}{extra}", wait_until="load")
                    esperar(pg)
                    pg.add_style_tag(content=SEM_UI)
                    pg.wait_for_timeout(300)
                    pg.screenshot(path=str(out / f"{cam}.png"))
                    med["cameras"][cam] = {"fps": fps(pg, 2000)} if not a.sem_medir else {}
                    if erros: med["cameras"][cam]["erros"] = erros[:5]
                    print("ok", cam, med["cameras"][cam])
                finally:
                    ctx.close()
        finally:
            b.close()
    if not a.sem_medir:
        # 3) capacidade da GPU: sem o limite de 60 Hz, quanto cada câmera aguenta (quadros/s)
        with sync_playwright() as p:
            b = p.chromium.launch(headless=True, args=ARGS + ["--disable-frame-rate-limit", "--disable-gpu-vsync"])
            try:
                for cam in CAMERAS:
                    ctx, pg, _ = abrir(b, base, a.largura, a.altura)
                    try:
                        pg.goto(f"{base}/?cam={cam}{extra}", wait_until="load"); esperar(pg)
                        med["cameras"][cam]["fps_sem_vsync"] = fps(pg, 3000)["fps"]
                    finally:
                        ctx.close()
            finally:
                b.close()
        print({c: v.get("fps_sem_vsync") for c, v in med["cameras"].items()})
    # registra a rodada em design/comparacao/datas.json (lido pelo index.html), se a pasta de saída for dessa árvore
    datas = out.resolve().parent / "datas.json"
    if datas.exists():
        lista = json.loads(datas.read_text())
        if out.name not in lista:
            datas.write_text(json.dumps(sorted(lista + [out.name])) + "\n")
    (out / "medicao.json").write_text(json.dumps(med, indent=2, ensure_ascii=False))
    print(json.dumps({k: v for k, v in med.items() if k != "cameras"}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())
