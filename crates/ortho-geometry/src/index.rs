//! Balanced z-interval BVH, built once after validation and reused for every plane.
#[derive(Debug)]
struct Node { min:f64,max:f64,start:usize,end:usize,children:Option<[usize;2]> }
#[derive(Debug)]
pub(crate) struct IntervalIndex { nodes:Vec<Node>, order:Vec<usize> }
impl IntervalIndex {
    pub fn new(vertices:&[[f64;3]],triangles:&[[u32;3]])->Self {
        let intervals:Vec<_>=triangles.iter().map(|t| {
            let z=t.map(|v|vertices[v as usize][2]);
            (z.into_iter().fold(f64::INFINITY,f64::min),z.into_iter().fold(f64::NEG_INFINITY,f64::max))
        }).collect();
        let mut order:Vec<_>=(0..triangles.len()).collect();
        order.sort_unstable_by(|&a,&b|(intervals[a].0+intervals[a].1).total_cmp(&(intervals[b].0+intervals[b].1)).then(a.cmp(&b)));
        let mut index=Self {nodes:Vec::with_capacity(triangles.len()/2+1),order};
        index.build(&intervals,0,triangles.len());index
    }
    fn build(&mut self,intervals:&[(f64,f64)],start:usize,end:usize)->usize {
        let id=self.nodes.len();self.nodes.push(Node {min:0.,max:0.,start,end,children:None});
        let (min,max,children)=if end-start<=8 {
            let (mut min,mut max)=(f64::INFINITY,f64::NEG_INFINITY);
            for &t in &self.order[start..end] {min=min.min(intervals[t].0);max=max.max(intervals[t].1);}
            (min,max,None)
        } else {
            let mid=start+(end-start)/2;let left=self.build(intervals,start,mid);let right=self.build(intervals,mid,end);
            (self.nodes[left].min.min(self.nodes[right].min),self.nodes[left].max.max(self.nodes[right].max),Some([left,right]))
        };
        self.nodes[id]=Node {min,max,start,end,children};id
    }
    pub fn query(&self,z:f64,eps:f64)->(Vec<usize>,usize) {
        let mut out=Vec::new();let mut visited=0;let mut stack=vec![0usize];
        while let Some(id)=stack.pop() {
            visited+=1;let n=&self.nodes[id];if z<n.min-eps || z>n.max+eps {continue;}
            if let Some([left,right])=n.children {stack.push(right);stack.push(left);} else {out.extend_from_slice(&self.order[n.start..n.end]);}
        }
        (out,visited)
    }
}
