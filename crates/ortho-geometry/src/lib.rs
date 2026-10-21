//! Pure geometry: millimetres, X lateral/Y anterior/Z proximal. No GUI or I/O.
mod slice;
mod index;
pub const MESH_MAGIC: u32 = 0x4f534344;
pub const VERSION: u32 = 1;
pub const MAX_VERTICES: usize = 1_000_000;
pub const MAX_TRIANGLES: usize = 2_000_000;
pub const MAX_PACKET_BYTES: usize = 16 + MAX_VERTICES * 12 + MAX_TRIANGLES * 12;
pub const MAX_ABS_COORDINATE: f64 = 1_000_000.0;

#[derive(Debug)]
pub struct Mesh {
    vertices: Vec<[f64; 3]>,
    triangles: Vec<[u32; 3]>,
    bounds: [[f64; 3]; 2],
    index: index::IntervalIndex,
}
#[derive(Debug)]
pub struct SliceLoop { pub points: Vec<[f64;2]>, pub closed: bool, pub perimeter: f64, pub area: f64, pub ap: f64, pub ml: f64 }
#[derive(Debug)]
pub struct SliceResult { pub z: f64, pub valid: bool, pub loops: Vec<SliceLoop>, pub query_ms: f64, pub candidate_triangles: usize, pub visited_nodes: usize }
impl SliceResult {
    /// Owned little-endian response; deliberately not described as zero-copy.
    pub fn to_packet(&self)->Result<Vec<u8>,String> {
        let points=self.loops.iter().try_fold(0usize,|n,l|n.checked_add(l.points.len())).ok_or("section overflow")?;
        if self.loops.len()>slice::MAX_SECTION_SEGMENTS || points>slice::MAX_SECTION_SEGMENTS*2 {return Err("section response exceeds limits".into());}
        let len=32+self.loops.len()*40+points*16;
        let mut b=Vec::with_capacity(len);
        for n in [0x4f53534cu32,VERSION,u32::from(self.valid),self.loops.len() as u32] {b.extend(n.to_le_bytes());}
        for n in [self.z,self.query_ms] {b.extend(n.to_le_bytes());}
        for l in &self.loops {
            b.extend(u32::from(l.closed).to_le_bytes());b.extend((l.points.len() as u32).to_le_bytes());
            for n in [l.perimeter,l.area,l.ap,l.ml] {b.extend(n.to_le_bytes());}
            for p in &l.points {for n in p {b.extend(n.to_le_bytes());}}
        }
        Ok(b)
    }
}
impl Mesh {
    pub fn slice(&self, z: f64) -> Result<SliceResult,String> { slice::slice(self,z) }
    pub fn from_packet(bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() < 16 || bytes.len() > MAX_PACKET_BYTES { return Err("mesh packet length outside limits".into()); }
        let word = |offset| u32::from_le_bytes(bytes[offset..offset+4].try_into().unwrap());
        if word(0) != MESH_MAGIC || word(4) != VERSION { return Err("mesh magic/version mismatch".into()); }
        let nv = word(8) as usize;
        let nt = word(12) as usize;
        if !(3..=MAX_VERTICES).contains(&nv) || !(1..=MAX_TRIANGLES).contains(&nt) { return Err("mesh counts outside limits".into()); }
        let expected = 16usize.checked_add(nv.checked_mul(12).ok_or("mesh overflow")?).and_then(|n| n.checked_add(nt.checked_mul(12)?)).ok_or("mesh overflow")?;
        if bytes.len() != expected { return Err("mesh packet length/count mismatch".into()); }
        let mut vertices = Vec::with_capacity(nv);
        let mut bounds = [[f64::INFINITY; 3], [f64::NEG_INFINITY; 3]];
        for i in 0..nv {
            let mut p = [0.; 3];
            for k in 0..3 {
                let off = 16 + i*12 + k*4;
                p[k] = f32::from_le_bytes(bytes[off..off+4].try_into().unwrap()) as f64;
                if !p[k].is_finite() || p[k].abs() > MAX_ABS_COORDINATE { return Err("nonfinite or excessive mesh coordinate".into()); }
                bounds[0][k] = bounds[0][k].min(p[k]);
                bounds[1][k] = bounds[1][k].max(p[k]);
            }
            vertices.push(p);
        }
        let mut triangles = Vec::with_capacity(nt);
        for i in 0..nt {
            let off = 16 + nv*12 + i*12;
            let t = [word(off),word(off+4),word(off+8)];
            if t.iter().any(|&v| v as usize >= nv) { return Err("triangle index outside vertices".into()); }
            let a = vertices[t[0] as usize]; let b = vertices[t[1] as usize]; let c = vertices[t[2] as usize];
            let u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
            let v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
            let cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
            if cross.iter().map(|x| x*x).sum::<f64>() <= 1e-24 { return Err("degenerate triangle".into()); }
            triangles.push(t);
        }
        let index = index::IntervalIndex::new(&vertices,&triangles);
        Ok(Self { vertices, triangles, bounds, index })
    }
    pub fn vertex_count(&self) -> usize { self.vertices.len() }
    pub fn triangle_count(&self) -> usize { self.triangles.len() }
    pub fn bounds(&self) -> [[f64; 3]; 2] { self.bounds }
}
