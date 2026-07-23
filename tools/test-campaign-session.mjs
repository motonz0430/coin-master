import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript/lib/typescript.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(
  projectRoot,
  'assets/scripts/modes/campaign/CampaignSession.ts',
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
const { CampaignSession } = module.exports;

{
  const lifeEvents = [];
  const session = new CampaignSession(2, ['target-1'], {
    onLivesChanged: (lives, maximum, reason) => {
      lifeEvents.push({ lives, maximum, reason });
    },
  });
  assert.equal(session.beginShot(), true);
  const result = session.finishShot('fell');
  assert.equal(result.nextControlTargetId, null);
  assert.equal(session.currentLives, 1);
  assert.equal(session.currentOutcome, 'playing');
  assert.deepEqual(lifeEvents, [{
    lives: 1,
    maximum: 2,
    reason: 'player-fell',
  }]);
}

{
  const lifeEvents = [];
  const session = new CampaignSession(2, ['target-1'], {
    onLivesChanged: (lives, maximum, reason) => {
      lifeEvents.push({ lives, maximum, reason });
    },
  });
  assert.equal(session.beginShot(), true);
  const result = session.finishShot('stopped');
  assert.equal(result.nextControlTargetId, null);
  assert.equal(session.currentLives, 1);
  assert.deepEqual(lifeEvents, [{
    lives: 1,
    maximum: 2,
    reason: 'shot-missed',
  }]);
}

{
  const session = new CampaignSession(1, ['target-1']);
  assert.equal(session.beginShot(), true);
  assert.equal(session.markTargetHit('target-1'), true);
  assert.equal(session.finishShot('stopped'), null, '命中目标未停止前，本次发射不能提前结束');
  assert.equal(session.resolveTarget('target-1', 'stopped'), true);
  const result = session.finishShot('stopped');
  assert.equal(result.nextControlTargetId, 'target-1');
  assert.equal(session.currentLives, 1);
  assert.equal(session.currentOutcome, 'succeeded');
}

{
  const outcomes = [];
  const session = new CampaignSession(1, ['last-target'], {
    onOutcomeChanged: (outcome) => outcomes.push(outcome),
  });
  assert.equal(session.beginShot(), true);
  assert.equal(session.markTargetHit('last-target'), true);
  assert.equal(session.resolveTarget('last-target', 'fell'), true);
  assert.equal(session.currentLives, 0);
  assert.equal(session.remainingTargets, 0);
  assert.equal(session.currentOutcome, 'failed');
  assert.deepEqual(outcomes, ['failed'], '生命扣除必须先于最后目标的成功判定');
}

{
  const session = new CampaignSession(3, ['target-1', 'target-2']);
  assert.equal(session.beginShot(), true);
  assert.equal(session.markTargetHit('target-1'), true);
  assert.equal(session.markTargetHit('target-2'), true);
  assert.equal(session.resolveTarget('target-1', 'stopped'), true);
  assert.equal(session.hasPendingHitTargets(), true);
  assert.equal(session.resolveTarget('target-2', 'fell'), true);
  const result = session.finishShot('stopped');
  assert.deepEqual([...result.hitTargetIds], ['target-1', 'target-2']);
  assert.deepEqual([...result.survivingHitTargetIds], ['target-1']);
  assert.equal(result.nextControlTargetId, 'target-1');
  assert.equal(session.currentLives, 2);
  assert.equal(session.currentOutcome, 'succeeded');
}

{
  const hitOrder = [];
  const lifeEvents = [];
  const session = new CampaignSession(
    3,
    ['target-1', 'target-2', 'target-3'],
    {
      onTargetHit: (targetId) => hitOrder.push(targetId),
      onLivesChanged: (lives, maximum, reason) => {
        lifeEvents.push({ lives, maximum, reason });
      },
    },
  );
  assert.equal(session.beginShot(), true);
  assert.equal(
    session.spreadTargetHit('target-1', 'target-2'),
    false,
    '未命中的目标不能传播命中',
  );
  assert.equal(session.markTargetHit('target-1'), true);
  assert.equal(session.spreadTargetHit('target-1', 'target-2'), true);
  assert.equal(session.spreadTargetHit('target-2', 'target-3'), true);
  assert.deepEqual(
    hitOrder,
    ['target-1', 'target-2', 'target-3'],
    '命中应支持多级连锁传播',
  );

  assert.equal(session.resolveTarget('target-1', 'stopped'), true);
  assert.equal(session.resolveTarget('target-2', 'fell'), true);
  assert.equal(session.currentLives, 2);
  assert.deepEqual(lifeEvents, [{
    lives: 2,
    maximum: 3,
    reason: 'target-fell',
  }]);
  assert.equal(session.resolveTarget('target-3', 'stopped'), true);
  const result = session.finishShot('stopped');
  assert.deepEqual([...result.survivingHitTargetIds], ['target-1', 'target-3']);
  assert.equal(
    result.nextControlTargetId,
    'target-3',
    '最后一个仍在桌上的命中硬币应接管控制权',
  );
  assert.equal(session.currentOutcome, 'succeeded');
}

{
  const lifeEvents = [];
  const session = new CampaignSession(
    4,
    ['target-1', 'target-2', 'target-3'],
    {
      onLivesChanged: (lives, maximum, reason) => {
        lifeEvents.push({ lives, maximum, reason });
      },
    },
  );
  assert.equal(session.beginShot(), true);
  assert.equal(session.markTargetHit('target-1'), true);
  assert.equal(session.spreadTargetHit('target-1', 'target-2'), true);
  assert.equal(session.spreadTargetHit('target-2', 'target-3'), true);
  assert.equal(session.resolveTarget('target-1', 'fell'), true);
  assert.equal(session.resolveTarget('target-2', 'fell'), true);
  assert.equal(session.resolveTarget('target-3', 'fell'), true);
  const result = session.finishShot('stopped');
  assert.equal(session.currentLives, 1, '每枚掉落的命中传递硬币都应扣 1 点生命');
  assert.equal(result.nextControlTargetId, null, '没有命中硬币留在桌面时保持当前控制硬币');
  assert.deepEqual(lifeEvents.map((event) => event.reason), [
    'target-fell',
    'target-fell',
    'target-fell',
  ]);
  assert.equal(session.currentOutcome, 'succeeded');
}

{
  const session = new CampaignSession(3, ['target-1', 'target-2', 'target-3']);
  assert.equal(session.beginShot(), true);
  assert.equal(session.markTargetHit('target-1'), true);
  assert.equal(session.spreadTargetHit('target-1', 'target-2'), true);
  assert.equal(session.spreadTargetHit('target-2', 'target-3'), true);
  assert.equal(session.resolveTarget('target-1', 'stopped'), true);
  assert.equal(session.resolveTarget('target-2', 'stopped'), true);
  assert.equal(session.resolveTarget('target-3', 'fell'), true);
  const result = session.finishShot('fell');
  assert.equal(
    result.nextControlTargetId,
    'target-2',
    '命中链末端掉落后，应选择命中顺序中最后一枚仍在桌面的硬币',
  );
  assert.equal(session.currentLives, 2);
}

console.log('CampaignSession rules passed.');
