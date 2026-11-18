"""Malha adaptativa de relevo por RTIN (triângulos retângulos bissecionados, algoritmo do Martini).

Dada uma grade de altitudes (2^k + 1)², devolve vértices e triângulos de uma malha sem rachaduras em
que o erro vertical máximo contra a grade é ≤ `erro`. Onde o chão é plano os triângulos ficam grandes.
"""
import numpy as np
from numba import njit


@njit(cache=True)
def _erros(h, n):
    t = n - 1
    n_tri = t * t * 2 - 2
    n_pai = n_tri - t * t
    # coords dos triângulos: ax, ay, bx, by
    co = np.zeros((n_tri, 4), np.int32)
    for i in range(n_tri):
        idv = i + 2
        ax = ay = bx = by = cx = cy = 0
        if idv & 1:
            bx = by = cx = t
        else:
            ax = ay = cy = t
        idv >>= 1
        while idv > 1:
            mx = (ax + bx) >> 1
            my = (ay + by) >> 1
            if idv & 1:
                bx = ax; by = ay; ax = cx; ay = cy
            else:
                ax = bx; ay = by; bx = cx; by = cy
            cx = mx; cy = my
            idv >>= 1
        co[i, 0] = ax; co[i, 1] = ay; co[i, 2] = bx; co[i, 3] = by
    err = np.zeros((n, n), np.float32)
    for i in range(n_tri - 1, -1, -1):
        ax, ay, bx, by = co[i, 0], co[i, 1], co[i, 2], co[i, 3]
        mx = (ax + bx) >> 1
        my = (ay + by) >> 1
        cx = mx + my - ay
        cy = my + ax - mx
        interp = (h[ay, ax] + h[by, bx]) * 0.5
        e = abs(interp - h[my, mx])
        if e > err[my, mx]:
            err[my, mx] = e
        if i < n_pai:
            l = err[(ay + cy) >> 1, (ax + cx) >> 1]
            r = err[(by + cy) >> 1, (bx + cx) >> 1]
            if l > err[my, mx]:
                err[my, mx] = l
            if r > err[my, mx]:
                err[my, mx] = r
    return err


@njit(cache=True)
def _malha(err, n, maxerr, peso):
    t = n - 1
    idx = np.zeros((n, n), np.int32)
    tris = np.empty((t * t * 2, 3), np.int32)
    nt = 0
    nv = 0
    pilha = np.empty((200, 6), np.int32)
    for raiz in range(2):
        sp = 0
        if raiz == 0:
            pilha[0, 0] = 0; pilha[0, 1] = 0; pilha[0, 2] = t; pilha[0, 3] = t; pilha[0, 4] = t; pilha[0, 5] = 0
        else:
            pilha[0, 0] = t; pilha[0, 1] = t; pilha[0, 2] = 0; pilha[0, 3] = 0; pilha[0, 4] = 0; pilha[0, 5] = t
        sp = 1
        while sp > 0:
            sp -= 1
            ax, ay, bx, by, cx, cy = pilha[sp, 0], pilha[sp, 1], pilha[sp, 2], pilha[sp, 3], pilha[sp, 4], pilha[sp, 5]
            mx = (ax + bx) >> 1
            my = (ay + by) >> 1
            lim = maxerr * peso[my, mx]
            if abs(ax - cx) + abs(ay - cy) > 1 and err[my, mx] > lim:
                # empilha o filho da direita primeiro, para sair o da esquerda antes
                pilha[sp, 0] = bx; pilha[sp, 1] = by; pilha[sp, 2] = cx; pilha[sp, 3] = cy; pilha[sp, 4] = mx; pilha[sp, 5] = my
                sp += 1
                pilha[sp, 0] = cx; pilha[sp, 1] = cy; pilha[sp, 2] = ax; pilha[sp, 3] = ay; pilha[sp, 4] = mx; pilha[sp, 5] = my
                sp += 1
            else:
                a = idx[ay, ax]
                if a == 0:
                    nv += 1; a = nv; idx[ay, ax] = a
                b = idx[by, bx]
                if b == 0:
                    nv += 1; b = nv; idx[by, bx] = b
                c = idx[cy, cx]
                if c == 0:
                    nv += 1; c = nv; idx[cy, cx] = c
                tris[nt, 0] = a - 1; tris[nt, 1] = b - 1; tris[nt, 2] = c - 1
                nt += 1
    return idx, tris[:nt], nv


def malha(h, erro, peso=None):
    """h: (n, n) float32, n = 2^k + 1. peso: (n, n) multiplicador do erro permitido (<1 = mais fino).
    Devolve (verts (nv, 2) int [coluna, linha], tris (nt, 3) int32)."""
    n = h.shape[0]
    err = _erros(h.astype(np.float32), n)
    if peso is None:
        peso = np.ones((n, n), np.float32)
    idx, tris, nv = _malha(err, n, np.float32(erro), peso.astype(np.float32))
    ys, xs = np.nonzero(idx)
    ordem = idx[ys, xs] - 1
    verts = np.empty((nv, 2), np.int32)
    verts[ordem, 0] = xs
    verts[ordem, 1] = ys
    return verts, tris
