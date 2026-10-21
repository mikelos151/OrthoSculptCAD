use ortho_geometry::Mesh;

fn packet(vertices: &[[f32; 3]], triangles: &[[u32; 3]]) -> Vec<u8> {
    let mut b = Vec::new();
    for n in [0x4f534344u32, 1, vertices.len() as u32, triangles.len() as u32] { b.extend(n.to_le_bytes()); }
    for p in vertices { for n in p { b.extend(n.to_le_bytes()); } }
    for t in triangles { for n in t { b.extend(n.to_le_bytes()); } }
    b
}

#[test]
fn rejects_nonfinite_indices_degenerates_and_out_of_range_coordinates() {
    let base = [[0.,0.,0.], [1.,0.,0.], [0.,1.,0.]];
    for value in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY, 1_000_001.] {
        let mut v = base; v[0][0] = value;
        assert!(Mesh::from_packet(&packet(&v, &[[0,1,2]])).is_err(), "accepted {value}");
    }
    for tri in [[0,1,3], [0,0,1], [u32::MAX,1,2]] {
        assert!(Mesh::from_packet(&packet(&base,&[tri])).is_err());
    }
    assert!(Mesh::from_packet(&packet(&[[0.,0.,0.],[1.,0.,0.],[2.,0.,0.]], &[[0,1,2]])).is_err());
}

#[test]
fn rejects_truncated_extended_wrong_header_and_huge_counts() {
    let p = packet(&[[0.,0.,0.],[1.,0.,0.],[0.,1.,0.]], &[[0,1,2]]);
    for length in 0..p.len() { assert!(Mesh::from_packet(&p[..length]).is_err()); }
    let mut extended = p.clone(); extended.push(0); assert!(Mesh::from_packet(&extended).is_err());
    for (offset,value) in [(0,0),(4,2),(8,u32::MAX),(12,u32::MAX),(8,0),(12,0)] {
        let mut bad=p.clone(); bad[offset..offset+4].copy_from_slice(&u32::to_le_bytes(value));
        assert!(Mesh::from_packet(&bad).is_err());
    }
}

fn cylinder(n: usize, levels: usize, rx: f32, ry: f32, offset_x: f32) -> (Vec<[f32;3]>,Vec<[u32;3]>) {
    let mut v=Vec::new(); let mut t=Vec::new();
    for j in 0..=levels { for i in 0..n { let a=(i as f64)*std::f64::consts::TAU/n as f64; v.push([offset_x+rx*a.cos() as f32,ry*a.sin() as f32,j as f32*10.]); } }
    for j in 0..levels { for i in 0..n { let a=(j*n+i) as u32; let b=(j*n+(i+1)%n) as u32; let c=a+n as u32; let d=b+n as u32; t.extend([[a,b,d],[a,d,c]]); } }
    (v,t)
}

#[test]
fn cylinder_has_ordered_closed_loop_and_analytical_metrics() {
    let (v,t)=cylinder(256,2,20.,30.,0.);
    let m=Mesh::from_packet(&packet(&v,&t)).unwrap();
    let s=m.slice(7.).unwrap();
    assert!(s.valid); assert_eq!(s.loops.len(),1);
    let l=&s.loops[0]; assert!(l.closed);
    assert!((l.area-std::f64::consts::PI*600.).abs()<0.3);
    assert!((l.ap-60.).abs()<1e-5); assert!((l.ml-40.).abs()<1e-5);
    let expected:f64=(0..256).map(|i| { let a=v[i]; let b=v[(i+1)%256]; ((a[0]-b[0]) as f64).hypot((a[1]-b[1]) as f64) }).sum();
    assert!((l.perimeter-expected).abs()<1e-5);
    let ordered:f64=(0..l.points.len()).map(|i| { let a=l.points[i]; let b=l.points[(i+1)%l.points.len()]; (a[0]-b[0]).hypot(a[1]-b[1]) }).sum();
    assert!((ordered-l.perimeter).abs()<1e-8);
    assert!(s.query_ms.is_finite());
}

#[test]
fn reusable_interval_bvh_prunes_far_away_triangles() {
    let (v,t)=cylinder(64,100,20.,20.,0.);
    let m=Mesh::from_packet(&packet(&v,&t)).unwrap();
    for z in [5.,455.,995.] {
        let s=m.slice(z).unwrap();assert!(s.valid);
        assert!(s.visited_nodes>0,"no actual hierarchy visited");
        assert!(s.visited_nodes<t.len()/10,"hierarchy did not prune");
        assert!(s.candidate_triangles<=128,"too many candidates");
    }
}

