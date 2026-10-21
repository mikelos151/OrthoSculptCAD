//! A deterministic synthetic CLI smoke route; never registered as a JavaScript command.
pub(crate) fn report() -> Result<serde_json::Value,String> {
    let n=256usize;
    let mut packet=Vec::new();
    for value in [0x4f534344u32,1,(2*n) as u32,(2*n) as u32] {packet.extend(value.to_le_bytes());}
    for z in [0f32,120.] {
        for i in 0..n {
            let angle=i as f64*std::f64::consts::TAU/n as f64;
            for value in [(40.*angle.cos()) as f32,(40.*angle.sin()) as f32,z] {packet.extend(value.to_le_bytes());}
        }
    }
    for i in 0..n {
        let a=i as u32;let b=((i+1)%n) as u32;let c=a+n as u32;let d=b+n as u32;
        for value in [a,b,d,a,d,c] {packet.extend(value.to_le_bytes());}
    }
    let state=crate::state::NativeState::default();
    let upload=state.upload(&packet)?;
    let mesh=ortho_geometry::Mesh::from_packet(&packet)?;
    let section=mesh.slice(60.)?;
    let binary=state.slice(60.,Some(upload.generation))?;
    let malformed_rejected=state.upload(&[0;16]).is_err();
    // Failed validation must not discard the last valid mesh.
    state.slice(60.,Some(upload.generation))?;
    let replacement=state.upload(&packet)?;
    let stale_rejected=state.slice(60.,Some(upload.generation)).is_err();
    if !section.valid || section.loops.len()!=1 || !malformed_rejected || !stale_rejected {return Err("synthetic smoke checks failed".into());}
    let l=&section.loops[0];
    if (l.perimeter-std::f64::consts::TAU*40.).abs()>0.02 || (l.area-std::f64::consts::PI*1600.).abs()>0.6 {return Err("synthetic analytical tolerance failed".into());}
    Ok(serde_json::json!({
        "engine":"ortho-geometry Rust", "synthetic":true, "valid":section.valid,
        "vertices":mesh.vertex_count(), "triangles":mesh.triangle_count(),
        "z":section.z,"perimeter":l.perimeter,"area":l.area,"ap":l.ap,"ml":l.ml,
        "queryMs":section.query_ms,"candidateTriangles":section.candidate_triangles,"visitedNodes":section.visited_nodes,
        "responseBytes":binary.len(),"generation":replacement.generation,
        "malformedRejected":malformed_rejected,"staleRejected":stale_rejected,
        "guiTested":false,"clinicalValidation":false
    }))
}

#[cfg(test)]
mod tests {
    #[test]
    fn smoke_report_contains_actual_cylinder_measurements() {
        let r=super::report().unwrap();
        println!("{}",serde_json::to_string_pretty(&r).unwrap());
        assert_eq!(r["synthetic"],true);
        assert_eq!(r["valid"],true);
        assert!((r["perimeter"].as_f64().unwrap()-std::f64::consts::TAU*40.).abs()<0.02);
        assert!((r["area"].as_f64().unwrap()-std::f64::consts::PI*1600.).abs()<0.6);
        assert_eq!(r["ap"],80.);assert_eq!(r["ml"],80.);
        assert_eq!(r["malformedRejected"],true);assert_eq!(r["staleRejected"],true);
    }
}
