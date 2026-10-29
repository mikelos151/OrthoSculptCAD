"""Independent design witness only: no production imports or implementation tests."""
from fractions import Fraction as F
from math import comb, isqrt
from pathlib import Path
import json

checks = []
def check(name, condition):
    assert condition, name
    checks.append(name)

# Arithmetic in Q(sqrt(2)), independent of another worker's spike.
def q(a=0, b=0): return (F(a), F(b))
def add(x,y): return (x[0]+y[0], x[1]+y[1])
def neg(x): return (-x[0],-x[1])
def sub(x,y): return add(x,neg(y))
def mul(x,y): return (x[0]*y[0]+2*x[1]*y[1], x[0]*y[1]+x[1]*y[0])
def scale(x,s): return mul(x,q(s))
def positive(x):
    a,b=x
    if b == 0: return a>0
    if a == 0: return b>0
    if a>0 and b>0: return True
    if a<0 and b<0: return False
    return a*a>2*b*b if a>0 else 2*b*b>a*a

def vs(x,y): return tuple(sub(a,b) for a,b in zip(x,y))
def vm(x,s): return tuple(scale(a,s) for a in x)
def det2(x,y): return sub(mul(x[0],y[1]),mul(x[1],y[0]))
def unfold(x): return (x[0],neg(mul(q(0,1),x[2])),q())

v=(q(1),q(-1),q())
w=(q(1),q(0,F(-1,2)),q(0,F(1,2)))
check('unfolding exact algebraic tangent equals v', unfold(w)==v)
check('rational chart matched directions are not intrinsic G1', det2(v,unfold((q(1),q(-1),q(1))))==q(1,-1))
check('conormal squared lengths are 1 and 2', sum(t*t for t in (0,1,0))==1 and sum(t*t for t in (0,-1,1))==2)
check('2 is not an integer square; parity proves not a rational square', isqrt(2)**2!=2)
check('perpendicular exception is positive collinearity', det2((q(),q(-1)),(q(),q(0,-1)))==q() and positive(q(0,1)))

# Verify every original plan witness control and its positive hull margin.
E=(q(F(1,2)),q(),q())
original_F=[]; original_G=[]
for k in range(4):
    P=tuple(add(e,t) for e,t in zip(E,vm(v,F(k-3,12))))
    Q=tuple(add(e,t) for e,t in zip(E,vm(w,F(k,12))))
    # F=(A,B,C); G=(B,A,D). In G, B-weight=x and D-weight=z.
    wf=(sub(sub(q(1),P[0]),P[1]),P[0],P[1])
    wg=(Q[0],sub(sub(q(1),Q[0]),Q[2]),Q[2])
    check(f'original F hull k={k}', all(x==q() or positive(x) for x in wf) and add(add(wf[0],wf[1]),wf[2])==q(1))
    check(f'original G hull k={k}', all(x==q() or positive(x) for x in wg) and add(add(wg[0],wg[1]),wg[2])==q(1))
    check(f'original G second weight >=1/16 k={k}', not positive(sub(q(F(1,16)),wg[1])))
    original_F.append(P); original_G.append(Q)
check('original seam derivatives agree unfolded in C1', vm(vs(original_F[3],original_F[2]),3)==unfold(vm(vs(original_G[1],original_G[0]),3)))
check('original outer G endpoint is algebraic, not rational', original_G[-1][2][1]!=0)

# Independent curved reference with rational endpoints and one algebraic handle.
P=original_F
Q=[E,original_G[1],(q(F(2,3)),q(F(-1,12)),q(F(1,12))),(q(F(3,4)),q(F(-1,8)),q(F(1,8)))]
r=F(707,12000)
R=[Q[0],(q(F(7,12)),q(-r),q(r)),Q[2],Q[3]]
for name,control in [('ideal',Q),('rational',R)]:
    for k,Z in enumerate(control):
        weights=(Z[0],sub(sub(q(1),Z[0]),Z[2]),Z[2])
        check(f'{name} new G hull k={k}', all(z==q() or positive(z) for z in weights))
    check(name+' endpoints rational', all(z[1]==0 for k in (0,3) for z in control[k]))
    check(name+' dx/dt identically 1/4 (regular and local injective)', all(scale(sub(control[k+1][0],control[k][0]),3)==q(F(1,4)) for k in range(3)))
check('bridge endpoints exactly preserved', R[0]==Q[0] and R[3]==Q[3])
check('curved ideal seam is exact intrinsic C1', vm(vs(P[3],P[2]),3)==unfold(vm(vs(Q[1],Q[0]),3)))
bridge_det=det2(vm(vs(P[3],P[2]),3),unfold(vm(vs(R[1],R[0]),3)))
check('rational bridge is NOT exact intrinsic G1', bridge_det!=q() and bridge_det==q(F(1,16),F(-707,16000)))
lo,hi=F(707,500),F(14143,10000)
check('rational sqrt2 enclosure',lo*lo<2<hi*hi)
# Q1-R1=(0,-h,h), h=(sqrt2-707/500)/24; norm=sqrt2*h.
control_error_upper=F(3,2)*(hi-lo)/24
check('control norm upper bound proven without float', control_error_upper==F(3,160000))
delta,tau=F(1,50000),F(249,50000)
check('delta dominates control norm error',control_error_upper<delta)
check('delta plus rational sampling tau exactly uses existing 0.005 budget',delta+tau==F(1,200) and 0<tau<=F(1,200))
# Bernstein convexity gives sup||ideal-rational||<=max control error.
# The existing sampleCubic contract gives sup||rational-PL||<=tau;
# triangle inequality gives ideal-PL<=delta+tau at the same parameter.

# Derive signed-height polynomial directly from Bernstein controls.
controls=[F(1),F(1),F(0),F(-2)]
coeff=[F(0)]*4
for i,c in enumerate(controls):
    for j in range(4-i): coeff[i+j]+=c*comb(3,i)*comb(3-i,j)*(-1)**j
check('edge-height Bernstein controls yield 1-3t^2',coeff==[1,0,-3,0])
root_lo,root_hi=F(1,2),F(3,5)
check('positive root isolated in [1/2,3/5]; derivative negative there',1-3*root_lo**2>0 and 1-3*root_hi**2<0 and -6*root_lo<0)
check('no fourth budget; unchanged hit and quantization sum',F(1,200)+(delta+tau)+F(1,100)==F(1,50))

result={
    'kind':'independent-design-math-review-not-production-test',
    'checks_passed':len(checks), 'checks':checks,
    'bridge':{
        'rational_handle_z':str(r), 'delta_mm':str(delta), 'tau_mm':str(tau),
        'delta_plus_tau_mm':str(delta+tau), 'strict_control_error_upper_mm':str(control_error_upper),
        'rational_bridge_intrinsic_determinant_Qsqrt2':[str(x) for x in bridge_det],
        'claims':'Local existence witness and compositional bound only. No global builder, topology, isotopy or production approval.'
    },
    'source_store':'Reviewed as a plan against repository API, not exercised because implementation does not exist.'
}
text=json.dumps(result,indent=2)
Path(__file__).with_name('independent-math-review.json').write_text(text+'\n',encoding='utf-8')
print(text)
