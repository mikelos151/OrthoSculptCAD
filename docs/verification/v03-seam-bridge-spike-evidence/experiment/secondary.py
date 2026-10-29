"""Optional SECOND LOCAL Q(sqrt(3)) one-span bound, not a long-curve G1 proof."""
from fractions import Fraction as F
from math import isqrt
import json
import sys
import uuid
import spike as s


def run():
    ctx = s.Field(d=3)
    directory = s.ROOT/'runs'/('secondary-local-'+uuid.uuid4().hex[:12])
    directory.mkdir(parents=True)
    controls,records,uppers = [],[],[]
    for k in range(4):
        # Triangle T=(B,A,D), B=(1,1,0), A=0, D=(1,-1,1).
        # u=(1,1,0), n=(1,-1,1) are perpendicular, ||n||^2=3.
        # Q_k=E+k*(u+n/sqrt(3))/12; bend only k=2,3 by n/32.
        h = F(1,32) if k>1 else F(0)
        a,c = ctx.q(F(1,2)+F(k,12)),ctx.q(h,F(k,36))
        weights = [a,ctx.q(1)-a-c,c]
        if any(ctx.sign(x)<0 for x in weights) or not (sum(weights)-1).is_zero():
            raise s.Refused('secondary ideal simplex')
        ra,rb = (s.dyadic_floor(ctx,x,16) for x in weights[:2])
        row = [ra,rb,1-ra-rb]
        if min(row)<0 or sum(row)!=1:
            raise s.Refused('secondary rational simplex')
        original = [a+c,a-c,c]
        actual = [ctx.q(row[0]+row[2]),ctx.q(row[0]-row[2]),ctx.q(row[2])]
        err = sum((x-y)*(x-y) for x,y in zip(original,actual))
        if ctx.sign(ctx.q(s.DELTA*s.DELTA)-err)<0:
            raise s.Refused('secondary control error')
        if k==0 and not err.is_zero():
            raise s.Refused('secondary E moved')
        # Independent coefficient expansion and sqrt3 enclosure (no field ops).
        diffs = [(x.a-y.a,x.b) for x,y in zip(original,actual)]
        independent = (sum(a*a+3*b*b for a,b in diffs),sum(2*a*b for a,b in diffs))
        assert independent==(err.a,err.b)
        unit = 1<<128
        n = isqrt(3*unit*unit)
        assert n*n<3*unit*unit<(n+1)*(n+1)
        lower,upper = F(n,unit),F(n+1,unit)
        eupper = independent[0]+independent[1]*(upper if independent[1]>=0 else lower)
        assert eupper<=s.DELTA*s.DELTA
        uppers.append(eupper)
        records.append({'idealBarycentric':[x.coeffs() for x in weights],
                        'rationalBarycentric':[s.rat(x) for x in row],
                        'idealWorld':[x.coeffs() for x in original],
                        'errorSquared':err.coeffs(),'independentErrorSquaredUpper':str(eupper)})
        controls.append(row)
    triangle = [[1065353216,1065353216,0],[0,0,0],[1065353216,3212836864,1065353216]]
    request = {'cases':[{'id':'sqrt3-local-curved','triangleBits':triangle,
                         'barycentricControls':[[s.rat(x) for x in row] for row in controls],
                         'tolerance':s.rat(s.TAU)}]}
    s.store(directory/'request.json',request)
    s.compile_existing(directory)
    s.command(['node',s.ROOT/'producer.cjs',directory/'request.json',directory/'real-face-proof.json'],directory,'producer.log')
    public = json.loads(s.command([sys.executable,'-B',s.REPO/'tests/reference/v03_face_cubic_verify.py',
                                   '--input',directory/'real-face-proof.json'],directory,'public-verifier.log'))
    result = {'field':'Q(sqrt(3))','scope':'ONE independent local cubic/control bound, not another two-span G1 chain',
              'controlsChecked':4,'controls':records,'independentCoefficientErrorCheck':True,
              'maxControlErrorSquaredUpper':str(max(uppers)),'publicVerifier':public,
              'deltaPlusTau':str(s.DELTA+s.TAU),'seamEndpointExact':True,
              'realProof':str(directory/'real-face-proof.json'),
              'noMixedField':'Local independent per-control bounds do not compose radical expressions. Exact cross-seam construction, shared controls, route/regularity predicates may still require growing composita; NOT proven bounded.'}
    s.store(directory/'results.json',result)
    result['results_path'] = str(directory/'results.json')
    return result

if __name__=='__main__':
    print(json.dumps(run()))
