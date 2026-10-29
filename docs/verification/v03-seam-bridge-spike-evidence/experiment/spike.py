"""Bounded synthetic Q(sqrt(2)) -> rational -> real existing TS spike."""
from fractions import Fraction as F
from math import isqrt
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parent
REPO = Path('C:/Users/sandr/OrthoSculptCAD')
DELTA, TAU, CURVE_BUDGET = F(1,1000), F(1,250), F(1,200)

class Unknown(Exception):
    """Budget/unresolved, never PASS."""

class Refused(Exception):
    """Proved violated bridge condition."""

class Field:
    """One of Q(sqrt(2)), Q(sqrt(3)); never mixed or dynamically enlarged.
    Preflight bounds raw products before Fraction arithmetic; caps are not RSS/time.
    """
    def __init__(self, max_bits=512, max_ops=200000, sign_bits=128, d=2):
        if not (type(max_bits) is int and 1<=max_bits<=512 and
                type(max_ops) is int and 1<=max_ops<=200000 and
                type(sign_bits) is int and 1<=sign_bits<=128 and type(d) is int and d in (2,3)):
            raise Unknown('experimental field cap')
        self.max_bits, self.remaining, self.sign_bits = max_bits, max_ops, sign_bits
        self.d = d
        self.operations = 0

    def charge(self):
        if self.remaining <= 0:
            raise Unknown('operation budget')
        self.remaining -= 1
        self.operations += 1

    def check(self, *widths):
        self.charge()
        if max(widths) > self.max_bits:
            raise Unknown('bit budget')

    def f(self, op, x, y):
        an, ad = x.numerator.bit_length(), x.denominator.bit_length()
        bn, bd = y.numerator.bit_length(), y.denominator.bit_length()
        if op == 'mul':
            self.check(an,ad,bn,bd,an+bn,ad+bd)
            return x*y
        self.check(an,ad,bn,bd,max(an+bd,bn+ad)+1,ad+bd)
        return x+y if op == 'add' else x-y

    def q(self, a=0, b=0):
        # Authored Fraction/int inputs only: not an untrusted public parser.
        if any(type(x) is int and x.bit_length()>self.max_bits for x in (a,b)):
            raise Unknown('bit budget')
        a,b = F(a),F(b)
        self.check(a.numerator.bit_length(),a.denominator.bit_length(),
                   b.numerator.bit_length(),b.denominator.bit_length())
        return Q(self,a,b)

    def enclosure(self, x, bits=128):
        self.check(2*bits+2)
        n = isqrt(self.d << (2*bits))
        lo,hi = F(n,1<<bits),F(n+1,1<<bits)
        if x.b < 0:
            lo,hi = hi,lo
        return (self.f('add',x.a,self.f('mul',x.b,lo)),
                self.f('add',x.a,self.f('mul',x.b,hi)))

    def sign(self, x):
        self.charge()
        if x.a == 0 and x.b == 0:
            return 0  # ONLY coefficient identity certifies zero.
        if x.b == 0:
            return 1 if x.a > 0 else -1
        bits = 8
        while bits <= self.sign_bits:
            lo,hi = self.enclosure(x,bits)
            if lo > 0:
                return 1
            if hi < 0:
                return -1
            bits *= 2
        raise Unknown('sign cancellation unresolved')

class Q:
    def __init__(self, ctx, a, b):
        self.ctx,self.a,self.b = ctx,a,b

    def coerce(self, x):
        if isinstance(x,Q):
            if x.ctx is not self.ctx:
                raise Refused('different field context')
            return x
        return self.ctx.q(x)

    def __add__(self, x):
        x = self.coerce(x)
        f = self.ctx.f
        return self.ctx.q(f('add',self.a,x.a),f('add',self.b,x.b))
    __radd__ = __add__

    def __neg__(self):
        self.ctx.charge()
        return self.ctx.q(-self.a,-self.b)

    def __sub__(self, x):
        return self+(-self.coerce(x))

    def __mul__(self, x):
        x = self.coerce(x)
        f = self.ctx.f
        a = f('add',f('mul',self.a,x.a),f('mul',F(self.ctx.d),f('mul',self.b,x.b)))
        b = f('add',f('mul',self.a,x.b),f('mul',self.b,x.a))
        return self.ctx.q(a,b)
    __rmul__ = __mul__

    def coeffs(self):
        return [str(self.a),str(self.b)]

    def is_zero(self):
        self.ctx.charge()
        return self.a == 0 and self.b == 0


