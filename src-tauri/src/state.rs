use std::sync::{Arc,Mutex};
use ortho_geometry::Mesh;
use serde::Serialize;

#[derive(Default)]
pub(crate) struct NativeState { inner:Mutex<(u64,Option<Arc<Mesh>>)>, upload_gate:Mutex<()> }
#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub(crate) struct UploadSummary { pub generation:u64, pub vertices:usize, pub triangles:usize, pub bounds:[[f64;3];2] }
impl NativeState {
    pub fn upload(&self,bytes:&[u8])->Result<UploadSummary,String> {
        // Serialize uploads and fail fast on overload; validate/index before publishing.
        let _gate=self.upload_gate.try_lock().map_err(|_|"mesh upload busy")?;
        let mesh=Arc::new(Mesh::from_packet(bytes)?);
        let mut inner=self.inner.lock().map_err(|_|"mesh state unavailable")?;
        let generation=inner.0.checked_add(1).filter(|g|*g<=9_007_199_254_740_991).ok_or("mesh generation exhausted")?;
        let summary=UploadSummary {generation,vertices:mesh.vertex_count(),triangles:mesh.triangle_count(),bounds:mesh.bounds()};
        *inner=(generation,Some(mesh));
        Ok(summary)
    }
    pub fn slice(&self,z:f64,generation:Option<u64>)->Result<Vec<u8>,String> {
        let (current,mesh)={
            let inner=self.inner.lock().map_err(|_|"mesh state unavailable")?;
            if generation.is_some_and(|g|g!=inner.0) {return Err("stale mesh generation; upload again".into());}
            (inner.0,inner.1.as_ref().ok_or("no mesh uploaded")?.clone())
        };
        let packet=mesh.slice(z)?.to_packet()?;
        if self.inner.lock().map_err(|_|"mesh state unavailable")?.0!=current {return Err("mesh changed during slice".into());}
        Ok(packet)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn triangle()->Vec<u8> {
        let mut b=Vec::new();for n in [0x4f534344u32,1,3,1] {b.extend(n.to_le_bytes());}
        for x in [0f32,0.,0.,1.,0.,0.,0.,1.,0.] {b.extend(x.to_le_bytes());}
        for n in [0u32,1,2] {b.extend(n.to_le_bytes());} b
    }
    #[test]
    fn failed_upload_keeps_mesh_and_generation() {
        let state=NativeState::default();let first=state.upload(&triangle()).unwrap();
        assert_eq!(first.generation,1);assert_eq!(first.vertices,3);
        assert!(state.upload(&[0;16]).is_err());
        assert!(state.slice(0.,Some(first.generation)).is_ok());
        assert_eq!(state.upload(&triangle()).unwrap().generation,2);
        assert!(state.slice(0.,Some(first.generation)).is_err());
        assert!(state.slice(0.,Some(2)).is_ok());
    }
    #[test]
    fn absent_mesh_and_nonfinite_planes_are_rejected() {
        let state=NativeState::default();assert!(state.slice(0.,None).is_err());
        state.upload(&triangle()).unwrap();assert!(state.slice(f64::NAN,None).is_err());
    }
}
