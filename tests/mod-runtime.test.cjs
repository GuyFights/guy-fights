const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
globalThis.location = {origin: 'https://guyfights.neocities.org'};
const API = require('../src/mod-runtime/manager.js');
const createAdapter = require('../src/mod-runtime/adapter.js');
const root = path.join(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'src/mod-runtime/mod.schema.json')));
const catalogSchema = JSON.parse(fs.readFileSync(path.join(root, 'src/mod-runtime/catalog.schema.json')));
const example = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/drunk-guy.json')));
const clone = data => JSON.parse(JSON.stringify(data));
function manifest(id, changes) { return {...clone(example), id, changes}; }
function create(options = {}) {
  const storage = options.storage || {data: new Map(), getItem(k) {return this.data.get(k) || null;}, setItem(k, v) {this.data.set(k, v);}};
  const characters = {'Drunk Guy': {hp: 1000, defaultAttack: {damage: 112}, projectile: {interval: 2, speed: 840, size: 60, initialCooldown: 2, image: 'built-in'}, speed: {min: 217.5, max: 285}, behaviors: {attack: {kind: 'builtin', config: {interval: 2, speed: 840, size: 60}}}}};
  let active = false, duration = 60, player = null;
  const adapter = createAdapter({characters, terrainTypes: {mud: {}, shield: {}}, cloneCharacter: clone,
    active: () => active, applyDefaults: value => {duration = player ?? value.roundDuration;}, refresh() {}}, API);
  const manager = new API.Manager({manifestSchema: schema, catalogSchema, adapter, storage, gameVersion: '0.2.3', logger: {warn() {}}, ...options});
  manager.load();manager.rebuild();
  return {manager, storage, adapter, characters, duration: () => duration, active: value => {active = value;}, player: value => {player = value;}};
}
function entry(mod, location = 'mods/' + mod.id + '/mod.json') {const {formatVersion, changes, ...metadata} = mod; return {...metadata, manifest: location};}
function response(data, url) {const bytes = new TextEncoder().encode(JSON.stringify(data)); return {ok: true, url, headers: {get() {return null;}}, arrayBuffer: async () => bytes.buffer};}

