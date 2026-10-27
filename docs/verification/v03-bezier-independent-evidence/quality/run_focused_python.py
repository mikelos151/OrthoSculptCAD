import os
import pathlib
import sys
import unittest
sys.dont_write_bytecode = True
ROOT = pathlib.Path('C:/Users/sandr/OrthoSculptCAD')
OUT = pathlib.Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-bezier-quality-review')
os.environ['LOCALAPPDATA'] = str(OUT)
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
sys.path.insert(0, str(ROOT / 'tests/reference'))
loader = unittest.TestLoader()
suite = unittest.TestSuite([loader.loadTestsFromName('test_v03_bezier_verify'), loader.loadTestsFromName('test_v03_bezier_interop')])
print('Scope: only v03 Bezier verifier and interop tests; all temporary writes inside review scratch.', flush=True)
result = unittest.TextTestRunner(verbosity=2).run(suite)
print('testsRun=', result.testsRun, 'failures=', len(result.failures), 'errors=', len(result.errors), 'skipped=', len(result.skipped))
raise SystemExit(0 if result.wasSuccessful() else 1)
