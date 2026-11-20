"""Tiles da ortofoto em KTX2 (Basis ETC1S com mipmaps), ao lado dos .webp, para docs/ortofoto.js.

Na GPU o ETC1S vira BC1/ETC2/ASTC (4 bits por pixel): a foto aérea inteira de 5120 px ocupa ~18 MB de memória de
vídeo em vez de ~140 MB em RGBA com mipmaps. Precisa do `basisu` (brew install basis_universal).

    uv run --with pillow python script/ortofoto_ktx2.py
"""
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

PASTA = Path(__file__).resolve().parent.parent / "docs/data/ortofoto"


def um(webp: Path) -> str:
    saida = webp.with_suffix(".ktx2")
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "t.png"
        Image.open(webp).convert("RGB").save(png)
        subprocess.run(["basisu", "-ktx2", "-mipmap", "-q", "200", "-comp_level", "2", "-output_file", str(saida), str(png)],
                       check=True, capture_output=True)
    return f"{webp.name}: {webp.stat().st_size / 1024:.0f} KB → {saida.stat().st_size / 1024:.0f} KB"


if __name__ == "__main__":
    tiles = sorted(PASTA.glob("t_*.webp"))
    with ThreadPoolExecutor(4) as ex:
        for linha in ex.map(um, tiles):
            print(linha)
