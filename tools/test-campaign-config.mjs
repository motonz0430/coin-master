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
      id: 'elastic-01',
      prefabId: 'obstacle.elastic-pillar',
      position: [0, 0.25, 0],
      scale: [5, 5, 5],
      rotationY: 0,
      elasticBoostMultiplier: 1.8,
    }],
  },
};

const parsed = campaignConfig.parseCampaignLevelDefinition(validLevel);
assert.equal(parsed.startingLives, 3);
assert.equal(parsed.obstacles.mode, 'fixed');
assert.equal(parsed.obstacles.placements[0].elasticBoostMultiplier, 1.8);

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
    [-9.7, 0.2, -13.7],
    [10.8, 0.2, -16.3],
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

const level004 = JSON.parse(fs.readFileSync(
  path.join(
    projectRoot,
    'assets/resources/game/modes/campaign/levels/level_004.json',
  ),
  'utf8',
));
const parsedLevel004 = campaignConfig.parseCampaignLevelDefinition(level004);
assert.equal(parsedLevel004.id, 'level_004');
assert.equal(parsedLevel004.startingLives, 3);
assert.equal(parsedLevel004.coins.targets.length, 5);
assert.deepEqual(
  [...parsedLevel004.coins.player.position],
  [12.2, 0.2, 19.5],
);
assert.deepEqual(
  parsedLevel004.coins.targets.map((target) => [...target.position]),
  [
    [6, 0.2, -16.2],
    [-9, 0.2, -6.7],
    [0.7, 0.2, 0.8],
    [11.3, 0.2, -2.1],
    [-6.3, 0.2, 17.5],
  ],
);
assert.equal(parsedLevel004.obstacles.mode, 'fixed');
assert.equal(parsedLevel004.obstacles.placements.length, 4);
assert.deepEqual(
  parsedLevel004.obstacles.placements.map((obstacle) => ({
    prefabId: obstacle.prefabId,
    position: [...obstacle.position],
    scale: [...obstacle.scale],
    rotationY: obstacle.rotationY,
  })),
  [
    {
      prefabId: 'obstacle.dragon-column',
      position: [-1.3, 1.9, -7.1],
      scale: [5.2, 1.9, 5.2],
      rotationY: 27,
    },
    {
      prefabId: 'obstacle.dragon-column',
      position: [17.1, 1.9, -2.1],
      scale: [5.2, 1.9, 5.2],
      rotationY: -13,
    },
    {
      prefabId: 'obstacle.dragon-column',
      position: [10.1, 1.9, 3.4],
      scale: [5.2, 1.9, 5.2],
      rotationY: 7,
    },
    {
      prefabId: 'obstacle.dragon-column',
      position: [-1.3, 1.9, 9.5],
      scale: [5.2, 1.9, 5.2],
      rotationY: 54,
    },
  ],
);

assert.throws(
  () => campaignConfig.parseCampaignLevelDefinition({
    ...validLevel,
    obstacles: {
      mode: 'fixed',
      placements: [{
        ...validLevel.obstacles.placements[0],
        elasticBoostMultiplier: 1,
      }],
    },
  }),
  /elasticBoostMultiplier/,
);
assert.throws(
  () => campaignConfig.parseCampaignLevelDefinition({
    ...validLevel,
    obstacles: {
      mode: 'fixed',
      placements: [{
        ...validLevel.obstacles.placements[0],
        elasticBoostMultiplier: 3.1,
      }],
    },
  }),
  /elasticBoostMultiplier/,
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
