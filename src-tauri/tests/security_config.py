"""Configuration gates; run with `python src-tauri/tests/security_config.py`."""
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class SecurityConfig(unittest.TestCase):
    def test_only_local_capability_and_no_plugin_grants(self):
        caps = list((ROOT / 'capabilities').glob('*.json'))
        self.assertEqual(len(caps), 1)
        cap = json.loads(caps[0].read_text(encoding='utf-8'))
        self.assertEqual(cap['windows'], ['main'])
        self.assertNotIn('remote', cap)
        self.assertEqual(cap['permissions'], ['allow-upload-mesh', 'allow-slice-mesh'])

    def test_local_policy_and_explicit_build_paths(self):
        c = json.loads((ROOT / 'tauri.conf.json').read_text(encoding='utf-8'))
        self.assertEqual(c['build']['frontendDist'], '../dist')
        self.assertEqual(c['build']['devUrl'], 'http://127.0.0.1:4174')
        self.assertFalse(c['app']['withGlobalTauri'])
        self.assertFalse(c['app']['windows'][0]['create'])
        self.assertFalse(c['bundle']['active'])
        csp = c['app']['security']['csp']
        self.assertIn("default-src 'self'", csp)
        self.assertIn("object-src 'none'", csp)
        self.assertIn("frame-src 'none'", csp)
        self.assertNotIn('https://*', csp)
        self.assertNotIn("'unsafe-eval'", csp)
        self.assertEqual(c['app']['security']['capabilities'], ['main-local'])

if __name__ == '__main__':
    unittest.main()
