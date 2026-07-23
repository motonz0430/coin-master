import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript/lib/typescript.js';

const projectRoot = path.resolve(import.meta.dirname, '..');

function loadTypeScriptModule(relativePath, imports = {}) {
  const sourcePath = path.join(projectRoot, relativePath);
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
    require: (specifier) => {
      if (!(specifier in imports)) {
        throw new Error(`Unexpected import in ${relativePath}: ${specifier}`);
      }
      return imports[specifier];
    },
  }, { filename: sourcePath });
  return module.exports;
}

const gameplayConfig = loadTypeScriptModule(
  'assets/scripts/gameplay/GameplayConfig.ts',
);
const campaignConfig = loadTypeScriptModule(
  'assets/scripts/modes/campaign/CampaignLevelConfig.ts',
  {
    '../../gameplay/GameplayConfig': gameplayConfig,
    '../../gameplay/PrefabAssetLibrary': {
      loadJsonData: async () => {
        throw new Error('Config parser test does not load Cocos resources.');
      },
    },
  },
);

const sandbox = JSON.parse(fs.readFileSync(
  path.join(projectRoot, 'assets/resources/game/setups/core_gameplay.json'),
  'utf8',
));
const validLevel = {
  ...sandbox,
  contentType: 'campaign-level',
  id: 'config-test',
  startingLives: 3,
  obstacles: {
    mode: 'fixed',
    placements: [{
      id: 'dragon-01',
      prefabId: 'dragon-column',
      position: [0, 0.25, 0],
      scale: [5, 5, 5],
      rotationY: 0,
    }],
  },
};

const parsed = campaignConfig.parseCampaignLevelDefinition(validLevel);
assert.equal(parsed.startingLives, 3);
assert.equal(parsed.obstacles.mode, 'fixed');

assert.throws(
  () => campaignConfig.parseCampaignLevelDefinition({
    ...validLevel,
    startingLives: 0,
  }),
  /startingLives/,
);
assert.throws(
  () => campaignConfig.parseCampaignLevelDefinition({
    ...validLevel,
    startingLives: 100,
  }),
  /99/,
);
assert.throws(
  () => campaignConfig.parseCampaignLevelDefinition({
    ...validLevel,
    obstacles: sandbox.obstacles,
  }),
  /fixed/,
);

console.log('Campaign level config rules passed.');
