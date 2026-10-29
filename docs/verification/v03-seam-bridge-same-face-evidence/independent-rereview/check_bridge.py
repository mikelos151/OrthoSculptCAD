"""Independent fixed-size mathematical check of scratch bridge evidence.
No import of spike/TS. Fraction coefficient identities + integer isqrt enclosure.
NOT a production/untrusted general proof parser: fixed 2 faces/8 controls only.
"""
from fractions import Fraction as F
from math import isqrt
from pathlib import Path
import argparse
import hashlib
import json
import sys

# Never create __pycache__ in the read-only repo when loading its public verifier.
sys.dont_write_bytecode = True
REPO = Path('C:/Users/sandr/OrthoSculptCAD')
sys.path.insert(0,str(REPO/'tests/reference'))
import v03_face_cubic_verify as public

class Unknown(Exception):
    pass


def require(value, reason):
    if not value:
        raise ValueError(reason)


def fraction(value):
    require(isinstance(value,str) and len(value)<=180, 'bounded fraction token')
    x = F(value)
    require(max(x.numerator.bit_length(),x.denominator.bit_length())<=512,'bounded fraction width')
    return x


def pair(value):
    require(type(value) is list and len(value)==2,'coefficient pair')
    return tuple(fraction(x) for x in value)


def plus(x,y):
    return x[0]+y[0],x[1]+y[1]


def minus(x,y):
    return x[0]-y[0],x[1]-y[1]


def times(x,y):
    return x[0]*y[0]+2*x[1]*y[1],x[0]*y[1]+x[1]*y[0]


def scale(x,s):
    return x[0]*s,x[1]*s


def interval(x,lo,hi):
    a,b = x
    return (a+b*lo,a+b*hi) if b>=0 else (a+b*hi,a+b*lo)


