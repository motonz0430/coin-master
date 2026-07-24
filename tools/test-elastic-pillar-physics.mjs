import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript/lib/typescript.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(
  projectRoot,
  'assets/scripts/gameplay/ElasticPillarPhysics.ts',
);
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    strict: true,
  },
  fileName: sourcePath,
});
const module = { exports: {} };
vm.runInNewContext(compiled.outputText, {
  module,
  exports: module.exports,
}, { filename: sourcePath });

const {
  calculateElasticPillarVelocity,
  DEFAULT_ELASTIC_BOOST_MULTIPLIER,
} = module.exports;

assert.equal(DEFAULT_ELASTIC_BOOST_MULTIPLIER, 1.6);

const amplified = calculateElasticPillarVelocity(
  { x: 3, y: -2, z: 4 },
  { x: 1, z: 0 },
);
assert.equal(Math.hypot(amplified.x, amplified.z), 8);
assert.equal(amplified.y, -2);

const reflected = calculateElasticPillarVelocity(
  { x: -5, y: 0, z: 0 },
  { x: 1, z: 0 },
);
assert.equal(reflected.x, 8);
assert.equal(reflected.z, 0);

const capped = calculateElasticPillarVelocity(
  { x: 10, y: 1, z: 0 },
  { x: 1, z: 0 },
  2,
  12,
);
assert.equal(capped.x, 12);
assert.equal(capped.y, 1);

const stopped = calculateElasticPillarVelocity(
  { x: 0, y: -3, z: 0 },
  { x: 1, z: 0 },
);
assert.equal(stopped.x, 0);
assert.equal(stopped.y, -3);
assert.equal(stopped.z, 0);

console.log('Elastic pillar velocity rules passed.');
