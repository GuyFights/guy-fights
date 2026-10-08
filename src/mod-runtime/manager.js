/* Mod API v1. Schema snapshots come verbatim from guy-fights-mods, not the network. */
const GuyFightsModRuntime = (() => {
  'use strict';
  const REGISTRY_URL = '/mods/index.json';
  function registryURL() {
    let origin;
    try { origin = new URL(globalThis.location?.origin); } catch (_) { fail('NETWORK', 'Registry requires an HTTPS page origin'); }
    if (origin.protocol !== 'https:' || origin.username || origin.password) fail('NETWORK', 'Registry requires an HTTPS page origin');
    return new URL(REGISTRY_URL, origin.origin).href;
  }
  const STORAGE_KEY = 'guyFights.mods.v1';
  const own = (object, key) => Object.hasOwn(object, key);
  const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
  class ModError extends Error {
    constructor(code, detail) { super(detail); this.code = code; }
  }
  function fail(code, detail) { throw new ModError(code, detail); }
  function inspect(value, depth = 0) {
    if (depth > 16) fail('INVALID_MANIFEST', 'JSON nesting exceeds 16');
    if (typeof value === 'number' && !Number.isFinite(value)) fail('INVALID_MANIFEST', 'Nonfinite number');
    if (value && typeof value === 'object') {
      if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail('INVALID_MANIFEST', 'Not a plain JSON object');
      for (const [key, item] of Object.entries(value)) {
        if (forbidden.has(key)) fail('INVALID_MANIFEST', 'Forbidden key: ' + key);
        inspect(item, depth + 1);
      }
    } else if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) fail('INVALID_MANIFEST', 'Not JSON data');
  }
  // Small strict JSON parser: preserves duplicate-key evidence that JSON.parse discards.
  function parse(text, limit = 262144) {
    if (new TextEncoder().encode(text).length > limit) fail('INVALID_MANIFEST', 'JSON exceeds size limit');
    let i = 0;
    const whitespace = () => { while (/\s/.test(text[i] || '') && i < text.length) { if (!/[ \t\r\n]/.test(text[i])) fail('INVALID_MANIFEST', 'Invalid whitespace'); i++; } };
    function string() {
      const start = i++;
      while (i < text.length) {
        const char = text[i++];
        if (char === '"') { try { return JSON.parse(text.slice(start, i)); } catch (_) { break; } }
        if (char === '\\') i++;
      }
      fail('INVALID_MANIFEST', 'Invalid JSON string');
    }
    function value(depth = 0) {
      if (depth > 16) fail('INVALID_MANIFEST', 'JSON nesting exceeds 16');
      whitespace();
      if (text[i] === '"') return string();
      if (text[i] === '{') {
        i++; whitespace(); const result = {};
        if (text[i] === '}') { i++; return result; }
        while (true) {
          whitespace(); if (text[i] !== '"') fail('INVALID_MANIFEST', 'Expected object key');
          const key = string();
          if (forbidden.has(key) || own(result, key)) fail('INVALID_MANIFEST', 'Unsafe or duplicate key: ' + key);
          whitespace(); if (text[i++] !== ':') fail('INVALID_MANIFEST', 'Expected colon');
          result[key] = value(depth + 1); whitespace();
          const next = text[i++]; if (next === '}') return result;
          if (next !== ',') fail('INVALID_MANIFEST', 'Expected comma');
        }
      }
      if (text[i] === '[') {
        i++; whitespace(); const result = [];
        if (text[i] === ']') { i++; return result; }
        while (true) {
          result.push(value(depth + 1)); whitespace();
          const next = text[i++]; if (next === ']') return result;
          if (next !== ',') fail('INVALID_MANIFEST', 'Expected comma');
        }
      }
      for (const [token, result] of [['true', true], ['false', false], ['null', null]]) {
        if (text.startsWith(token, i)) { i += token.length; return result; }
      }
      const number = text.slice(i).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
      if (!number) fail('INVALID_MANIFEST', 'Invalid JSON value');
      i += number[0].length; const result = Number(number[0]);
      if (!Number.isFinite(result)) fail('INVALID_MANIFEST', 'Nonfinite number');
      return result;
    }
    const result = value(); whitespace();
    if (i !== text.length) fail('INVALID_MANIFEST', 'Trailing JSON input');
    inspect(result); return result;
  }
  function equal(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => own(b, key) && equal(a[key], b[key]));
  }
  // Evaluates only the keywords present in the pinned schemas; fails closed on additions.
  function schemaValidate(data, schema, root = schema, path = '$') {
    const supported = new Set(['$schema', 'title', 'description', '$defs', '$ref', 'type', 'const', 'enum', 'not', 'additionalProperties', 'properties', 'required', 'minProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern']);
    for (const key of Object.keys(schema)) if (!supported.has(key)) fail('INVALID_MANIFEST', 'Unsupported schema keyword ' + key);
    const error = detail => fail('INVALID_MANIFEST', path + ': ' + detail);
    if (schema.$ref) {
      if (!schema.$ref.startsWith('#/$defs/')) error('Unsupported schema reference');
      const definition = root.$defs[schema.$ref.slice(8)];
      if (!definition) error('Missing schema reference');
      schemaValidate(data, definition, root, path);
    }
    if (schema.not?.enum && schema.not.enum.some(item => equal(item, data))) error('Forbidden value');
    if (own(schema, 'const') && !equal(data, schema.const)) error('Unsupported version');
    if (schema.enum && !schema.enum.some(item => equal(item, data))) error('Unknown ID or value');
    if (schema.type) {
      const valid = {object: data !== null && typeof data === 'object' && !Array.isArray(data), array: Array.isArray(data), string: typeof data === 'string', number: typeof data === 'number' && Number.isFinite(data), integer: Number.isSafeInteger(data), boolean: typeof data === 'boolean'};
      if (!valid[schema.type]) error('Wrong type');
    }
    if (typeof data === 'number') {
      if (data < (schema.minimum ?? -Infinity) || data > (schema.maximum ?? Infinity)) error('Numeric limit exceeded');
    }
    if (typeof data === 'string') {
      const length = [...data].length;
      if (length < (schema.minLength ?? 0) || length > (schema.maxLength ?? Infinity)) error('String length limit');
      if (schema.pattern && !new RegExp(schema.pattern).test(data)) error('Invalid string');
    }
    if (Array.isArray(data)) {
      if (data.length < (schema.minItems ?? 0) || data.length > (schema.maxItems ?? Infinity)) error('Array size limit');
      if (schema.uniqueItems && data.some((item, index) => data.slice(0, index).some(previous => equal(previous, item)))) error('Duplicate array item');
      if (schema.items) data.forEach((item, index) => schemaValidate(item, schema.items, root, path + '[' + index + ']'));
    } else if (data && typeof data === 'object') {
      if (Object.keys(data).length < (schema.minProperties ?? 0)) error('Empty operation');
      for (const key of schema.required || []) if (!own(data, key)) error('Missing ' + key);
      for (const [key, item] of Object.entries(data)) {
        if (own(schema.properties || {}, key)) schemaValidate(item, schema.properties[key], root, path + '.' + key);
        else if (schema.additionalProperties === false) error('Unknown property ' + key);
      }
    }
  }
  function versionParts(text) {
    if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(text)) fail('INVALID_MANIFEST', 'Invalid version');
    // BigInt avoids unsafe-integer rounding of untrusted version components.
    return text.split('.').map(BigInt);
  }
  function compareVersions(a, b) {
    const left = versionParts(a), right = versionParts(b);
    for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
    return 0;
  }
  function compatibility(range, version) {
    const low = versionParts(range.minimum), current = versionParts(version);
    const wildcard = range.maximum.endsWith('.x');
    const high = versionParts(wildcard ? range.maximum.slice(0, -1) + '0' : range.maximum);
    if (wildcard ? low[0] > high[0] || low[0] === high[0] && low[1] > high[1] : compareVersions(range.minimum, range.maximum) > 0) fail('INVALID_MANIFEST', 'Inverted compatibility range');
    const underHigh = wildcard ? current[0] < high[0] || current[0] === high[0] && current[1] <= high[1] : compareVersions(version, range.maximum) <= 0;
    return compareVersions(version, range.minimum) >= 0 && underHigh;
  }
  function manifestURL(reference) {
    if (typeof reference !== 'string' || reference.includes('?') || reference.includes('#') || /[%\\\s]/.test(reference)) fail('INVALID_REGISTRY', 'Unsafe manifest path');
    const relative = !reference.startsWith('https://');
    if (relative && (reference.startsWith('//') || reference.includes(':'))) fail('INVALID_REGISTRY', 'Manifest must be registry-relative or HTTPS');
    const rawPath = relative ? reference : reference.slice(reference.indexOf('/', 8));
    if (rawPath.split('/').some(part => part === '.' || part === '..')) fail('INVALID_REGISTRY', 'Traversal is forbidden');
    let url; try { url = new URL(reference, new URL('/', registryURL())); } catch (_) { fail('INVALID_REGISTRY', 'Invalid manifest URL'); }
    const origin = new URL(registryURL()).origin;
    const match = /^\/mods\/([a-z0-9]+(?:-[a-z0-9]+)*)\/mod\.json$/.exec(url.pathname);
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || url.search || url.hash || !match || match[1].length > 64 || ['prototype', 'constructor'].includes(match[1])) fail('INVALID_REGISTRY', 'Unapproved manifest URL');
    return url.href;
  }
  function validateManifest(manifest, schema, gameVersion, checkCompatibility = true) {
    inspect(manifest); schemaValidate(manifest, schema);
    const works = compatibility(manifest.compatibility, gameVersion);
    if (checkCompatibility && !works) fail('INCOMPATIBLE', 'Incompatible game version');
    for (const category of ['guys', 'zones', 'projectiles']) {
      const ids = new Set();
      for (const operation of manifest.changes[category]?.modify || []) {
        if (ids.has(operation.id)) fail('INVALID_MANIFEST', 'Duplicate edit ' + category + '/' + operation.id);
        ids.add(operation.id);
      }
    }
    return works;
  }
  function validateCatalog(catalog, schema, gameVersion) {
    try {
      inspect(catalog); schemaValidate(catalog, schema);
      const ids = new Set();
      for (const entry of catalog.mods) {
        if (ids.has(entry.id)) fail('INVALID_REGISTRY', 'Duplicate catalog ID');
        ids.add(entry.id); compatibility(entry.compatibility, gameVersion); manifestURL(entry.manifest);
      }
    } catch (error) { throw new ModError('INVALID_REGISTRY', error.message); }
    return catalog;
  }
  function agree(manifest, entry, formatVersion = 1) {
    for (const key of ['id', 'apiVersion', 'name', 'author', 'version', 'description', 'compatibility', 'tags']) {
      if (!equal(manifest[key], entry[key])) fail('INVALID_MANIFEST', 'Catalog/manifest mismatch: ' + key);
    }
    if (manifest.formatVersion !== formatVersion) fail('INVALID_MANIFEST', 'Format mismatch');
  }
  function validateResponseURL(requested, finalURL) {
    if (typeof finalURL !== 'string' || !finalURL.startsWith('https://') || /[%\\\s]/.test(finalURL) || finalURL.includes('?') || finalURL.includes('#')) fail('NETWORK', 'Unsafe response URL');
    const rawPath = finalURL.slice(finalURL.indexOf('/', 8));
    if (rawPath.split('/').some(part => part === '.' || part === '..')) fail('NETWORK', 'Response traversal is forbidden');
    const parsed = new URL(finalURL);
    if (parsed.username || parsed.password || parsed.origin !== new URL(registryURL()).origin || parsed.search || parsed.hash) fail('NETWORK', 'Unapproved response origin');
    if (requested === registryURL()) {
      if (parsed.pathname !== '/mods/index.json') fail('NETWORK', 'Unapproved registry response path');
    } else if (manifestURL(finalURL) !== requested) fail('NETWORK', 'Unapproved manifest response path');
    return finalURL;
  }
  async function fetchJSON(url, limit, fetcher) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 10000);
    let response;
    try {
      response = await fetcher(url, {signal: abort.signal, redirect: 'follow', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache'});
      validateResponseURL(url, response.url);
      if (!response.ok) fail('NETWORK', 'Registry request failed');
      if (Number(response.headers?.get('content-length')) > limit) fail('INVALID_MANIFEST', 'Response too large');
      let bytes;
      if (response.body?.getReader) {
        const reader = response.body.getReader(), chunks = []; let count = 0;
        try {
          while (true) {
            const {done, value} = await reader.read(); if (done) break;
            count += value.byteLength;
            if (count > limit) fail('INVALID_MANIFEST', 'Response too large');
            chunks.push(value);
          }
        } finally { await reader.cancel().catch(() => {}); }
        bytes = new Uint8Array(count); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      } else {
        bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > limit) fail('INVALID_MANIFEST', 'Response too large');
      }
      let text;
      try { text = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
      catch (_) { fail('INVALID_MANIFEST', 'Response is not valid UTF-8'); }
      return parse(text, limit);
    } catch (error) {
      const failure = error.code ? error : new ModError('NETWORK', 'Registry request failed');
      failure.network = {requestedURL: url, finalResponseURL: response?.url ?? null, httpStatus: response?.status ?? null, exceptionName: error.name, exceptionMessage: error.message};
      throw failure;
    } finally { clearTimeout(timeout); }
  }
  function message(error) {
    const messages = {NETWORK: 'Registry unavailable. Installed mods still work offline.', INVALID_REGISTRY: 'Invalid registry. No remote mods were loaded.', INVALID_MANIFEST: 'Invalid manifest. This mod was rejected.', INCOMPATIBLE: 'Incompatible with this game version.', UNSUPPORTED: 'Mod application error: an operation is not supported by this build.', APPLICATION: 'Mod application error. Game data was left unchanged.', STORAGE: 'Browser storage unavailable or full. Changes were not saved.'};
    return messages[error.code] || 'Mod application error. Please try again.';
  }
  class Manager {
    constructor({manifestSchema, catalogSchema, adapter, storage, fetcher = globalThis.fetch, gameVersion = '0.2.5', logger = console}) {
      this.manifestSchema = manifestSchema; this.catalogSchema = catalogSchema;
      this.adapter = adapter; this.storage = storage; this.fetcher = fetcher; this.gameVersion = gameVersion; this.logger = logger;
      this.installed = new Map(); this.enabled = []; this.errors = new Map(); this.catalog = null; this.registryState = 'idle'; this.registryError = null;
      this.listeners = new Set(); this.pending = false; this.notice = ''; this.loading = null;
    }
    onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    notify() { for (const listener of this.listeners) { try { listener(); } catch (error) { this.logger.warn('[Mods] UI failure', error); } } }
    log(context, error) { this.logger.warn('[Mods] ' + context, {code: error.code, detail: error.message, ...(error.network || {})}); }
    validate(manifest, checkCompatibility = true) { return validateManifest(manifest, this.manifestSchema, this.gameVersion, checkCompatibility); }
    record(installed = this.installed, enabled = this.enabled) { return {formatVersion: 1, installed: [...installed.values()], enabled}; }
    persist(installed, enabled) {
      const text = JSON.stringify(this.record(installed, enabled));
      if (new TextEncoder().encode(text).length > 4194304) fail('STORAGE', 'Mod storage exceeds 4 MiB');
      try { if (!this.storage) throw new Error('Storage unavailable'); this.storage.setItem(STORAGE_KEY, text); }
      catch (error) { this.log('persist', error); fail('STORAGE', 'Cannot save mod storage'); }
    }
    load() {
      try {
        const text = this.storage?.getItem(STORAGE_KEY); if (!text) return;
        const record = parse(text, 4194304);
        if (!record || record.formatVersion !== 1 || !Array.isArray(record.installed) || record.installed.length > 100 || !Array.isArray(record.enabled) || record.enabled.length > 100 || Object.keys(record).some(key => !['formatVersion', 'installed', 'enabled'].includes(key))) fail('INVALID_MANIFEST', 'Invalid local mod record');
        const installed = new Map();
        for (const manifest of record.installed) {
          this.validate(manifest, false);
          if (installed.has(manifest.id)) fail('INVALID_MANIFEST', 'Duplicate installed ID');
          installed.set(manifest.id, manifest);
        }
        if (new Set(record.enabled).size !== record.enabled.length || record.enabled.some(id => typeof id !== 'string' || !installed.has(id))) fail('INVALID_MANIFEST', 'Invalid enabled IDs');
        this.installed = installed; this.enabled = record.enabled;
      } catch (error) { this.notice = 'Saved mod data is invalid or unavailable. Starting with the base game.'; this.log('restore', error); }
    }
    candidate(installed = this.installed, enabled = this.enabled) {
      const candidate = this.adapter.fresh(); const errors = new Map();
      for (const id of enabled) {
        try {
          const manifest = installed.get(id);
          if (!manifest) fail('INVALID_MANIFEST', 'Missing enabled mod');
          this.validate(manifest); this.adapter.apply(candidate, manifest);
        } catch (error) { errors.set(id, error); this.log('apply ' + id, error); }
      }
      return {candidate, errors};
    }
    validateOperations(manifest) {
      const data = this.adapter.fresh(); this.adapter.apply(data, manifest);
    }
    rebuild() {
      if (this.adapter.active()) { this.pending = true; this.notify(); return false; }
      try {
        const {candidate, errors} = this.candidate(); this.errors = errors;
        // Atomic fallback: never commit a partially applied enabled list.
        this.adapter.commit(errors.size ? this.adapter.fresh() : candidate, !errors.size && this.enabled.length > 0);
        this.pending = false;
      } catch (error) {
        this.log('rebuild', error); this.notice = message(error);
        try { this.adapter.commit(this.adapter.fresh(), false); } catch (baseError) { this.log('base fallback', baseError); }
      }
      this.notify(); return this.errors.size === 0;
    }
    async browse() {
      if (this.loading) return this.loading;
      this.registryState = 'loading'; this.notify();
      this.loading = (async () => {
        try {
          let catalog;
          try { catalog = await fetchJSON(registryURL(), 1048576, this.fetcher); }
          catch (error) { const failure = new ModError(error.code === 'INVALID_MANIFEST' ? 'INVALID_REGISTRY' : 'NETWORK', error.message); failure.network = error.network; throw failure; }
          this.catalog = validateCatalog(catalog, this.catalogSchema, this.gameVersion); this.registryState = 'ready'; this.registryError = null;
        } catch (error) { this.catalog = null; this.registryState = 'error'; this.registryError = error; this.log('browse', error); }
        finally { this.loading = null; this.notify(); }
      })();
      return this.loading;
    }
    async installRemote(entry) {
      if (!this.catalog || !this.catalog.mods.some(item => equal(item, entry))) fail('INVALID_REGISTRY', 'Entry is not in the validated catalog');
      let manifest;
      try { manifest = await fetchJSON(manifestURL(entry.manifest), 262144, this.fetcher); }
      catch (error) { this.log('download ' + entry.id, error); throw error.code ? error : new ModError('NETWORK', error.message); }
      agree(manifest, entry, this.catalog.formatVersion); return this.install(manifest, true);
    }
    install(manifest, update = false) {
      // JSON boundary also detaches caller-owned data before persisting it.
      inspect(manifest); const safe = parse(JSON.stringify(manifest)); this.validate(safe); this.validateOperations(safe);
      const previous = this.installed.get(safe.id);
      if (previous && (!update || compareVersions(safe.version, previous.version) <= 0)) fail('INVALID_MANIFEST', 'Duplicate ID or non-newer update');
      if (!previous && this.installed.size >= 100) fail('STORAGE', 'Installed mod limit reached');
      const next = new Map(this.installed); next.set(safe.id, safe);
      if (this.enabled.includes(safe.id)) {
        const check = this.candidate(next); if (check.errors.size) throw check.errors.values().next().value;
      }
      this.persist(next, this.enabled); this.installed = next;
      if (this.enabled.includes(safe.id)) this.rebuild(); else this.notify();
      return safe.id;
    }
    setEnabled(id, value) {
      if (!this.installed.has(id)) fail('INVALID_MANIFEST', 'Unknown installed ID');
      const next = this.enabled.filter(item => item !== id);
      if (value) {
        // Existing enabled entries retain order; new entries append and later wins.
        if (this.enabled.includes(id)) return;
        next.push(id);
        const check = this.candidate(this.installed, next); if (check.errors.size) throw check.errors.values().next().value;
      }
      this.persist(this.installed, next); this.enabled = next; this.rebuild();
    }
    uninstall(id) {
      if (!this.installed.has(id)) fail('INVALID_MANIFEST', 'Unknown installed ID');
      const next = new Map(this.installed); next.delete(id); const enabled = this.enabled.filter(item => item !== id);
      this.persist(next, enabled); this.installed = next; this.enabled = enabled; this.errors.delete(id); this.rebuild();
    }
    status(manifest) {
      try { this.validate(manifest); this.validateOperations(manifest); }
      catch (error) { return message(error); }
      if (this.errors.has(manifest.id)) return message(this.errors.get(manifest.id));
      return this.enabled.includes(manifest.id) ? (this.pending ? 'Enabled · applies next match' : this.errors.size ? 'Enabled · paused because another mod failed' : 'Enabled') : 'Disabled';
    }
    conflicts(manifest) {
      function targets(mod) {
        const result = new Set();
        for (const category of ['guys', 'zones', 'projectiles']) for (const op of mod.changes[category]?.modify || []) for (const field of Object.keys(op.set)) result.add(category + '/' + op.id + '/' + field);
        for (const field of Object.keys(mod.changes.matchSettings || {})) result.add('matchSettings/' + field);
        return result;
      }
      const keys = targets(manifest), result = [];
      for (const id of this.enabled) if (id !== manifest.id) {
        const other = this.installed.get(id);
        if (other && [...targets(other)].some(key => keys.has(key))) result.push(other.name);
      }
      return result;
    }
  }
  return {Manager, ModError, fail, parse, inspect, schemaValidate, validateManifest, validateCatalog, compatibility, compareVersions, manifestURL, agree, equal, message, registryURL, REGISTRY_URL, STORAGE_KEY};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GuyFightsModRuntime;
