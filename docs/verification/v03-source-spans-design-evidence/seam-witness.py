"""Design mathematics only: not runtime code or a geometry acceptance test."""
from fractions import Fraction as F
from math import isqrt
from pathlib import Path


def dot(a, b):
    return sum((x*y for x, y in zip(a, b)), F(0))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


edge = (F(1), F(0), F(0))
into_f = (F(0), F(1), F(0))
into_g = (F(0), F(-1), F(1))
v = (F(1), F(-1), F(0))
w = (F(1), F(-1), F(1))
ratio = dot(into_g, into_g) / dot(into_f, into_f)
is_rational_square = (isqrt(ratio.numerator)**2 == ratio.numerator and
                      isqrt(ratio.denominator)**2 == ratio.denominator)
assert ratio == 2 and not is_rational_square
assert dot(edge, into_f) == dot(edge, into_g) == 0
assert cross(v, w) != (0, 0, 0)
# In unfolded coordinates, incoming=(a,-b), outgoing=(c,-sqrt(2)*d).
# Its determinant has coefficients (b*c, -a*d) in the independent basis 1,sqrt(2).
a = b = c = d = F(1)
determinant_coefficients = (b*c, -a*d)
assert determinant_coefficients == (1, -1)
chart_determinant = b*c-a*d
assert chart_determinant == 0
# Rational cubic edge-height with controls 1, 1, -1, -1:
# h(t)=1-6t^2+4t^3=(2t-1)*(2t^2-2t-1).
# Its root 1/2 is rational; use instead h(t)=1-3t^2 (controls 1,1,0,-2),
# with irrational positive root 1/sqrt(3) in (0,1).
height_controls = (F(1), F(1), F(0), F(-2))
assert height_controls[0] == 1
assert 3*(height_controls[1]-height_controls[0]) == 0
assert 3*(height_controls[2]-2*height_controls[1]+height_controls[0]) == -3
assert height_controls[3]-3*height_controls[2]+3*height_controls[1]-height_controls[0] == 0
# A full algebraic seam candidate exists outside the rational-only model.
# F controls P_k=E+(k-3)*v/12; G controls Q_k=E+k*w_alg/12,
# w_alg=(1,-sqrt(2)/2,sqrt(2)/2). Both seam derivatives unfold to v/4.
# For G, A-weight=(1/2-k/12)-(k/24)*sqrt(2).
# sqrt(2)<3/2 is certified by 2<9/4, giving a positive bound for k=0..3.
assert F(2) < F(9, 4)
g_a_lower_bounds = tuple(F(1, 2)-F(k, 12)-F(k, 24)*F(3, 2) for k in range(4))
assert min(g_a_lower_bounds) == F(1, 16) > 0
f_controls = tuple((F(1, 2)+F(k-3, 12), -F(k-3, 12), F(0)) for k in range(4))
assert all(x >= 0 and y >= 0 and x+y <= 1 for x, y, z in f_controls)
lines = [
    'DESIGN MATH ONLY; no runtime implementation tests',
    f'edge length squared: {dot(edge, edge)}',
    f'conormal length squares: {dot(into_f, into_f)}, {dot(into_g, into_g)}',
    f'conormal metric ratio: {ratio}; rational square: {is_rational_square}',
    f'world cross(v,w): {cross(v,w)}',
    f'rational affine chart determinant: {chart_determinant}',
    f'intrinsic unfolded determinant coefficients [1,sqrt(2)]: {determinant_coefficients}',
    'intrinsic G1 necessary condition: b*c = sqrt(2)*a*d',
    'nonzero rational a,b,c,d cannot satisfy it; perpendicular crossing a=c=0 is an exception for G1',
    'intrinsic C1 requires b=sqrt(2)*d and fails for any rational nonzero transversal derivative',
    f'algebraic candidate G A-weight conservative lower bounds using sqrt(2)<3/2: {g_a_lower_bounds}',
    'algebraic straight-span candidate has matching intrinsic seam derivatives v/4; not accepted by current rational-only runtime',
    f'edge-height Bernstein controls: {height_controls}; polynomial: 1-3*t^2; positive event: 1/sqrt(3)',
    f'normative independent budget sum: {F(1,200)+F(1,200)+F(1,100)} mm',
]
text = '\n'.join(lines) + '\n'
print(text, end='')
Path(__file__).with_suffix('.log').write_text(text, encoding='utf-8')