def verify(path):
    path = Path(path)
    require(path.stat().st_size<=1024*1024,'local evidence size cap')
    data = json.loads(path.read_text(encoding='utf8'))
    require(data['format']=='ScratchSeamReferenceBridge-v1-NOT-PRODUCTION','bridge domain')
    delta,tau = (fraction(data['budget'][key]) for key in ('delta','tau'))
    require(delta>=0 and tau>0 and delta+tau<=F(1,200),'existing curve budget')
    require(data['budget']['hitUnchanged']=='1/200' and data['budget']['fullCQuantizationUnchanged']=='1/100','other budgets unchanged')
    for p,digest in data['source_sha256'].items():
        require(hashlib.sha256(Path(p).read_bytes()).hexdigest()==digest,'source hash mismatch')
    proof = json.loads(Path(data['real_proof_path']).read_text(encoding='utf8'))
    require(len(proof['cases'])==2,'exactly two real spans')
    reference_triangles = (((0,0,0),(1,0,0),(0,1,0)),
                           ((1,0,0),(0,0,0),(0,-1,1)))
    for case, reference in zip(proof['cases'], reference_triangles):
        triangle = case['containment']['triangle']
        require(type(triangle) is list and len(triangle)==3
                and all(type(point) is list and len(point)==3 for point in triangle),
                'ordered reference triangle mismatch')
        actual_triangle = tuple(tuple(F(int(x['n']),int(x['d'])) for x in point)
                                for point in triangle)
        require(actual_triangle==reference,'ordered reference triangle mismatch')
    require(len(data['controls'])==2 and all(len(c)==4 for c in data['controls']),'eight controls')
    # Fixed 128-bit outward enclosure certified with integers, independently.
    unit = 1<<128
    n = isqrt(2*unit*unit)
    require(n*n < 2*unit*unit < (n+1)*(n+1),'sqrt enclosure witness')
    lo,hi = F(n,unit),F(n+1,unit)
    zero,half = (F(0),F(0)),(F(1,2),F(0))
    curved = data['curved']
    require(type(curved) is bool,'curved flag')
    originals,uppers,hull_lowers = [],[],[]
    for face,rows in enumerate(data['controls']):
        original = []
        for i,row in enumerate(rows):
            ideal = [pair(x) for x in row['idealWorld']]
            # Independent literal formula, not trusting producer's algebraic controls.
            h = F(1,32) if curved and ((face==0 and i<2) or (face==1 and i>1)) else F(0)
            if face==0:
                expected = [(F(1,2)+F(i-3,12),F(0)),(F(3-i,12)+h,F(0)),zero]
                bary = [(F(1,2)-h,F(0)),expected[0],expected[1]]
            else:
                expected = [(F(1,2)+F(i,12),F(0)),(-h,-F(i,24)),(h,F(i,24))]
                bary = [expected[0],(F(1,2)-F(i,12)-h,-F(i,24)),expected[2]]
            require(ideal==expected,'ideal formula changed')
            require([pair(x) for x in row['idealBarycentric']]==bary,'ideal barycentric identity')
            require(tuple(map(sum,zip(*bary)))==(F(1),F(0)),'ideal unit sum')
            lower = [interval(x,lo,hi)[0] for x in bary]
            require(min(lower)>=0,'whole-control ideal hull')
            require([fraction(x) for x in row['idealHullLower']]==lower,'reported hull lower')
            hull_lowers.extend(lower)
            real = proof['cases'][face]['containment']
            weights = [F(int(x['n']),int(x['d'])) for x in real['barycentricControls'][i]]
            require(real['barycentricControls'][i]==row['rationalBarycentric'],'rational input bound to real producer')
            require(min(weights)>=0 and sum(weights)==1,'rational simplex')
            require(all((x.denominator&(x.denominator-1))==0 for x in weights),'explicit dyadic weights')
            rational = [F(int(x['n']),int(x['d'])) for x in real['controls'][i]]
            require(rational==[fraction(x) for x in row['rationalWorld']],'rational world binds actual result')
            errors = [minus(x,(y,F(0))) for x,y in zip(ideal,rational)]
            # Independent coefficient expansion of sum of squared differences.
            squared = (sum(a*a+2*b*b for a,b in errors),sum(2*a*b for a,b in errors))
            require(pair(row['errorSquared'])==squared,'exact control error identity')
            lower_e,upper_e = interval(squared,lo,hi)
            require([fraction(x) for x in row['errorSquaredEnclosure']]==[lower_e,upper_e],'outward error enclosure')
            if upper_e>delta*delta:
                raise Unknown('outward control error exceeds/unresolved at delta')
            uppers.append(max(F(0),upper_e))
            if (face,i) in ((0,3),(1,0)):
                require(ideal==[half,zero,zero] and rational==[F(1,2),F(0),F(0)],'exact E identity')
            original.append(ideal)
        originals.append(original)
    p,q = originals
    v = [scale(minus(a,b),F(3)) for a,b in zip(p[3],p[2])]
    w = [scale(minus(a,b),F(3)) for a,b in zip(q[1],q[0])]
    require(v==[(F(1,4),F(0)),(-F(1,4),F(0)),zero],'v/4 coefficient identity')
    require(w==[(F(1,4),F(0)),(F(0),-F(1,8)),(F(0),F(1,8))],'w/4 coefficient identity')
    uw = [w[0],scale(times((F(0),F(1)),w[2]),F(-1)),zero]
    require(uw==v,'unfolded C1 coefficient identity (stronger than G1)')
    determinant = minus(times(v[0],uw[1]),times(v[1],uw[0]))
    require(determinant==zero and pair(data['ideal_unfolded_determinant'])==zero,'ideal exact zero identity')
    require(pair(data['bad_rational_determinant'])==(F(1),-F(1)),'bad rational tangent determinant identity')
    require(interval((F(1),-F(1)),lo,hi)[1]<0,'bad tangent provably NONZERO')
    actual = [[[F(int(x['n']),int(x['d'])) for x in row] for row in c['containment']['controls']]
              for c in proof['cases']]
    rv = [3*(a-b) for a,b in zip(actual[0][3],actual[0][2])]
    rw = [3*(a-b) for a,b in zip(actual[1][1],actual[1][0])]
    actual_det = (-rv[1]*rw[0],-rv[0]*rw[2])
    require(pair(data['actualRationalUnfoldedDeterminant'])==actual_det,'actual rational determinant identity')
    detlo,dethi = interval(actual_det,lo,hi)
    if actual_det==(F(0),F(0)):
        actual_sign = 0
    elif detlo>0:
        actual_sign = 1
    elif dethi<0:
        actual_sign = -1
    else:
        raise Unknown('actual determinant sign unresolved')
    require(actual_sign==data['actualRationalUnfoldedDeterminantSign'],'actual determinant sign')
    require(actual_sign!=0,'actual determinant unexpectedly exact G1 in this witness')
    # A nonzero cross with the seam tangent proves neither ideal span is a line.
    nonstraight = []
    for face,pts,tangent in ((0,p,v),(1,q,w)):
        endpoint = pts[0] if face==0 else pts[3]
        e = [minus(x,y) for x,y in zip(endpoint,[half,zero,zero])]
        axis = 1 if face==0 else 2
        d = minus(times(e[0],tangent[axis]),times(e[axis],tangent[0]))
        require(pair(data['nonstraightDeterminants'][face])==d,'nonstraight identity')
        require((d!=zero)==curved,'genuinely curved or straight as declared')
        nonstraight.append([str(x) for x in d])
    for case in proof['cases']:
        require(F(int(case['tolerance']['n']),int(case['tolerance']['d']))==tau,'same tau in real proof')
    summary = public.verify_bundle(proof)  # ONCE on unrenamed complete real bundle.
    return {'passed':True,'controlsChecked':8,'idealDerivativeIdentity':True,
            'idealG1':'exact coefficient identity','actualRationalAndPL':'approximations, NOT exact G1',
            'maxControlErrorSquaredUpper':str(max(uppers)),'minIdealBarycentricLower':str(min(hull_lowers)),
            'nonstraightDeterminants':nonstraight,'publicVerifier':summary,
            'deltaPlusTau':str(delta+tau),'existingBudget':str(F(1,200)),
            'independentCheckCap':'2 faces, 8 controls, 512-bit input coefficients; fixed-degree coefficient expansion and 128-bit sqrt enclosure; no mixed fields'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',required=True)
    args = parser.parse_args()
    try:
        result = verify(args.input)
    except (Unknown,public.BudgetExceeded) as exc:
        print(json.dumps({'passed':False,'status':'UNKNOWN','reason':str(exc)}))
        return 2
    except (ValueError,KeyError,TypeError,OSError) as exc:
        print(json.dumps({'passed':False,'status':'REFUSED','reason':str(exc)}))
        return 1
    print(json.dumps(result))
    return 0

if __name__=='__main__':
    raise SystemExit(main())
