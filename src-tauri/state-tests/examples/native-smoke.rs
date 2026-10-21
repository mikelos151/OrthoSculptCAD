// Executes exactly the real shell state and CLI report generator, without GUI linkage.
#[path = "../../src/state.rs"]
mod state;
#[path = "../../src/self_test.rs"]
mod self_test;
fn main() {
    match self_test::report() {
        Ok(report)=>println!("{}",serde_json::to_string_pretty(&report).expect("finite synthetic JSON")),
        Err(error)=>{eprintln!("{error}");std::process::exit(1);}
    }
}
