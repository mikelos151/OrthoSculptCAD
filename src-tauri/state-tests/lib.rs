// Run the actual shell state implementation without linking a GUI or WebView.
#[cfg(test)]
#[path = "../src/state.rs"]
mod state;
#[cfg(test)]
#[path = "../src/self_test.rs"]
mod self_test;
#[cfg(test)]
#[path = "../src/navigation.rs"]
mod navigation;
