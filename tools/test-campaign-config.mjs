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

const level001 = JSON.parse(fs.readFileSync(
  path.join(
    projectRoot,
    'assets/resources/game/modes/campaign/levels/level_001.json',
  ),
  'utf8',
));
const parsedLevel001 = campaignConfig.parseCampaignLevelDefinition(level001);
assert.equal(parsedLevel001.id, 'level_001');
assert.equal(parsedLevel001.startingLives, 3);
assert.equal(parsedLevel001.coins.targets.length, 2);
assert.equal(parsedLevel001.obstacles.mode, 'fixed');
assert.equal(parsedLevel001.obstacles.placements.length, 0);

const level002 = JSON.parse(fs.readFileSync(
  path.join(
    projectRoot,
    'assets/resources/game/modes/campaign/levels/level_002.json',
  ),
  'utf8',
));
const parsedLevel002 = campaignConfig.parseCampaignLevelDefinition(level002);
assert.equal(parsedLevel002.id, 'level_002');
assert.equal(parsedLevel002.startingLives, 3);
assert.equal(parsedLevel002.coins.targets.length, 2);
assert.deepEqual(
  [...parsedLevel002.coins.player.position],
  [0, 0.2, 20],
);
assert.deepEqual(
  parsedLevel002.coins.targets.map((target) => [...target.position]),
  [
    [0, 0.2, -6.7],
    [9.1, 0.2, 2.6],
  ],
);
assert.equal(parsedLevel002.obstacles.mode, 'fixed');
assert.equal(parsedLevel002.obstacles.placements.length, 1);
assert.equal(
  parsedLevel002.obstacles.placements[0].prefabId,
  'obstacle.dragon-column',
);
assert.deepEqual(
  [...parsedLevel002.obstacles.placements[0].position],
  [0, 1.9, 2.6],
);
assert.deepEqual(
  [...parsedLevel002.obstacles.placements[0].scale],
  [5.2, 1.9, 5.2],
);

const level003 = JSON.parse(fs.readFileSync(
  path.join(
    projectRoot,
    'assets/resources/game/modes/campaign/levels/level_003.json',
  ),
  'utf8',
));
const parsedLevel003 = campaignConfig.parseCampaignLevelDefinition(level003);
assert.equal(parsedLevel003.id, 'level_003');
assert.equal(parsedLevel003.startingLives, 3);
assert.equal(parsedLevel003.coins.targets.length, 3);
assert.deepEqual(
  [...parsedLevel003.coins.player.position],
  [0, 0.2, 20],
);
assert.deepEqual(
  parsedLevel003.coins.targets.map((target) => [...target.position]),
  [
    [-12.6, 0.2, -17.7],
    [14, 0.2, -21.1],
    [8.4, 0.2, 4.3],
  ],
);
assert.equal(parsedLevel003.obstacles.mode, 'fixed');
assert.equal(parsedLevel003.obstacles.placements.length, 2);
assert.deepEqual(
  parsedLevel003.obstacles.placements.map((obstacle) => ({
    prefabId: obstacle.prefabId,
    position: [...obstacle.position],
    scale: [...obstacle.scale],
    rotationY: obstacle.rotationY,
  })),
  [
    {
      prefabId: 'obstacle.dragon-column',
      position: [-8, 1.9, 1.1],
      scale: [5.2, 1.9, 5.2],
      rotationY: 23,
    },
    {
      prefabId: 'obstacle.dragon-column',
      position: [9.9, 1.9, -7.2],
      scale: [5.2, 1.9, 5.2],
      rotationY: -20,
    },
  ],
);

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