#[test]
fn coplanar_cap_diagonal_is_removed_and_vertex_planes_are_closed() {
    let v=[[0.,0.,0.],[4.,0.,0.],[4.,6.,0.],[0.,6.,0.],[0.,0.,10.],[4.,0.,10.],[4.,6.,10.],[0.,6.,10.]];
    let t=[[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[1,5,6],[1,6,2],[2,6,7],[2,7,3],[3,7,4],[3,4,0]];
    let mesh=Mesh::from_packet(&packet(&v,&t)).unwrap();
    for z in [0.,5.,10.] {let s=mesh.slice(z).unwrap();assert!(s.valid,"z {z} {s:?}");assert_eq!(s.loops.len(),1);let l=&s.loops[0];assert!((l.perimeter-20.).abs()<1e-8);assert!((l.area-24.).abs()<1e-8);assert_eq!(l.ap,6.);assert_eq!(l.ml,4.);}
}

#[test]
fn disconnected_cylinders_are_not_silently_summed() {
    let (mut v,mut t)=cylinder(32,1,10.,10.,-30.);let (v2,t2)=cylinder(32,1,10.,10.,30.);let off=v.len() as u32;
    v.extend(v2);t.extend(t2.iter().map(|t|t.map(|i|i+off)));
    let s=Mesh::from_packet(&packet(&v,&t)).unwrap().slice(5.).unwrap();
    assert!(!s.valid);assert_eq!(s.loops.len(),2);assert!(s.loops.iter().all(|l|l.closed));
}

#[test]
fn open_and_branched_sections_are_invalid() {
    let (v,mut t)=cylinder(32,1,10.,10.,0.);t.drain(0..2);
    let s=Mesh::from_packet(&packet(&v,&t)).unwrap().slice(5.).unwrap();assert!(!s.valid);assert!(s.loops.iter().any(|l|!l.closed));
    let v=[[0.,0.,0.],[1.,0.,0.],[0.,1.,0.],[-1.,0.,0.],[0.,-1.,0.]];
    let t=[[0,1,2],[0,3,4]];
    let s=Mesh::from_packet(&packet(&v,&t)).unwrap().slice(0.).unwrap();assert!(!s.valid);
}

#[test]
fn outside_and_nonfinite_planes_do_not_produce_measurements() {
    let (v,t)=cylinder(32,1,10.,10.,0.);let m=Mesh::from_packet(&packet(&v,&t)).unwrap();
    for z in [-1.,11.] {let s=m.slice(z).unwrap();assert!(!s.valid);assert!(s.loops.is_empty());}
    for z in [f64::NAN,f64::INFINITY,1_000_001.] {assert!(m.slice(z).is_err());}
}

#[test]
fn triangle_order_does_not_change_metrics() {
    let (v,t)=cylinder(32,1,10.,15.,0.);let a=Mesh::from_packet(&packet(&v,&t)).unwrap().slice(5.).unwrap();
    let mut reverse=t;reverse.reverse();for t in &mut reverse {t.swap(0,2);}
    let b=Mesh::from_packet(&packet(&v,&reverse)).unwrap().slice(5.).unwrap();assert!(a.valid && b.valid);
    assert!((a.loops[0].area-b.loops[0].area).abs()<1e-8);assert!((a.loops[0].perimeter-b.loops[0].perimeter).abs()<1e-8);
}

#[test]
fn response_packet_is_exact_little_endian_contract() {
    let (v,t)=cylinder(8,1,10.,10.,0.);let s=Mesh::from_packet(&packet(&v,&t)).unwrap().slice(5.).unwrap();
    let b=s.to_packet().unwrap();
    assert_eq!(u32::from_le_bytes(b[0..4].try_into().unwrap()),0x4f53534c);
    assert_eq!(u32::from_le_bytes(b[4..8].try_into().unwrap()),1);
    assert_eq!(u32::from_le_bytes(b[8..12].try_into().unwrap()),1);
    assert_eq!(u32::from_le_bytes(b[12..16].try_into().unwrap()),1);
    assert_eq!(f64::from_le_bytes(b[16..24].try_into().unwrap()),5.);
    assert_eq!(f64::from_le_bytes(b[24..32].try_into().unwrap()),s.query_ms);
    assert_eq!(u32::from_le_bytes(b[32..36].try_into().unwrap()),1);
    assert_eq!(u32::from_le_bytes(b[36..40].try_into().unwrap()) as usize,s.loops[0].points.len());
    for (i,value) in [s.loops[0].perimeter,s.loops[0].area,s.loops[0].ap,s.loops[0].ml].iter().enumerate() {assert_eq!(f64::from_le_bytes(b[40+i*8..48+i*8].try_into().unwrap()),*value);}
    assert_eq!(b.len(),72+s.loops[0].points.len()*16);
    assert_eq!(f64::from_le_bytes(b[72..80].try_into().unwrap()),s.loops[0].points[0][0]);
}

#[test]
fn unwelded_triangle_soup_and_shared_vertex_plane_rejoin_geometrically() {
    let (v,t)=cylinder(64,2,10.,15.,0.);
    let mut soup=Vec::new();let mut indices=Vec::new();
    for triangle in &t {let start=soup.len() as u32;for &id in triangle {soup.push(v[id as usize]);}indices.push([start,start+1,start+2]);}
    let mesh=Mesh::from_packet(&packet(&soup,&indices)).unwrap();
    for z in [0.,5.,10.,20.] {let s=mesh.slice(z).unwrap();assert!(s.valid,"z={z} {s:?}");assert!((s.loops[0].ap-30.).abs()<1e-6);}
}

#[test]
fn isolated_tangent_vertex_is_not_a_contour() {
    let v=[[0.,0.,10.],[-1.,-1.,0.],[1.,-1.,0.],[0.,1.,0.]];
    let t=[[0,1,2],[0,2,3],[0,3,1],[1,3,2]];
    let s=Mesh::from_packet(&packet(&v,&t)).unwrap().slice(10.).unwrap();
    assert!(!s.valid);assert!(s.loops.is_empty());
}

#[test]
fn excessive_section_complexity_is_rejected() {
    let (v,t)=cylinder(125_001,1,30.,30.,0.);
    let mesh=Mesh::from_packet(&packet(&v,&t)).unwrap();
    assert!(mesh.slice(5.).unwrap_err().contains("segment limit"));
}

#[test]
fn accepts_indexed_triangle_and_reports_bounds() {
    let p = packet(&[[1.,2.,3.], [4.,2.,3.], [1.,6.,3.]], &[[0,1,2]]);
    let m = Mesh::from_packet(&p).expect("valid indexed triangle");
    assert_eq!(m.vertex_count(), 3);
    assert_eq!(m.triangle_count(), 1);
    assert_eq!(m.bounds(), [[1.,2.,3.], [4.,6.,3.]]);
}

fn prism(contour: &[[f32; 2]]) -> (Vec<[f32; 3]>, Vec<[u32; 3]>) {
    let n = contour.len() as u32;
    let vertices = [0., 100.].into_iter()
        .flat_map(|z| contour.iter().map(move |p| [p[0], p[1], z])).collect();
    let mut triangles = Vec::new();
    for i in 0..n {
        let j = (i + 1) % n;
        triangles.extend([[i, j, n + j], [i, n + j, n + i]]);
    }
    (vertices, triangles)
}

#[test]
fn self_intersecting_closed_section_with_nonzero_area_is_invalid() {
    let (v, t) = prism(&[[0., 0.], [5., 0.], [0., 4.], [4., 4.], [1., 1.]]);
    let section = Mesh::from_packet(&packet(&v, &t)).unwrap().slice(50.).unwrap();
    assert_eq!(section.loops.len(), 1);
    assert!(section.loops[0].closed);
    assert!((section.loops[0].area - 2.).abs() < 1e-8);
    assert!(!section.valid, "self-intersecting diagnostic loop accepted: {section:?}");
}

#[test]
fn duplicate_crossing_face_is_invalid_even_when_unique_edges_form_square() {
    let (v, mut t) = prism(&[[0., 0.], [10., 0.], [10., 10.], [0., 10.]]);
    t.push([0, 1, 5]);
    let section = Mesh::from_packet(&packet(&v, &t)).unwrap().slice(50.).unwrap();
    assert_eq!(section.loops.len(), 1);
    assert!(section.loops[0].closed);
    assert_eq!(section.loops[0].area, 100.);
    assert_eq!(section.loops[0].perimeter, 40.);
    assert!(!section.valid, "duplicate crossing face accepted: {section:?}");
}

#[test]
fn overlapping_and_nonadjacent_touching_contours_are_invalid() {
    for contour in [
        // Backtracking at a shared endpoint: graph degree alone is insufficient.
        vec![[0., 0.], [6., 0.], [2., 0.], [2., 4.], [0., 4.]],
        // Non-adjacent collinear segments overlap without identical endpoints.
        vec![[0., 0.], [8., 0.], [8., 4.], [2., 4.], [2., 0.], [6., 0.], [6., 6.], [0., 6.]],
        // A vertex touches the interior of a non-adjacent segment.
        vec![[0., 0.], [8., 0.], [8., 6.], [2., 6.], [2., 0.], [0., 6.]],
        // A repeated, non-adjacent vertex.
        vec![[0., 0.], [4., 0.], [4., 4.], [2., 2.], [0., 4.], [2., 2.]],
    ] {
        let (v, t) = prism(&contour);
        let section = Mesh::from_packet(&packet(&v, &t)).unwrap().slice(50.).unwrap();
        assert!(!section.valid, "accepted overlap/touch: {contour:?}");
        assert!(!section.loops.is_empty(), "diagnostic traces must be retained");
    }
}

#[test]
fn concave_near_collinear_and_translated_simple_contours_remain_valid() {
    for contour in [
        vec![[0., 0.], [8., 0.], [8., 6.], [4., 2.], [0., 6.]],
        vec![[0., 0.], [5., 0.00001], [10., 0.], [10., 8.], [0., 8.]],
        vec![[900000., 900000.], [900005., 900000.0625], [900010., 900000.], [900010., 900008.], [900000., 900008.]],
        // Parallel non-adjacent edges close to, but clearly above, welding tolerance.
        vec![[0., 0.], [10., 0.], [10., 8.], [5., 8.], [5., 0.00001], [4., 0.00001], [4., 8.], [0., 8.]],
    ] {
        let (v, t) = prism(&contour);
        let mesh = Mesh::from_packet(&packet(&v, &t)).unwrap();
        for z in [0., 50., 100.] {
            let section = mesh.slice(z).unwrap();
            assert!(section.valid, "rejected simple contour {contour:?} at {z}: {section:?}");
            assert_eq!(section.loops.len(), 1);
        }
    }
}

#[test]
fn duplicate_reversed_and_unwelded_crossing_faces_are_invalid() {
    let (v, t) = prism(&[[0., 0.], [10., 0.], [10., 10.], [0., 10.]]);
    for unwelded in [false, true] {
        let mut vertices = v.clone();
        let mut triangles = t.clone();
        if unwelded {
            let start = vertices.len() as u32;
            vertices.extend([v[5], v[1], v[0]]);
            triangles.push([start, start + 1, start + 2]);
        } else {
            triangles.push([5, 1, 0]);
        }
        let section = Mesh::from_packet(&packet(&vertices, &triangles)).unwrap().slice(50.).unwrap();
        assert!(!section.valid, "accepted duplicate crossing, unwelded={unwelded}");
        assert_eq!(section.loops.len(), 1);
        let bytes = section.to_packet().unwrap();
        assert_eq!(u32::from_le_bytes(bytes[8..12].try_into().unwrap()), 0);
        assert_eq!(u32::from_le_bytes(bytes[12..16].try_into().unwrap()), 1);
    }
}

#[test]
fn pathological_simple_contour_fails_closed_when_validation_work_is_exhausted() {
    // A simple serpentine boundary with many overlapping X intervals. A naive
    // sweep still does quadratic work even when every Y AABB test rejects.
    for rows in [30, 3000] {
        let mut contour = Vec::new();
        for row in 0..rows {
            let y = row as f32;
            if row % 2 == 0 { contour.extend([[0., y], [10., y]]); }
            else { contour.extend([[10., y], [0., y]]); }
        }
        contour.extend([[-1., (rows - 1) as f32], [-1., -1.], [0., -1.]]);
        let (v, t) = prism(&contour);
        let section = Mesh::from_packet(&packet(&v, &t)).unwrap().slice(50.).unwrap();
        assert_eq!(section.valid, rows == 30,
            "small simple contours must pass, exhausted validation must fail closed (rows={rows})");
        assert_eq!(section.loops.len(), 1);
        assert!(section.loops[0].closed);
        assert!(section.loops[0].area > 0.);
    }
}
