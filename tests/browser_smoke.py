"""Functional Chromium tests of the shipped standalone game; no public catalog edits."""
import copy
import json
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://guyfights.neocities.org'
REGISTRY = ORIGIN + '/mods/index.json'
GUY = json.loads((ROOT / 'tests/fixtures/drunk-guy.json').read_text())
MATCH = copy.deepcopy(GUY)
MATCH.update(id='local-match', name='Local match defaults', changes={'matchSettings': {'roundDuration': 180.5}})


def entry(manifest):
    return {**{k: v for k, v in manifest.items() if k not in ('formatVersion', 'changes')},
            'manifest': 'mods/' + manifest['id'] + '/mod.json'}


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, args=['--no-sandbox'])
            context = browser.new_context(viewport={'width': 1280, 'height': 900})
            context.add_init_script("localStorage.setItem('guy-fights.menu-music-choice.v1', 'false');")
            mode = {'value': 'offline', 'manifest': copy.deepcopy(GUY)}

            def remote(route):
                if mode['value'] == 'offline':
                    route.abort('internetdisconnected')
                    return
                if route.request.url == REGISTRY:
                    data = {'formatVersion': 99, 'mods': []} if mode['value'] == 'malformed' else {'formatVersion': 1, 'mods': [entry(mode['manifest'])]}
                else:
                    data = copy.deepcopy(mode['manifest'])
                    if mode['value'] == 'mismatch':
                        data['author'] = 'Mismatched author'
                route.fulfill(status=200, content_type='application/json', body=json.dumps(data), headers={'Access-Control-Allow-Origin': '*'})

            def game_files(route):
                from urllib.request import urlopen
                from urllib.parse import urlsplit
                path = urlsplit(route.request.url).path
                with urlopen(f'http://127.0.0.1:{server.server_port}' + path) as response:
                    route.fulfill(status=response.status, headers=dict(response.headers), body=response.read())

            context.route(ORIGIN + '/**', game_files)
            context.route(ORIGIN + '/mods/**', remote)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            def wait_expression(expression, timeout=30000):
                # Poll through CDP directly; wait_for_function's injected evaluator
                # can violate the game's intentionally strict no-string-code CSP.
                end = time.monotonic() + timeout / 1000
                while time.monotonic() < end:
                    if page.evaluate(expression):
                        return
                    page.wait_for_timeout(100)
                raise AssertionError('Timed out: ' + expression + ' | UI: ' + page.locator('#modsStatus').inner_text())
            page.goto(ORIGIN + '/src/guy_fights_0.2.4.html', wait_until='load', timeout=60000)
            wait_expression('window.guyFightsMods && !window.guyGameBoot.active', timeout=40000)
            snapshot = lambda: page.evaluate('window.guyFightsMods.snapshot()')
            assert snapshot()['guys']['drunk-guy']['hp'] == 1000
            assert page.locator('#versionLabel').inner_text() == 'Beta (0.2.4)'
            page.locator('#titleMods').click()
            wait_expression("window.guyFightsMods.snapshot().registryState === 'error'")
            assert 'Registry unavailable' in page.locator('#modsBrowse').inner_text()
            print('PASS no mods, startup, Mods screen, offline registry', flush=True)

            def import_mod(manifest):
                page.locator('#importLocalMod').set_input_files({'name': 'local.json', 'mimeType': 'application/json', 'buffer': json.dumps(manifest).encode()})

            import_mod(GUY)
            wait_expression('window.guyFightsMods.snapshot().installed.length === 1')
            assert snapshot()['guys']['drunk-guy']['hp'] == 1000
            card = page.locator('#modsInstalled article').filter(has_text=GUY['name'])
            card.get_by_role('button', name='Enable', exact=True).click()
            assert snapshot()['guys']['drunk-guy']['hp'] == 1200
            assert snapshot()['guys']['drunk-guy']['projectileSpeed'] == 900
            card.get_by_role('button', name='Disable', exact=True).click()
            assert snapshot()['guys']['drunk-guy']['hp'] == 1000
            card.get_by_role('button', name='Enable', exact=True).click()
            assert snapshot()['guys']['drunk-guy']['hp'] == 1200
            print('PASS local installation starts disabled, enable/disable/re-enable', flush=True)

            bad = copy.deepcopy(GUY)
            bad['id'] = 'invalid-id-test'
            bad['changes']['guys']['modify'][0]['id'] = 'test-guy'
            import_mod(bad)
            wait_expression("document.getElementById('modsStatus').textContent.includes('Invalid manifest')")
            assert len(snapshot()['installed']) == 1
            page.locator('#importLocalMod').set_input_files({'name': 'bad.json', 'mimeType': 'application/json', 'buffer': b'{bad json'})
            wait_expression("document.getElementById('modsStatus').textContent.includes('Invalid manifest')")
            assert snapshot()['guys']['drunk-guy']['hp'] == 1200

            import_mod(MATCH)
            wait_expression('window.guyFightsMods.snapshot().installed.length === 2')
            match_card = page.locator('#modsInstalled article').filter(has_text=MATCH['name'])
            match_card.get_by_role('button', name='Enable', exact=True).click()
            assert page.locator('#timerDuration').input_value() == '180.5'
            assert len(snapshot()['enabled']) == 2
            page.locator('#closeMods').click()
            page.reload(wait_until='load', timeout=60000)
            wait_expression('window.guyFightsMods && !window.guyGameBoot.active', timeout=40000)
            assert snapshot()['guys']['drunk-guy']['hp'] == 1200
            assert page.locator('#timerDuration').input_value() == '180.5'
            print('PASS rejected invalid/malformed mods, multiple enabled mods, reload persistence', flush=True)

            page.locator('#titlePlay').click()
            page.locator('#settingsBtn').click()
            # Timer defaults do not force-enable the existing timer.
            assert not page.locator('#timerEnabled').is_checked()
            page.locator('#timerEnabled').check()
            page.locator('#timerDuration').fill('90')
            page.locator('#timerDuration').dispatch_event('change')
            # Go back to main menu via normal controls.
            page.locator('#closeSettings').click()
            page.locator('#backToTitle').click()
            page.locator('#titleMods').click()
            match_card = page.locator('#modsInstalled article').filter(has_text=MATCH['name'])
            match_card.get_by_role('button', name='Disable', exact=True).click()
            match_card.get_by_role('button', name='Enable', exact=True).click()
            assert page.locator('#timerDuration').input_value() == '90'
            page.locator('#closeMods').click()
            page.reload(wait_until='load', timeout=60000)
            wait_expression('window.guyFightsMods && !window.guyGameBoot.active', timeout=40000)
            assert page.locator('#timerDuration').input_value() == '90'
            page.locator('#titlePlay').click()
            page.locator('#settingsBtn').click()
            page.locator('#defaultTimer').click()
            assert page.locator('#timerDuration').input_value() == '180.5'
            # Create existing mud terrain and apply a safe per-type overlay.
            page.locator('#closeSettings').click()
            page.locator('#backToTitle').click()
            page.locator('#titleMods').click()
            zone = copy.deepcopy(GUY)
            zone.update(id='local-zone', name='Local mud', changes={'zones': {'modify': [{'id': 'mud', 'set': {'strength': 2, 'color': '#123456', 'blocksProjectiles': True, 'opacity': 0.5}}]}})
            import_mod(zone)
            wait_expression('window.guyFightsMods.snapshot().installed.length === 3')
            page.locator('#modsInstalled article').filter(has_text='Local mud').get_by_role('button', name='Enable', exact=True).click()
            page.locator('#closeMods').click()
            page.locator('#titlePlay').click()
            page.locator('#settingsBtn').click()
            # Editor tab visibility is separate from gameplay; use normal tab button.
            terrain_panel = page.locator('#terrainPreset')
            if not terrain_panel.is_visible():
                for button in page.locator('#settingsDialog [role=tab]').all():
                    button.click()
                    if terrain_panel.is_visible():
                        break
            page.locator('#newTerrainType').select_option('mud')
            page.locator('#addTerrainZone').click()
            assert snapshot()['zones'][0]['strength'] == 2
            assert snapshot()['zones'][0]['blocksProjectiles'] is True
            assert page.locator('#terrainStrength').input_value() == '1'
            page.locator('#closeSettings').click()
            print('PASS editable defaults, player choice persistence/reset, non-destructive zone overlay', flush=True)

            # Confirm gameplay actually advances and remains functional after rejection.
            page.locator('#leftSelect').select_option('Drunk Guy')
            page.locator('#rightSelect').select_option('Angry Guy')
            page.locator('#startBtn').click()
            position = page.locator('#guy1').get_attribute('style')
            page.wait_for_timeout(350)
            assert page.locator('#guy1').get_attribute('style') != position, (position, page.locator('#startBtn').inner_text(), page.locator('#leftSelect').input_value(), errors)
            page.evaluate("window.guyFightsMods.disable('example-mod')")
            assert snapshot()['pending'] is True
            assert snapshot()['guys']['drunk-guy']['hp'] == 1200
            page.locator('#resetBtn').evaluate('(button) => button.click()')
            page.locator('#backToTitle').click()
            assert snapshot()['pending'] is False
            assert snapshot()['guys']['drunk-guy']['hp'] == 1000
            print('PASS actual moving fighters, rejected-mod recovery, active-match changes deferred to menu', flush=True)

            # Remote browser renders inert text, detects updates, and refuses metadata mismatch.
            page.locator('#titleMods').click()
            mode['value'] = 'malformed'
            page.locator('#refreshMods').click()
            wait_expression("document.getElementById('modsBrowse').textContent.includes('Invalid registry')")
            mode['value'] = 'online'
            mode['manifest']['version'] = '2.1.0'
            page.locator('#refreshMods').click()
            wait_expression("document.getElementById('modsBrowse').textContent.includes('Update available')")
            page.locator('#modsBrowse').get_by_role('button', name='Update', exact=True).click()
            page.locator('#modsInstalled article').filter(has_text='v2.1.0').wait_for()
            mode['value'] = 'mismatch'
            mode['manifest']['version'] = '2.2.0'
            page.locator('#refreshMods').click()
            wait_expression("document.getElementById('modsBrowse').textContent.includes('Update available')")
            page.locator('#modsBrowse').get_by_role('button', name='Update', exact=True).click()
            wait_expression("document.getElementById('modsStatus').textContent.includes('Invalid manifest')")
            assert snapshot()['installed'][0]['version'] == '2.1.0'
            mode['value'] = 'online'
            mode['manifest']['name'] = '<img src=x onerror=alert(1)>'
            page.locator('#refreshMods').click()
            wait_expression("document.getElementById('modsBrowse').textContent.includes('<img src=x')")
            assert page.locator('#modsBrowse img').count() == 0
            print('PASS invalid registry, remote update, catalog mismatch, inert remote text', flush=True)

            while page.locator('#modsInstalled article').count():
                page.locator('#modsInstalled article').first.get_by_role('button', name='Uninstall', exact=True).click()
            assert not snapshot()['installed']
            assert snapshot()['defaults']['roundDuration'] == 60
            assert snapshot()['guys']['drunk-guy']['hp'] == 1000
            assert not errors, errors
            page.locator('#closeMods').click()
            page.locator('#titlePlay').click()
            page.locator('#startBtn').click()
            before = page.locator('#guy1').get_attribute('style')
            page.wait_for_timeout(350)
            assert page.locator('#guy1').get_attribute('style') != before
            assert not errors, errors
            print('PASS uninstall restores base; no uncaught browser errors', flush=True)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    run()
