use std::collections::{BTreeMap, HashMap};
use std::time::Instant;
use crate::{Mesh, SliceLoop, SliceResult, MAX_ABS_COORDINATE};
pub const MAX_SECTION_SEGMENTS: usize = 250_000;

type Point = [f64; 2];
fn distance(a: Point,b: Point)->f64 { (a[0]-b[0]).hypot(a[1]-b[1]) }

#[derive(Default)]
struct Incidence {
    coplanar: u32,
    on_plane_edge: u32,
    crossing: u32,
}

enum SegmentKind { Coplanar, OnPlaneEdge, Crossing }

struct Graph {
    points: Vec<Point>,
    buckets: HashMap<(i64,i64),Vec<usize>>,
    edges: BTreeMap<(usize,usize),Incidence>,
    eps: f64,
}
impl Graph {
    fn vertex(&mut self,p:Point)->usize {
        let key=((p[0]/self.eps).floor() as i64,(p[1]/self.eps).floor() as i64);
        for dx in -1..=1 { for dy in -1..=1 {
            if let Some(ids)=self.buckets.get(&(key.0+dx,key.1+dy)) {
                for &id in ids { if distance(self.points[id],p)<=self.eps { return id; } }
            }
        } }
        let id=self.points.len(); self.points.push(p); self.buckets.entry(key).or_default().push(id); id
    }
    fn segment(&mut self,a:Point,b:Point,kind:SegmentKind)->Result<(),String> {
        if distance(a,b)<=self.eps { return Ok(()); }
        if self.edges.len()>=MAX_SECTION_SEGMENTS { return Err("section exceeds segment limit".into()); }
        let a=self.vertex(a); let b=self.vertex(b); if a==b { return Ok(()); }
        let value=self.edges.entry((a.min(b),a.max(b))).or_default();
        match kind {
            SegmentKind::Coplanar => value.coplanar += 1,
            SegmentKind::OnPlaneEdge => value.on_plane_edge += 1,
            SegmentKind::Crossing => value.crossing += 1,
        }
        Ok(())
    }
}

pub(crate) fn slice(mesh:&Mesh,z:f64)->Result<SliceResult,String> {
    if !z.is_finite() || z.abs()>MAX_ABS_COORDINATE { return Err("slice z must be finite and within coordinate limits".into()); }
    let started=Instant::now();
    let span=(0..3).map(|k|mesh.bounds[1][k]-mesh.bounds[0][k]).fold(0.,f64::max);
    let eps=(span*1e-9).max(1e-8);
    let mut graph=Graph {points:Vec::new(),buckets:HashMap::new(),edges:BTreeMap::new(),eps};
    let mut candidates=0;
    let (ids,visited_nodes)=mesh.index.query(z,eps);
    for id in ids {
        let t=&mesh.triangles[id];
        let p=t.map(|i|mesh.vertices[i as usize]);
        let d=p.map(|p| { let d=p[2]-z; if d.abs()<=eps {0.} else {d} });
        if d.iter().all(|x|*x>0.) || d.iter().all(|x|*x<0.) { continue; }
        candidates+=1;
        if d.iter().all(|x|*x==0.) {
            for i in 0..3 { graph.segment([p[i][0],p[i][1]],[p[(i+1)%3][0],p[(i+1)%3][1]],SegmentKind::Coplanar)?; }
            continue;
        }
        let mut hits=Vec::with_capacity(3);
        for i in 0..3 {
            let j=(i+1)%3;
            if d[i]==0. { hits.push([p[i][0],p[i][1]]); }
            if (d[i]<0. && d[j]>0.) || (d[i]>0. && d[j]<0.) {
                let f=d[i]/(d[i]-d[j]);
                hits.push([p[i][0]+f*(p[j][0]-p[i][0]),p[i][1]+f*(p[j][1]-p[i][1])]);
            }
        }
        if hits.len()==2 {
            let kind=if d.iter().filter(|&&d|d==0.).count()==2 {
                SegmentKind::OnPlaneEdge
            } else { SegmentKind::Crossing };
            graph.segment(hits[0],hits[1],kind)?;
        }
    }
    let mut bad_incidence=false;
    let edges:Vec<_>=graph.edges.iter().filter_map(|(&edge,incidence)| {
        // Two faces may genuinely share an original mesh edge on this plane
        // (also in unwelded soup). Coincident interior-crossing segments are
        // duplicate/overlapping faces, not legitimate shared-edge incidence.
        if incidence.coplanar>2 || incidence.on_plane_edge>2 || incidence.crossing>1
            || (incidence.crossing>0 && (incidence.on_plane_edge>0 || incidence.coplanar>0)) {
            bad_incidence=true;
        }
        if incidence.crossing>0 || incidence.on_plane_edge>0 || incidence.coplanar==1 {Some(edge)} else {None}
    }).collect();
    let mut adjacent=vec![Vec::new();graph.points.len()];
    for (id,&(a,b)) in edges.iter().enumerate() {adjacent[a].push(id);adjacent[b].push(id);}
    let branched=adjacent.iter().any(|a|a.len()>2);
    let mut used=vec![false;edges.len()];
    let mut loops=Vec::new();
    // Open/branch traces first, then the remaining degree-two cycles.
    let starts:Vec<_>=(0..adjacent.len()).filter(|&n|adjacent[n].len()!=2).chain(0..adjacent.len()).collect();
    for start in starts {
        for &first in &adjacent[start] {
            if used[first] {continue;}
            let mut ids=vec![start]; let mut current=start; let mut edge=first; let mut closed=false;
            loop {
                if used[edge] {break;}
                used[edge]=true;
                let (a,b)=edges[edge]; let next=if a==current {b} else {a};
                if next==start {closed=adjacent[start].len()==2;break;}
                ids.push(next);current=next;
                if adjacent[current].len()!=2 {break;}
                if let Some(&e)=adjacent[current].iter().find(|&&e|!used[e]) {edge=e;} else {break;}
            }
            let points=ids.into_iter().map(|id|graph.points[id]).collect();
            loops.push(metrics(points,closed));
        }
    }
    let valid=!bad_incidence && !branched && loops.len()==1 && loops[0].closed && loops[0].area>eps*eps
        && simple_polygon(&loops[0].points,eps);
    Ok(SliceResult {z,valid,loops,query_ms:started.elapsed().as_secs_f64()*1000.,candidate_triangles:candidates,visited_nodes})
}

