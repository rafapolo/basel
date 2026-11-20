# Baselstab (docs/baselstab.js): báculo com voluta, colar de três anéis e pé de três pontas, viewBox ~0 0 110 160
import math, json
from PIL import Image, ImageDraw
# Baselstab, viewBox 0 0 100 160 (y para baixo): báculo com voluta à direita, colar de três anéis, pé com três pontas
def lin(a,b,n): return [a+(b-a)*i/(n-1) for i in range(n)]
# linha central: haste reta e depois espiral para a direita, para dentro
C=[]; W=[]
for y in lin(50,34,6): C.append((50,y)); W.append(18.6)
cx,cy=73,34; r0=23
N=120; T0=math.pi; T1=math.pi+2*math.pi*1.15
for i in range(1,N):
    t=i/(N-1); th=T0+(T1-T0)*t
    r=r0*(1-0.8*t)
    C.append((cx+r*math.cos(th), cy+r*math.sin(th))); W.append(18*(1-0.75*t**0.7)+0.6)
L=[];Rr=[]
for i,(x,y) in enumerate(C):
    a=C[max(0,i-1)]; b=C[min(len(C)-1,i+1)]
    dx,dy=b[0]-a[0],b[1]-a[1]; l=math.hypot(dx,dy) or 1; nx,ny=-dy/l,dx/l
    L.append((x+nx*W[i]/2,y+ny*W[i]/2)); Rr.append((x-nx*W[i]/2,y-ny*W[i]/2))
# ponta arredondada da espiral
ex,ey=C[-1]; 
dx,dy=C[-1][0]-C[-2][0],C[-1][1]-C[-2][1]; l=math.hypot(dx,dy); dx,dy=dx/l,dy/l; rw=W[-1]/2
ponta=[(ex+rw*(math.cos(a)*-dy+math.sin(a)*dx)*1, ey+rw*(math.cos(a)*dx+math.sin(a)*dy)) for a in [i*math.pi/8 for i in range(1,8)]]
cabeca=L+ponta+Rr[::-1]
def qb(p0,p1,p2,n=14): return [((1-t)**2*p0[0]+2*(1-t)*t*p1[0]+t*t*p2[0], (1-t)**2*p0[1]+2*(1-t)*t*p1[1]+t*t*p2[1]) for t in [i/(n-1) for i in range(n)]]
esq=qb((40.5,68),(38.5,118),(21,153)); dirr=qb((79,153),(61.5,118),(59.5,68))
pe=esq+[(38,133),(50,160),(62,133)]+dirr
def rr(x0,y0,x1,y1,k=8):
    pts=[]; rx=(y1-y0)/2
    for i in range(k+1):
        a=math.pi/2+math.pi*i/k; pts.append((x0+rx+rx*math.cos(a)-rx, (y0+y1)/2+rx*math.sin(a)) )
    pts=[(x0+ (y1-y0)/2*(1+math.cos(math.pi/2+math.pi*i/k))*0.9, (y0+y1)/2-(y1-y0)/2*math.sin(math.pi/2+math.pi*i/k)) for i in range(k+1)]
    dir_=[(x1-(y1-y0)/2*(1-math.cos(math.pi/2-math.pi*i/k))*0.9, (y0+y1)/2-(y1-y0)/2*math.sin(math.pi/2-math.pi*i/k)) for i in range(k+1)]
    return pts+dir_[::-1][::-1] if False else pts+[p for p in reversed(dir_)][::-1]
# anéis: pequeno, grande, pequeno (como na bandeira)
aneis=[(36,48,64,54),(29,55,71,63),(36,63,64,69)]
def anel(x0,y0,x1,y1,k=10):
    h=(y1-y0)/2; cyy=(y0+y1)/2; pts=[]
    for i in range(k+1):
        a=math.pi/2+math.pi*i/k; pts.append((x0+h+h*math.cos(a), cyy-h*math.sin(a)))
    for i in range(k+1):
        a=-math.pi/2+math.pi*i/k; pts.append((x1-h+h*math.cos(a), cyy-h*math.sin(a)))
    return pts
formas=[cabeca,pe]+[anel(*a) for a in aneis]
d=' '.join('M'+' L'.join(f'{x:.1f} {y:.1f}' for x,y in f)+' Z' for f in formas)
print(d)  # vai para STAB.d em docs/baselstab.js