test('no mods: base definitions and timer are unchanged', () => {
  const game = create(); assert.equal(game.characters['Drunk Guy'].hp, 1000); assert.equal(game.duration(), 60); assert.deepEqual(game.manager.enabled, []);
});
test('real Guy example applies once, disables to base, and never stacks across rebuilds', () => {
  const game = create(); const {manager} = game;
  manager.install(example); assert.equal(game.characters['Drunk Guy'].hp, 1000); assert.equal(manager.status(example), 'Disabled');
  manager.setEnabled(example.id, true);
  for (let i = 0; i < 4; i++) manager.rebuild();
  const c = game.characters['Drunk Guy']; assert.equal(c.hp, 1200); assert.equal(c.defaultAttack.damage, 130); assert.equal(c.projectile.speed, 900); assert.equal(c.projectile.interval, 1.8); assert.equal(c.behaviors.attack.config.interval, 1.8);
  manager.setEnabled(example.id, false); assert.equal(game.characters['Drunk Guy'].hp, 1000); assert.equal(game.characters['Drunk Guy'].projectile.speed, 840);
  manager.setEnabled(example.id, true); assert.equal(game.characters['Drunk Guy'].hp, 1200);
});
test('valid fractional match defaults remain editable and revert cleanly', () => {
  const game = create(); const mod = manifest('match-test', {matchSettings: {roundDuration: 180.5}});
  game.manager.install(mod); game.manager.setEnabled(mod.id, true); assert.equal(game.duration(), 180.5);
  game.player(90); game.manager.rebuild(); assert.equal(game.duration(), 90);
  game.player(null); game.manager.rebuild(); assert.equal(game.duration(), 180.5);
  game.manager.setEnabled(mod.id, false); assert.equal(game.duration(), 60);
});
test('unsupported supplied match example is rejected atomically', () => {
  const game = create(); const unsupported = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/unsupported-match-example.json')));
  assert.throws(() => game.manager.install(unsupported), /No safe match-setting/); assert.equal(game.manager.installed.size, 0); assert.equal(game.duration(), 60);
});
test('schema and runtime reject invalid IDs, unknown operations, unsafe fields, limits and malformed data', () => {
  const game = create(); const edits = [
    {guys: {modify: [{id: 'unknown-guy', set: {hp: 100}}]}},
    {guys: {modify: [{id: 'test-guy', set: {hp: 100}}]}},
    {zones: {modify: [{id: 'unknown-zone', set: {color: '#123456'}}]}},
    {projectiles: {modify: [{id: 'unknown-projectile', set: {speed: 100}}]}},
    {projectiles: {modify: [{id: 'drunk-bottle', set: {bounceCount: 2}}]}},
    {guys: {modify: [{id: 'drunk-guy', set: {hp: 1000001}}]}},
    {guys: {modify: [{id: 'drunk-guy', set: {projectileCount: 1.5}}]}},
    {guys: {modify: [{id: 'drunk-guy', set: {hp: true}}]}},
    {guys: {modify: [{id: 'drunk-guy', set: {width: 100}}]}},
    {guys: {modify: [{id: 'drunk-guy', set: {movementSpeedMin: 300}}]}},
    {zones: {modify: [{id: 'mud', set: {strength: 50}}]}},
    {guys: {remove: ['drunk-guy']}}, {scripts: ['https://example.test/script.js']}
  ];
  for (const change of edits) assert.throws(() => game.manager.install(manifest('bad', change)));
  for (const input of ['{', '{"x":1,"x":2}', '{"x":NaN}', '{"x":Infinity}', '{"x":1e999}', '{"a":{"__proto__":{}}}', '{"constructor":{}}', '{"prototype":{}}']) assert.throws(() => API.parse(input));
  assert.throws(() => game.manager.install({}));
  assert.equal(game.characters['Drunk Guy'].hp, 1000); assert.equal(game.manager.installed.size, 0);
});
test('compatibility preserves 0.2.x and excludes incompatible releases/inverted ranges', () => {
  assert.equal(API.compatibility(example.compatibility, '0.2.3'), true); assert.equal(API.compatibility(example.compatibility, '0.2.10'), true);
  assert.equal(API.compatibility(example.compatibility, '0.2.1'), false); assert.equal(API.compatibility(example.compatibility, '0.3.0'), false);
  assert.throws(() => API.compatibility({minimum: '0.3.0', maximum: '0.2.x'}, '0.2.3'));
  const mod = clone(example); mod.compatibility.minimum = '0.3.0'; mod.compatibility.maximum = '0.3.x';
  assert.throws(() => create().manager.install(mod), /Incompatible/);
});
test('duplicates and duplicate entity edits are rejected', () => {
  const {manager} = create(); manager.install(example); assert.throws(() => manager.install(example));
  const mod = clone(example); mod.changes.guys.modify.push(clone(mod.changes.guys.modify[0])); assert.throws(() => manager.install(mod), /Duplicate edit/);
  assert.throws(() => API.validateCatalog({formatVersion: 1, mods: [entry(example), entry(example)]}, catalogSchema, '0.2.3'));
});
test('enabled order is deterministic; disabled mod is ignored; uninstall restores base', () => {
  const game = create(); const a = manifest('first', {guys: {modify: [{id: 'drunk-guy', set: {hp: 1100}}]}}), b = manifest('second', {guys: {modify: [{id: 'drunk-guy', set: {hp: 1400}}]}});
  game.manager.install(a); game.manager.install(b); game.manager.setEnabled(a.id, true); assert.equal(game.characters['Drunk Guy'].hp, 1100);
  assert.deepEqual(game.manager.conflicts(b), [a.name]);
  game.manager.setEnabled(b.id, true); assert.equal(game.characters['Drunk Guy'].hp, 1400);
  game.manager.uninstall(b.id); assert.equal(game.characters['Drunk Guy'].hp, 1100);
  game.manager.uninstall(a.id); assert.equal(game.characters['Drunk Guy'].hp, 1000);
});
test('active matches defer changes until a safe rebuild', () => {
  const game = create(); game.manager.install(example); game.active(true); game.manager.setEnabled(example.id, true);
  assert.equal(game.manager.pending, true); assert.equal(game.characters['Drunk Guy'].hp, 1000);
  game.active(false); game.manager.rebuild(); assert.equal(game.characters['Drunk Guy'].hp, 1200); assert.equal(game.manager.pending, false);
});
test('reload retains installed and enabled mods; invalid saved data cannot block base startup', () => {
  const game = create(); game.manager.install(example); game.manager.setEnabled(example.id, true);
  const restored = create({storage: game.storage}); assert.equal(restored.characters['Drunk Guy'].hp, 1200);
  game.storage.setItem(API.STORAGE_KEY, '{'); const corrupt = create({storage: game.storage}); assert.equal(corrupt.characters['Drunk Guy'].hp, 1000); assert.ok(corrupt.manager.notice);
  game.storage.setItem(API.STORAGE_KEY, JSON.stringify({formatVersion: 1, installed: [example, example], enabled: []})); const duplicate = create({storage: game.storage}); assert.equal(duplicate.manager.installed.size, 0);
});
test('one failing enabled mod atomically falls back to base; removing it restores healthy mods', () => {
  const game = create(); const bad = manifest('bad', {matchSettings: {scoreLimit: 5}});
  game.storage.setItem(API.STORAGE_KEY, JSON.stringify({formatVersion: 1, installed: [example, bad], enabled: [example.id, bad.id]}));
  const restored = create({storage: game.storage}); assert.equal(restored.characters['Drunk Guy'].hp, 1000); assert.ok(restored.manager.errors.has('bad'));
  restored.manager.setEnabled('bad', false); assert.equal(restored.characters['Drunk Guy'].hp, 1200);
});
test('safe terrain overrides preserve editor layout and disable cleanly', () => {
  const game = create(); const mod = manifest('zone-test', {zones: {modify: [{id: 'mud', set: {strength: 2, color: '#123456', opacity: 0.5, blocksProjectiles: true}}]}});
  const zones = [{id: 9, type: 'mud', x: 10, y: 20, w: 30, h: 40, strength: 1, color: '#77533a'}];
  game.manager.install(mod); game.manager.setEnabled(mod.id, true);
  const runtime = game.adapter.runtimeZones(zones)[0]; assert.equal(runtime.strength, 2); assert.equal(runtime.blocksProjectiles, true); assert.equal(runtime.opacity, 0.5); assert.equal(zones[0].strength, 1);
  game.manager.setEnabled(mod.id, false); assert.equal(game.adapter.runtimeZones(zones)[0].strength, 1);
});
test('drunk-bottle projectile mapping supports speed, size, damage; Guy launch speed wins across mod order', () => {
  const game = create(); const shot = manifest('bottle-test', {projectiles: {modify: [{id: 'drunk-bottle', set: {speed: 600, size: 40, damage: 80}}]}});
  game.manager.install(shot); game.manager.setEnabled(shot.id, true); assert.equal(game.characters['Drunk Guy'].projectile.speed, 600); assert.equal(game.characters['Drunk Guy'].projectile.registryDamage, 80);
  game.manager.install(example); game.manager.setEnabled(example.id, true); assert.equal(game.characters['Drunk Guy'].projectile.speed, 900);
  game.manager.setEnabled(shot.id, false); game.manager.setEnabled(shot.id, true); assert.equal(game.characters['Drunk Guy'].projectile.speed, 900);
});
test('safe URL policy rejects scripts, unapproved origins, redirects and traversal', () => {
  assert.equal(API.manifestURL('mods/example-mod/mod.json'), 'https://guyfights.neocities.org/mods/example-mod/mod.json');
  for (const url of ['javascript:alert(1)', 'http://raw.githubusercontent.com/mod.json', '//evil.test/mod.json', '../mods/example-mod/mod.json', 'mods/%2e%2e/mod.json', 'https://evil.test/mod.json', 'mods/example-mod/mod.js', 'mods/example-mod/mod.json?x=1', 'https://raw.githubusercontent.com/GuyFights/guy-fights-mods/main/../main/mods/example-mod/mod.json']) assert.throws(() => API.manifestURL(url));
});
test('registry network failure and malformed registry do not affect installed mods', async () => {
  const game = create({fetcher: async () => {throw new Error('offline');}}); game.manager.install(example); game.manager.setEnabled(example.id, true);
  await game.manager.browse(); assert.equal(game.manager.registryState, 'error'); assert.equal(game.manager.registryError.code, 'NETWORK'); assert.equal(game.characters['Drunk Guy'].hp, 1200);
  game.manager.fetcher = async url => response({formatVersion: 99, mods: []}, url); await game.manager.browse(); assert.equal(game.manager.registryError.code, 'INVALID_REGISTRY');
});
test('remote install compares all metadata, remains disabled, and detects/applies a newer update', async () => {
  let remote = clone(example); let catalog = {formatVersion: 1, mods: [entry(remote)]};
  const game = create({fetcher: async url => response(url === API.registryURL() ? catalog : remote, url)});
  await game.manager.browse(); await game.manager.installRemote(catalog.mods[0]); assert.equal(game.manager.enabled.length, 0);
  remote.version = '2.1.0'; catalog = {formatVersion: 1, mods: [entry(remote)]}; await game.manager.browse(); assert.equal(API.compareVersions(catalog.mods[0].version, game.manager.installed.get(remote.id).version), 1);
  await game.manager.installRemote(catalog.mods[0]); assert.equal(game.manager.installed.get(remote.id).version, '2.1.0');
  remote.version = '2.2.0'; catalog = {formatVersion: 1, mods: [entry(remote)]}; remote.name = 'Changed after catalog'; await game.manager.browse();
  await assert.rejects(game.manager.installRemote(catalog.mods[0]), /mismatch/);
  for (const key of ['id', 'apiVersion', 'name', 'author', 'version', 'description', 'compatibility', 'tags']) {
    const wrong = clone(example); wrong[key] = key === 'tags' ? ['bad'] : key === 'compatibility' ? {minimum: '0.2.3', maximum: '0.2.x'} : key === 'apiVersion' ? 2 : 'changed';
    assert.throws(() => API.agree(wrong, entry(example)), /mismatch/);
  }
});
test('storage write failure does not claim installation or break the game', () => {
  const {manager, characters} = create({storage: {getItem() {}, setItem() {throw new Error('denied');}}});
  assert.throws(() => manager.install(example), /Cannot save/); assert.equal(manager.installed.size, 0); assert.equal(characters['Drunk Guy'].hp, 1000);
});

test('production registry and manifests use the HTTPS page origin', () => {
  assert.equal(API.REGISTRY_URL, '/mods/index.json');
  assert.equal(API.registryURL(), 'https://guyfights.neocities.org/mods/index.json');
  for (const path of ['mods/example-mod/mod.json', '/mods/example-mod/mod.json', 'https://guyfights.neocities.org/mods/example-mod/mod.json']) assert.equal(API.manifestURL(path), 'https://guyfights.neocities.org/mods/example-mod/mod.json');
  for (const path of ['https://raw.githubusercontent.com/GuyFights/guy-fights-mods/main/mods/example-mod/mod.json', '/mods/../mods/example-mod/mod.json', '/mods/example-mod/mod.json#x', '/mods/example-mod/mod.json#', '/mods/example-mod/mod.json?', '/mods/example-mod/mod.json?x=1', '/mods/%65xample-mod/mod.json', 'https://user@guyfights.neocities.org/mods/example-mod/mod.json', '/mods/constructor/mod.json']) assert.throws(() => API.manifestURL(path));
  const original = globalThis.location;
  try { globalThis.location = {origin: 'http://guyfights.neocities.org'}; assert.throws(() => API.registryURL()); } finally { globalThis.location = original; }
});
