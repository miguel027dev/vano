from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parent

class FrontendQualityContracts(unittest.TestCase):
    def test_user_puck_keeps_mapbox_absolute_positioning(self):
        css = (ROOT / 'static' / 'vano-map-v300.css').read_text(encoding='utf-8')
        block = re.search(r'\.vano-user-puck-v300\s*\{([^}]*)\}', css, re.S)
        self.assertIsNotNone(block)
        body = block.group(1).replace(' ', '').replace('\n', '')
        self.assertIn('position:absolute!important', body)
        self.assertNotIn('position:relative!important', body)

    def test_map_gesture_releases_passive_follow(self):
        js = (ROOT / 'static' / 'vano-map-v300.js').read_text(encoding='utf-8')
        self.assertIn("['dragstart','zoomstart','rotatestart','pitchstart'].forEach(evt=>map.on(evt,releaseNavigationCameraFromGesture))", js)
        fn = re.search(r'function releaseNavigationCameraFromGesture\(e\)\{(.+?)\n\}', js, re.S)
        self.assertIsNotNone(fn)
        self.assertIn('mapFollowMode=false', fn.group(1))
        self.assertIn('map?.stop?.()', fn.group(1))


    def test_legacy_fallback_is_readable_and_keeps_mapbox_positioning(self):
        js = (ROOT / 'static' / 'vano-map-v122.js').read_text(encoding='utf-8')
        css = (ROOT / 'static' / 'vano-map-page-v230.css').read_text(encoding='utf-8')
        self.assertNotIn('(0,eval)', js)
        self.assertNotIn("atob('", js)
        self.assertIn('.mapboxgl-marker.user-marker{position:absolute!important', css)

    def test_production_javascript_has_no_runtime_eval_wrapper(self):
        offenders = []
        for js in (ROOT / 'static').glob('*.js'):
            text = js.read_text(encoding='utf-8', errors='ignore')
            if '(0,eval)' in text or 'eval(' in text:
                offenders.append(js.name)
        self.assertEqual([], offenders)

    def test_deploy_build_id_matches_gps_fix_release(self):
        app_py = (ROOT / 'app.py').read_text(encoding='utf-8')
        render = (ROOT / 'render.yaml').read_text(encoding='utf-8')
        sw = (ROOT / 'static' / 'vano-sw-v300.js').read_text(encoding='utf-8')
        self.assertIn('"325.1.0"', app_py)
        self.assertIn('value: 325.1.0', render)
        self.assertIn("325.1.0-gps-anchor", sw)

    def test_public_route_errors_do_not_leak_exception_detail(self):
        py = (ROOT / 'app.py').read_text(encoding='utf-8')
        self.assertNotIn('"detail": str(exc)', py)
        self.assertNotIn('"detail":str(exc)', py)

if __name__ == '__main__':
    unittest.main()
