"""Generate original reconstruction-demo assets; no external input or dependencies."""
from pathlib import Path
import math
root=Path(__file__).parent
paths={'search':'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14m5-2 6 6','collapse':'m14 5-7 7 7 7','expand':'M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5','upload':'M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4','inspire':'M9 15a5 5 0 1 1 6 0v3H9zm1 6h4M12 1v2M2 10h2m16 0h2M4 3l2 2m12 0 2-2','restyle':'M3 10a9 9 0 0 1 16-4l2 3M21 3v6h-6M21 14a9 9 0 0 1-16 4l-2-3m0 6v-6h6','shuffle':'M3 5h3l12 14h3m-4-4 4 4-4 4M3 19h3L18 5h3m-4-4 4 4-4 4','library':'M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h6v6h-6z','export':'M12 3v13m-5-5 5 5 5-5M4 20h16','compare':'M4 5h16v14H4zm8-3v20','crop':'M5 2v17h17M2 5h17v17','text':'M4 4h16M12 4v17m-4 0h8','undo':'M8 5 3 10l5 5M3 10h10a7 7 0 1 1 0 14','redo':'m16 5 5 5-5 5m5-5H11a7 7 0 1 0 0 14','layers':'m12 3 10 6-10 6L2 9zm-9 11 9 6 9-6','menu':'M4 6h16M4 12h16M4 18h16','star':'m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1z','play':'m7 3 14 9-14 9z','lights':'M12 5v-4m0 22v-4M5 12H1m22 0h-4M4 4l3 3m10 10 3 3M4 20l3-3M17 7l3-3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8','color':'M12 2s7 9 7 14a7 7 0 0 1-14 0c0-5 7-14 7-14z','mask':'M4 4h16v16H4zm0 16L20 4','plus':'M12 3v18M3 12h18','minus':'M3 12h18','close':'m5 5 14 14M5 19 19 5','help':'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4m0 3v1','account':'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 22v-3a8 8 0 0 1 16 0v3'}
for name,path in paths.items():
 (root/(name+'.svg')).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f5f5f5" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="{path}"/></svg>')
# Original botanical etching: a curved stem and individual ribbed leaves.
s=['<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><rect width="1000" height="1000" fill="#000"/>']
for branch,sign in [(0,1),(1,-1)]:
 cx=470+branch*70
 s.append(f'<path d="M{cx} 850 Q{cx-100*sign} 550 {cx+50*sign} 180" fill="none" stroke="#aaa" stroke-width="2"/>')
 for j in range(9):
  y=260+j*61; x=cx-35*sign*math.sin(j/4); side=sign*(-1 if j%2 else 1); length=95+55*math.sin(j/3)
  tipx=x+side*length; tipy=y-85
  s.append(f'<path d="M{x} {y} Q{x+side*length*.2} {y-95} {tipx} {tipy} Q{x+side*length*.75} {y+18} {x} {y}" fill="#b8b8b8" stroke="#ddd" stroke-width=".8"/>')
  for k in range(1,16):
   t=k/17; qx=x+(tipx-x)*t; qy=y+(tipy-y)*t
   s.append(f'<path d="M{x} {y} Q{qx} {qy-25*math.sin(t*math.pi)} {qx+side*15*math.sin(t*math.pi)} {qy-22*math.sin(t*math.pi)}" fill="none" stroke="#fff" stroke-width=".65" opacity=".85"/>')
s.append('</svg>');(root/'botanical.svg').write_text(''.join(s))
