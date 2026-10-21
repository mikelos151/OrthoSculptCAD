//! Narrow top-level navigation allowlist (IPC is handled separately by CSP).
pub(crate) fn local_origin(scheme:&str,host:Option<&str>,port:Option<u16>,development:bool)->bool {
    (scheme=="tauri" && host==Some("localhost") && port.is_none())
        || (scheme=="http" && host==Some("tauri.localhost") && port.is_none())
        || (development && scheme=="http" && host==Some("127.0.0.1") && port==Some(4174))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn packaged_origin_is_allowed_without_remote_navigation() {
        assert!(local_origin("tauri",Some("localhost"),None,false));
        assert!(local_origin("http",Some("tauri.localhost"),None,false));
        for host in ["example.org","localhost.evil.org","ipc.localhost","127.0.0.1"] {assert!(!local_origin("http",Some(host),None,false));}
        assert!(!local_origin("file",None,None,false));
        assert!(!local_origin("https",Some("tauri.localhost"),None,false));
    }
    #[test]
    fn development_origin_is_exact_and_disabled_in_release() {
        assert!(local_origin("http",Some("127.0.0.1"),Some(4174),true));
        assert!(!local_origin("http",Some("127.0.0.1"),Some(4174),false));
        assert!(!local_origin("http",Some("127.0.0.1"),Some(4175),true));
        assert!(!local_origin("http",Some("localhost"),Some(4174),true));
    }
}