def rat(x):
    return {'n':str(x.numerator),'d':str(x.denominator)}


def decode(x):
    return F(int(x['n']),int(x['d']))


def store(path,data):
    with path.open('x',encoding='utf8') as stream:
        json.dump(data,stream,indent=2)
        stream.write('\n')


def command(args,directory,log):
    result = subprocess.run([str(x) for x in args],cwd=directory,text=True,capture_output=True,
                            env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
    (directory/log).write_text('$ '+' '.join(map(str,args))+'\n'+result.stdout+result.stderr+
                               '\nexit='+str(result.returncode)+'\n',encoding='utf8')
    if result.returncode:
        raise RuntimeError('real command blocked: '+str(directory/log))
    return result.stdout


def compile_existing(directory):
    src = REPO/'src/trimline'
    command(['node',REPO/'node_modules/typescript/bin/tsc','--target','ES2020',
             '--module','commonjs','--strict','--skipLibCheck','--outDir',ROOT/'compiled',
             src/'numerics.ts',src/'bezier.ts',src/'face-cubic.ts'],directory,'compile.log')


def reference_pair(ctx,curved=False):
    P,Qs = [],[]
    for k in range(4):
        x,y = F(1,2)+F(k-3,12),F(3-k,12)
        P.append([ctx.q(1-x-y),ctx.q(x),ctx.q(y)])
        x = F(1,2)+F(k,12)
        z = ctx.q(0,F(k,24))
        Qs.append([ctx.q(x),ctx.q(1-x)-z,z])
    if curved:
        # Only controls NOT fixing seam derivatives change. All stay in simplex.
        h = ctx.q(F(1,32))
        for i in (0,1):
            P[i][0] = P[i][0]-h
            P[i][2] = P[i][2]+h
        for i in (2,3):
            Qs[i][1] = Qs[i][1]-h
            Qs[i][2] = Qs[i][2]+h
    return [P,Qs]


def world(ctx,face,weights):
    a,b,c = weights
    return [b,c,ctx.q()] if face == 0 else [a,-c,c]


def dyadic_floor(ctx,x,bits):
    if type(bits) is not int or not 1<=bits<=64:
        raise Unknown('dyadic grid cap: 1..64 bits')
    lo,hi = ctx.enclosure(x)
    scale = 1<<bits
    scaled = lo*scale
    n = scaled.numerator//scaled.denominator
    r = F(n,scale)
    if ctx.sign(x-ctx.q(r)) < 0 or ctx.sign(ctx.q(r+F(1,scale))-x) <= 0:
        raise Unknown('dyadic grid cell unresolved')
    return r


def make_bridge(ctx,pair,bits,delta):
    approx,records = [],[]
    for face,controls in enumerate(pair):
        rows,reports = [],[]
        for i,weights in enumerate(controls):
            a,b = (dyadic_floor(ctx,x,bits) for x in weights[:2])
            row = [a,b,1-a-b]
            if min(row)<0 or sum(row)!=1:
                raise Refused('rounded simplex')
            if any(ctx.sign(x)<0 for x in weights) or not (sum(weights)-1).is_zero():
                raise Refused('ideal simplex')
            ideal = world(ctx,face,weights)
            rational = world(ctx,face,[ctx.q(x) for x in row])
            error = sum((x-y)*(x-y) for x,y in zip(ideal,rational))
            if ctx.sign(ctx.q(delta*delta)-error)<0:
                exc = Refused('control error exceeds delta')
                exc.details = {'face':face,'control':i,'idealBarycentric':[x.coeffs() for x in weights],
                               'rationalBarycentric':[rat(x) for x in row],
                               'errorSquared':error.coeffs(),'deltaSquared':str(delta*delta),
                               'errorSquaredMinusDeltaSquaredSign':ctx.sign(error-ctx.q(delta*delta))}
                raise exc
            if (face,i) in ((0,3),(1,0)) and not error.is_zero():
                raise Refused('seam endpoint moved')
            lower,upper = ctx.enclosure(error)
            reports.append({'idealBarycentric':[x.coeffs() for x in weights],
                            'rationalBarycentric':[rat(x) for x in row],
                            'idealWorld':[x.coeffs() for x in ideal],
                            'rationalWorld':[str(x.a) for x in rational],
                            'idealHullLower':[str(ctx.enclosure(x)[0]) for x in weights],
                            'errorSquared':error.coeffs(),
                            'errorSquaredEnclosure':[str(lower),str(upper)],
                            'deltaSquaredMinusErrorSign':ctx.sign(ctx.q(delta*delta)-error)})
            rows.append(row)
        approx.append(rows)
        records.append(reports)
    return approx,records


def run_experiment(label='cli',curved=False,bits=16,delta=DELTA,tau=TAU):
    directory = ROOT/'runs'/(label+'-'+uuid.uuid4().hex[:12])
    directory.mkdir(parents=True)
    try:
        return _run_experiment(directory,curved,bits,delta,tau)
    except (Refused,Unknown) as exc:
        failure = {'status':'UNKNOWN' if isinstance(exc,Unknown) else 'REFUSED','reason':str(exc),
                   'delta':str(delta),'tau':str(tau),'sum':str(delta+tau),'bits':bits,
                   'budget':str(CURVE_BUDGET),'producerCalled':(directory/'producer.log').exists(),
                   'details':getattr(exc,'details',{})}
        store(directory/'refusal.json',failure)
        exc.evidence_path = str(directory/'refusal.json')
        raise


def _run_experiment(directory,curved,bits,delta,tau):
    if any(max(x.numerator.bit_length(),x.denominator.bit_length())>128 for x in (delta,tau)):
        raise Unknown('tolerance input cap')
    if type(bits) is not int or not 1<=bits<=64:
        raise Unknown('dyadic grid cap: 1..64 bits')
    if delta < 0 or tau <= 0 or delta+tau > CURVE_BUDGET:
        raise Refused('delta + tau exceeds existing curve budget')
    ctx = Field()
    pair = reference_pair(ctx,curved)
    approx,records = make_bridge(ctx,pair,bits,delta)
    wp = [world(ctx,0,row) for row in pair[0]]
    wq = [world(ctx,1,row) for row in pair[1]]
    v = [3*(a-b) for a,b in zip(wp[3],wp[2])]
    w = [3*(a-b) for a,b in zip(wq[1],wq[0])]
    unfolded_y = -ctx.q(0,1)*w[2]
    determinant = v[0]*unfolded_y-v[1]*w[0]
    ep = [a-b for a,b in zip(wp[0],wp[3])]
    eq = [a-b for a,b in zip(wq[3],wq[0])]
    nonstraight = [ep[0]*v[1]-ep[1]*v[0], eq[0]*w[2]-eq[2]*w[0]]
    if curved and any(x.is_zero() for x in nonstraight):
        raise Refused('expected genuinely curved spans')
    if not determinant.is_zero() or ctx.sign(v[0]*w[0]+v[1]*unfolded_y)<=0:
        raise Refused('ideal intrinsic G1')
    bad = ctx.q(1,-1)
    triangles = [[[0,0,0],[1065353216,0,0],[0,1065353216,0]],
                 [[1065353216,0,0],[0,0,0],[0,3212836864,1065353216]]]
    request = {'cases':[{'id':('straight-' if not curved else 'curved-')+name,
                         'triangleBits':tri,'barycentricControls':[[rat(x) for x in row] for row in rows],
                         'tolerance':rat(tau)}
                        for name,tri,rows in zip(('F','G'),triangles,approx)]}
    store(directory/'request.json',request)
    compile_existing(directory)
    out = command(['node',ROOT/'producer.cjs',directory/'request.json',directory/'real-face-proof.json'],
                  directory,'producer.log')
    summary = json.loads(command([sys.executable,'-B',REPO/'tests/reference/v03_face_cubic_verify.py',
                                  '--input',directory/'real-face-proof.json'],directory,'public-verifier.log'))
    proof = json.loads((directory/'real-face-proof.json').read_text(encoding='utf8'))
    actual_seam = proof['cases'][0]['containment']['controls'][3]==proof['cases'][1]['containment']['controls'][0]
    if not actual_seam:
        raise Refused('real TS seam mismatch')
    actual = [[[ctx.q(decode(x)) for x in row] for row in c['containment']['controls']]
              for c in proof['cases']]
    rv = [3*(a-b) for a,b in zip(actual[0][3],actual[0][2])]
    rw = [3*(a-b) for a,b in zip(actual[1][1],actual[1][0])]
    actual_det = rv[0]*(-ctx.q(0,1)*rw[2])-rv[1]*rw[0]
    sources = [REPO/'src/trimline'/x for x in ('numerics.ts','bezier.ts','face-cubic.ts')]
    sources += [REPO/'tests/reference'/x for x in ('v03_face_cubic_verify.py','v03_bezier_verify.py')]
    sources += [ROOT/'compiled'/x for x in ('numerics.js','bezier.js','face-cubic.js')]
    sources += [ROOT/x for x in ('spike.py','check_bridge.py','producer.cjs','secondary.py','test_spike.py')]
    result = {'format':'ScratchSeamReferenceBridge-v1-NOT-PRODUCTION','verdict':'VALIDATED_LOCAL',
              'curved':curved,'nonstraightDeterminants':[x.coeffs() for x in nonstraight],
              'actualRationalUnfoldedDeterminant':actual_det.coeffs(),
              'actualRationalUnfoldedDeterminantSign':ctx.sign(actual_det),
              'leavesPerSpan':[len(c['approximation']['leaves']) for c in proof['cases']],
              'referenceField':'Q(sqrt(2))','algebraicCaps':{'maxBits':ctx.max_bits,'maxOps':200000,'maxSignBits':ctx.sign_bits},
              'algebraicOperations':ctx.operations,'controls':records,'seam_exact':actual_seam,
              'ideal_unfolded_determinant':determinant.coeffs(),'bad_rational_determinant':bad.coeffs(),
              'bad_rational_determinant_sign':ctx.sign(bad),
              'budget':{'delta':str(delta),'tau':str(tau),'delta_plus_tau':str(delta+tau),
                        'existingCurveBudget':str(CURVE_BUDGET),'hitUnchanged':'1/200','fullCQuantizationUnchanged':'1/100'},
              'public_verifier':summary,'producer':json.loads(out),
              'real_proof_path':str(directory/'real-face-proof.json'),
              'realProofSha256':hashlib.sha256((directory/'real-face-proof.json').read_bytes()).hexdigest(),
              'source_sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},
              'samplerMaxUpperSquared':[str(decode(c['approximation']['maxUpperSquared'])) for c in proof['cases']],
              'scope':'Two synthetic supplied faces only; rational cubic/PL approximate ideal, NOT exact G1. No source binding, route, global regularity/simplicity/isotopy, C quantization, cut/shell/collar or app certification.'}
    store(directory/'bridge-reference.json',result)
    result['independent_bridge_verifier'] = json.loads(command(
        [sys.executable,'-B',ROOT/'check_bridge.py','--input',directory/'bridge-reference.json'],
        directory,'independent-bridge-verifier.log'))
    store(directory/'results.json',result)
    result['results_path'] = str(directory/'results.json')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--curved',action='store_true')
    parser.add_argument('--bits',type=int,default=16)
    parser.add_argument('--delta',type=F,default=DELTA)
    parser.add_argument('--tau',type=F,default=TAU)
    args = parser.parse_args()
    try:
        result = run_experiment(curved=args.curved,bits=args.bits,delta=args.delta,tau=args.tau)
    except (Refused,Unknown) as exc:
        print(json.dumps({'status':'UNKNOWN' if isinstance(exc,Unknown) else 'REFUSED',
                          'reason':str(exc),'evidence':exc.evidence_path}))
        return 2 if isinstance(exc,Unknown) else 1
    print(json.dumps({'verdict':result['verdict'],'results':result['results_path'],
                      'public_verifier':result['public_verifier']}))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