// Includes every active-set visit (even an expired or Y-disjoint box), not
// merely exact intersection tests. A sweep can otherwise still be quadratic.
const MAX_SIMPLICITY_WORK: usize = 4_000_000;

fn orientation(a: Point, b: Point, c: Point, eps: f64) -> i8 {
    let u = [b[0] - a[0], b[1] - a[1]];
    let v = [c[0] - a[0], c[1] - a[1]];
    let left = u[0] * v[1];
    let right = u[1] * v[0];
    let cross = left - right;
    // Local differences avoid offset-dependent cancellation. Treat distances
    // within the graph's welding tolerance (plus roundoff) conservatively.
    let tolerance = eps * u[0].hypot(u[1])
        + 8. * f64::EPSILON * (left.abs() + right.abs());
    if cross > tolerance { 1 } else if cross < -tolerance { -1 } else { 0 }
}

fn on_segment(a: Point, b: Point, p: Point, eps: f64) -> bool {
    (0..2).all(|k| p[k] >= a[k].min(b[k]) - eps && p[k] <= a[k].max(b[k]) + eps)
}

fn segments_touch(a: Point, b: Point, c: Point, d: Point, eps: f64) -> bool {
    let abc = orientation(a, b, c, eps);
    let abd = orientation(a, b, d, eps);
    let cda = orientation(c, d, a, eps);
    let cdb = orientation(c, d, b, eps);
    (abc == 0 && on_segment(a, b, c, eps))
        || (abd == 0 && on_segment(a, b, d, eps))
        || (cda == 0 && on_segment(c, d, a, eps))
        || (cdb == 0 && on_segment(c, d, b, eps))
        || (abc * abd < 0 && cda * cdb < 0)
}

fn simple_polygon(points: &[Point], eps: f64) -> bool {
    let n = points.len();
    if n < 3 { return false; }
    // Adjacent edges may meet only at their common endpoint. A straight
    // continuation is fine; a reversal overlaps and is not a simple boundary.
    for i in 0..n {
        let a = points[i];
        let b = points[(i + 1) % n];
        let c = points[(i + 2) % n];
        if orientation(a, b, c, eps) == 0
            && (a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1]) > 0. {
            return false;
        }
    }
    let bounds: Vec<_> = (0..n).map(|i| {
        let a = points[i]; let b = points[(i + 1) % n];
        ([a[0].min(b[0]), a[1].min(b[1])], [a[0].max(b[0]), a[1].max(b[1])])
    }).collect();
    let mut order: Vec<_> = (0..n).collect();
    order.sort_unstable_by(|&a, &b| bounds[a].0[0].total_cmp(&bounds[b].0[0]).then(a.cmp(&b)));
    let mut active: Vec<usize> = Vec::new();
    let mut work = 0;
    for i in order {
        let mut k = 0;
        while k < active.len() {
            if work == MAX_SIMPLICITY_WORK { return false; }
            work += 1;
            let j = active[k];
            if bounds[j].1[0] < bounds[i].0[0] - eps {
                active.swap_remove(k);
                continue;
            }
            k += 1;
            if (i + 1) % n == j || (j + 1) % n == i { continue; }
            if bounds[j].1[1] < bounds[i].0[1] - eps || bounds[i].1[1] < bounds[j].0[1] - eps { continue; }
            if segments_touch(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n], eps) {
                return false;
            }
        }
        active.push(i);
    }
    true
}

fn metrics(points:Vec<Point>,closed:bool)->SliceLoop {
    let mut perimeter=0.;let mut twice_area=0.;let mut min=[f64::INFINITY;2];let mut max=[f64::NEG_INFINITY;2];
    // Translate shoelace origin to suppress catastrophic cancellation for offset meshes.
    let origin=points[0];
    for (i,&a) in points.iter().enumerate() {
        for k in 0..2 {min[k]=min[k].min(a[k]);max[k]=max[k].max(a[k]);}
        if i+1<points.len() || closed {
            let b=points[(i+1)%points.len()];perimeter+=distance(a,b);
            twice_area+=(a[0]-origin[0])*(b[1]-origin[1])-(b[0]-origin[0])*(a[1]-origin[1]);
        }
    }
    SliceLoop {points,closed,perimeter,area:if closed {twice_area.abs()*0.5} else {0.},ap:max[1]-min[1],ml:max[0]-min[0]}
}
