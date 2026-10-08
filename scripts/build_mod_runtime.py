"""Rebuild standalone 0.2.5 from preserved 0.2.2 and reviewed local runtime sources."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'src/guy_fights_0.2.2.html'
OUTPUT = ROOT / 'src/guy_fights_0.2.5.html'


def build():
    source = BASE.read_text()

    def replace(old, new, count=1):
        nonlocal source
        found = source.count(old)
        if found != count:
            raise ValueError(f'Expected {count} integration anchors, found {found}: {old[:90]}')
        source = source.replace(old, new)

    runtime = ROOT / 'src/mod-runtime'
    schemas = '\n'.join('const ' + variable + ' = ' + json.dumps(json.loads((runtime / file).read_text()), separators=(',', ':')) + ';'
                        for variable, file in [('MOD_MANIFEST_SCHEMA', 'mod.schema.json'), ('MOD_CATALOG_SCHEMA', 'catalog.schema.json')])
    code = schemas + '\n' + '\n'.join((runtime / name).read_text() for name in ['manager.js', 'adapter.js', 'browser.js', 'integration.js'])
    # Keep code in the original trusted gameSource payload, preserving its boot mechanism.
    replace('<script id="gameSource" type="text/plain">\n(() => {', '<script id="gameSource" type="text/plain">\n(() => {\n' + code)
    replace("const GAME_VERSION = '0.2.2';", "const GAME_VERSION = '0.2.5';")
    replace('<title>Guy Fights — Beta (0.2.2)</title>', '<title>Guy Fights — Beta (0.2.5)</title>')
    replace('>Beta (0.2.2)</span>', '>Beta (0.2.5)</span>')
    replace('version:GAME_VERSION,build:104', 'version:GAME_VERSION,build:107')
    replace('</style>', '#modsDialog .mod-card{margin:12px 0;padding:14px;border:2px solid var(--theme-divider,#b9cbd6);border-radius:6px;background:var(--theme-panel,#fff);overflow-wrap:anywhere}\n#modsDialog .mod-card button{margin:4px 8px 4px 0}\n#modsDialog section{margin-block:18px}\n#modsDialog [role="status"]{overflow-wrap:anywhere}\n</style>')
    replace('<button id="titleSettings">Settings</button>', '<button id="titleSettings">Settings</button>\n      <button id="titleMods">MODS</button>')
    dialog = '''<dialog id="modsDialog" class="settings-dialog info-dialog" aria-labelledby="modsHeading">
  <div class="settings-dialog-header"><h2 id="modsHeading">MODS</h2><button id="closeMods">Close</button></div>
  <p id="modsPending" class="setting-help"></p>
  <p id="modsNotice" role="status"></p><p id="modsStatus" role="status" aria-live="polite"></p>
  <section aria-labelledby="modsBrowseHeading"><h3 id="modsBrowseHeading">Browse</h3><button id="refreshMods">Refresh registry</button><div id="modsBrowse" aria-live="polite"></div></section>
  <section aria-labelledby="modsInstalledHeading"><h3 id="modsInstalledHeading">Installed</h3><div id="modsInstalled"></div></section>
  <details><summary>Local / development JSON import</summary><p>Import a Mod API v1 JSON manifest. Uses the same validation as remote installation; installed mods start disabled.</p><label for="importLocalMod">Choose manifest</label><input id="importLocalMod" type="file" accept=".json,application/json"></details>
</dialog>
'''
    replace('<dialog id="changelogDialog"', dialog + '<dialog id="changelogDialog"')
    replace('<h2 id="changelogHeading">Changelog</h2><button id="closeChangelog">Close</button></div>', '<h2 id="changelogHeading">Changelog</h2><button id="closeChangelog">Close</button></div>\n  <article class="menu-card"><h3>0.2.5 — Network compatibility hotfix</h3><ul><li>Follow hosting redirects and validate final same-origin registry and manifest URLs.</li><li>Added developer-only network diagnostics; installed mods remain available offline.</li></ul></article>\n  <article class="menu-card"><h3>0.2.4 — Mod Browser hotfix</h3><ul><li>Fetch registry JSON from the same-origin /mods/ mirror for hosting CSP compatibility.</li><li>Strict HTTPS manifest validation and offline installed mods remain supported.</li></ul></article>\n  <article class="menu-card"><h3>0.2.3 — Mod Runtime v1</h3><ul><li>Added a JSON-only Mods browser, local installation, enabled order, and offline installed mods.</li><li>Fresh game definitions prevent stacked changes; unsupported operations are rejected.</li><li>Guy stats, selected terrain and bottle projectile properties, and editable round-duration defaults are supported.</li></ul></article>')
    # Timing accepts schema-valid fractional defaults without rounding on load or edit.
    replace('return Math.round(Math.max(Number(input.min), Math.min(Number(input.max), value)));', 'const bounded = Math.max(Number(input.min), Math.min(Number(input.max), value));\n      return key === "duration" ? bounded : Math.round(bounded);')
    replace('timerSettings.duration=Math.round(savedNumber(timer.duration,Number(timerDuration.min),Number(timerDuration.max),60));', 'timerSettings.duration=savedNumber(timer.duration,Number(timerDuration.min),Number(timerDuration.max),60);')
    replace('await restoreAutosave();\n    boot?.update', 'await restoreAutosave();\n    initializeRegistryMods();\n    boot?.update')
    replace('if(window.guyGameBoot?.active||titleActive||musicChoiceDialog.open)return;', 'if(window.guyGameBoot?.active||titleActive||musicChoiceDialog.open)return;\n    if (!battleActive && registryManager?.pending) registryManager.rebuild();')
    replace('if(show&&battleActive)return;', 'if(show&&battleActive)return;\n    if (show && registryManager?.pending) registryManager.rebuild();')
    # Legacy .pak autosave must export clean user definitions, never registry overlays.
    replace('Object.entries(CHARACTERS).filter(([name,c])=>c.modded||builtinOriginals.has(name)&&c!==builtinOriginals.get(name)).map(([name,c])=>({name,modded:!!c.modded,files:buildGuyPackage(name).files}))', 'Object.entries(CHARACTERS).map(([name,c])=>[name,registryBaseCharacter(name,c)]).filter(([name,c])=>c.modded||builtinOriginals.has(name)&&c!==builtinOriginals.get(name)).map(([name,c])=>({name,modded:!!c.modded,files:registryBasePackage(name).files}))')
    replace("if(battleActive)throw new Error('Import or edit Guys before the fight.');", "if(battleActive)throw new Error('Import or edit Guys before the fight.');\n    if (replace && registryManager?.enabled.some(id => registryManager.installed.get(id)?.changes.guys?.modify.some(op => registryAdapter.GUY_NAMES[op.id] === name) || registryManager.installed.get(id)?.changes.projectiles?.modify.some(op => registryAdapter.GUY_NAMES[registryAdapter.PROJECTILE_IDS[op.id]] === name))) throw new Error('Disable registry mods affecting this Guy before editing it.');")
    replace('stopCustomRuntime(name);CHARACTERS[name]=c;removedGuyNames.delete(name);', 'stopCustomRuntime(name);CHARACTERS[name]=c;removedGuyNames.delete(name);registryAdapter?.remember(name,c);', count=2)
    replace('if(battleActive||!testGuysEnabled)return;\n    for(const [name,c] of builtinOriginals)', "if(battleActive||!testGuysEnabled)return;\n    if (registryManager?.enabled.length) { guypediaExportStatus.textContent='Disable registry mods before restoring built-in Guys.'; return; }\n    for(const [name,c] of builtinOriginals)")
    # Only the primary bottle adapter can set registryDamage. Player damage overrides win.
    replace('damage: shotOverride ? config.damage : isAngryGuy(owner) ? angryShotDamage(owner) : owner.damage,', 'damage: shotOverride ? config.damage : owner.damageOverride !== null && owner.damageOverride !== undefined ? owner.damage : config.registryDamage ?? (isAngryGuy(owner) ? angryShotDamage(owner) : owner.damage),')
    # Read-only terrain overlays leave user-authored placement and saved layout intact.
    replace('for(const z of terrainZones){\n      if(z.type!==\'shield\')continue;', "for(const z of registryZones()){\n      if(!z.blocksProjectiles)continue;")
    replace('for(const z of terrainZones)if(zoneContains(z,s))', 'for(const z of registryZones())if(zoneContains(z,s))', count=2)
    replace('const zones=terrainZones.filter(z=>zoneContains(z,s))', 'const zones=registryZones().filter(z=>zoneContains(z,s))')
    replace('terrainZones.forEach((z,i)=>{const b={x:z.x*w/100', 'registryZones().forEach((z,i)=>{const b={x:z.x*w/100')
    replace("ctx.globalAlpha=z.type==='wall'?1:.75;", "ctx.globalAlpha=z.opacity ?? (z.type==='wall'?1:.75);")
    replace('JSON.stringify(terrainZones);\n    if(animated', 'JSON.stringify(registryZones());\n    if(animated')
    # Omit whitespace-only inherited lines in the new file; leave BASE untouched.
    source = re.sub(r"^[ \t]+$", "", source, flags=re.MULTILINE)
    OUTPUT.write_text(source)
    print('Built', OUTPUT.relative_to(ROOT), 'from original SHA-256', hashlib.sha256(BASE.read_bytes()).hexdigest())


if __name__ == '__main__':
    build()
