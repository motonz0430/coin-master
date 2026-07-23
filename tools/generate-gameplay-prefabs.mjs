import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');

const UUID = {
  tablePrefab: '147aca30-6c39-43a4-851a-49cced102431',
  coinPrefab: '5e396525-d3d7-42cd-94c0-ddc3eef28db8',
  dragonPrefab: 'aa771613-1c10-4519-a26f-0d068a3d16ad',
  cylinderMesh: '1263d74c-8167-4928-91a6-4e2672411f47@8abdc',
  planeMesh: '1263d74c-8167-4928-91a6-4e2672411f47@2e76e',
  tableMaterial: '4dd61083-638c-4df3-a81c-0f8ae35c5d90',
  coinEdgeMaterial: 'd88db13b-1b7a-4e05-9b57-b3e235005b1d',
  coinFaceMaterial: '65126e7c-5c81-45a5-abc7-61e5c8a2c375',
  dragon: 'ecb70f33-43c9-469a-b371-73f2ba757fc2',
};

const DIRECTORY_METAS = {
  'assets/resources/game.meta': '180c287e-5b8c-41a1-8c90-ffb151dfd9f0',
  'assets/resources/game/prefabs.meta': '23a4533a-3e75-49b8-980f-a1de579160b4',
  'assets/resources/game/setups.meta': '5e30fa9b-1120-4856-91b6-59028693297b',
  'assets/resources/game/modes.meta': '8d6acdc8-3d1d-48cb-8470-10ff8bee2b00',
  'assets/resources/game/modes/campaign.meta': 'dfc8e180-a451-4e35-8869-4d0cb04a08be',
  'assets/resources/game/modes/campaign/levels.meta': 'fbd7c565-a17e-4432-94e1-83b7d1bd524e',
  'assets/scripts/gameplay.meta': '71e71e0d-284e-4f32-91ca-e221c56885ba',
  'assets/scripts/modes.meta': 'c9e3e220-9be5-430b-92fa-f96832eb62ca',
  'assets/scripts/modes/campaign.meta': '731ba74e-2c3d-477d-878b-000d250656f2',
};

const TEXT_METAS = {
  'assets/resources/game/asset_catalog.json.meta': '6f4cb664-c2e8-4d1d-a2f4-88a2649bfd89',
  'assets/resources/game/setups/core_gameplay.json.meta': '16c1d270-96a7-4d7b-af1f-134332eabf6c',
};

const SCRIPT_METAS = {
  'assets/scripts/gameplay/GameplayConfig.ts.meta': '405da631-e521-445d-ac69-d8b890faf288',
  'assets/scripts/gameplay/PrefabAssetLibrary.ts.meta': '7ba3d85d-4b50-4a60-8fb1-d63668601933',
  'assets/scripts/gameplay/GameplayBuilder.ts.meta': 'b3c6f5d0-0066-42a6-b6f6-f39dba5c4417',
  'assets/scripts/modes/GameMode.ts.meta': 'c6eaa599-b291-4d43-ade7-3572993a0281',
  'assets/scripts/modes/campaign/CampaignLevelConfig.ts.meta': 'd5e955d9-b9fc-49b9-8315-22cfbec44158',
  'assets/scripts/modes/campaign/CampaignSession.ts.meta': '49421354-5d6e-4136-8ddb-4256b1fba531',
};

const vec3 = (x = 0, y = 0, z = 0) => ({ __type__: 'cc.Vec3', x, y, z });
const quat = (x = 0, y = 0, z = 0, w = 1) => ({ __type__: 'cc.Quat', x, y, z, w });

class PrefabBuilder {
  constructor(name, uuid) {
    this.name = name;
    this.uuid = uuid;
    this.objects = [{
      __type__: 'cc.Prefab',
      _name: name,
      _objFlags: 0,
      _native: '',
      data: { __id__: 1 },
      optimizationPolicy: 0,
      asyncLoadAssets: false,
      persistent: false,
    }];
    this.root = this.addNode(name, null, `${name}Root`);
  }

  add(value) {
    this.objects.push(value);
    return this.objects.length - 1;
  }

  addNode(name, parent, fileId, {
    position = [0, 0, 0],
    rotation = [0, 0, 0, 1],
    scale = [1, 1, 1],
    euler = [0, 0, 0],
  } = {}) {
    const nodeId = this.add({
      __type__: 'cc.Node',
      _name: name,
      _objFlags: 0,
      __editorExtras__: {},
      _parent: parent === null ? null : { __id__: parent },
      _children: [],
      _active: true,
      _components: [],
      _prefab: null,
      _lpos: vec3(...position),
      _lrot: quat(...rotation),
      _lscale: vec3(...scale),
      _mobility: 0,
      _layer: 1073741824,
      _euler: vec3(...euler),
      _id: '',
    });
    if (parent !== null) this.objects[parent]._children.push({ __id__: nodeId });
    this.objects[nodeId]._prefab = { __id__: this.add({
      __type__: 'cc.PrefabInfo',
      root: { __id__: this.root ?? nodeId },
      asset: { __id__: 0 },
      fileId,
    }) };
    return nodeId;
  }

  addComponent(nodeId, component, fileId) {
    component.node = { __id__: nodeId };
    component._enabled = true;
    component.__prefab = { __id__: this.add({
      __type__: 'cc.CompPrefabInfo',
      fileId,
    }) };
    const componentId = this.add(component);
    this.objects[nodeId]._components.push({ __id__: componentId });
    return componentId;
  }

  addMeshRenderer(nodeId, meshUuid, materialUuid, fileId, cast = true) {
    this.addComponent(nodeId, {
      __type__: 'cc.MeshRenderer',
      _name: `${this.objects[nodeId]._name}<ModelComponent>`,
      _objFlags: 0,
      __editorExtras__: {},
      _materials: [{ __uuid__: materialUuid, __expectedType__: 'cc.Material' }],
      _mesh: { __uuid__: meshUuid, __expectedType__: 'cc.Mesh' },
      _shadowCastingMode: cast ? 1 : 0,
      _shadowReceivingMode: 1,
      _shadowBias: 0.00015,
      _shadowNormalBias: 0.03,
      _id: '',
    }, fileId);
  }

  addRigidBody(nodeId, fileId, {
    type,
    mass = 1,
    gravity,
    linearDamping = 0.1,
    angularDamping = 0.1,
    linearFactor = [1, 1, 1],
    angularFactor = [1, 1, 1],
  }) {
    this.addComponent(nodeId, {
      __type__: 'cc.RigidBody',
      _name: '',
      _objFlags: 0,
      __editorExtras__: {},
      _group: 1,
      _type: type,
      _mass: mass,
      _allowSleep: true,
      _linearDamping: linearDamping,
      _angularDamping: angularDamping,
      _useGravity: gravity,
      _linearFactor: vec3(...linearFactor),
      _angularFactor: vec3(...angularFactor),
      _id: '',
    }, fileId);
  }

  addCylinderCollider(nodeId, fileId) {
    this.addComponent(nodeId, {
      __type__: 'cc.CylinderCollider',
      _name: '',
      _objFlags: 0,
      __editorExtras__: {},
      _material: null,
      _isTrigger: false,
      _center: vec3(),
      _radius: 0.5,
      _height: 2,
      _direction: 1,
      _id: '',
    }, fileId);
  }

  finish() {
    // The root PrefabInfo was created before `this.root` was assigned.
    const rootInfo = this.objects[this.objects[this.root]._prefab.__id__];
    rootInfo.root = { __id__: this.root };
    return this.objects;
  }
}

function createTablePrefab() {
  const builder = new PrefabBuilder('TablePurpleRound', UUID.tablePrefab);
  builder.addMeshRenderer(builder.root, UUID.cylinderMesh, UUID.tableMaterial, 'TableRenderer', false);
  builder.addRigidBody(builder.root, 'TableRigidBody', { type: 2, gravity: false });
  builder.addCylinderCollider(builder.root, 'TableCollider');
  return builder.finish();
}

function createCoinPrefab() {
  const builder = new PrefabBuilder('GoldCoin', UUID.coinPrefab);
  builder.addMeshRenderer(builder.root, UUID.cylinderMesh, UUID.coinEdgeMaterial, 'CoinRenderer', true);
  builder.addRigidBody(builder.root, 'CoinRigidBody', {
    type: 1,
    gravity: true,
    linearDamping: 0.62,
    angularDamping: 0.9,
    angularFactor: [0, 0, 0],
  });
  builder.addCylinderCollider(builder.root, 'CoinCollider');
  const face = builder.addNode('CoinFace', builder.root, 'CoinFaceNode', {
    position: [0, 1.04, 0],
    scale: [0.0965, 1, 0.0965],
  });
  builder.addMeshRenderer(face, UUID.planeMesh, UUID.coinFaceMaterial, 'CoinFaceRenderer', false);
  return builder.finish();
}

const DRAGON_PARTS = [
  ['DragonScale', 'cbdd6', 'ee5f2', [0, 0, 0], [0, 0, 0, 1]],
  ['EyeGlow', 'ce5e7', '830a8', [-0.07100000232458115, 0.6499999761581421, 0.6449999809265137], [0, 0, 0, 1]],
  ['HornClaw', '3284b', '14414', [0.43499624729156494, -0.5862755179405212, -0.10517106205224991], [0.3616225401928573, 0.6374844874338627, -0.45947295179556524, 0.5017243000632128]],
  ['Mouth', 'fd3a0', '6298d', [0, 0.48500001430511475, 0.5849999785423279], [0, 0, 0, 1]],
  ['Stone', 'c244a', '17464', [0, 0, 0], [0, 0, 0, 1]],
  ['StoneEdge', '0b568', 'eff9a', [0, -0.9100000262260437, 0], [0, 0, 0, 1]],
];

function createDragonPrefab() {
  const builder = new PrefabBuilder('DragonColumn', UUID.dragonPrefab);
  builder.addRigidBody(builder.root, 'DragonRigidBody', { type: 2, gravity: false });
  builder.addCylinderCollider(builder.root, 'DragonCollider');
  DRAGON_PARTS.forEach(([name, mesh, material, position, rotation]) => {
    const part = builder.addNode(name, builder.root, `Dragon${name}Node`, { position, rotation });
    builder.addMeshRenderer(
      part,
      `${UUID.dragon}@${mesh}`,
      `${UUID.dragon}@${material}`,
      `Dragon${name}Renderer`,
      true,
    );
  });
  return builder.finish();
}

function writeJson(relativePath, value) {
  const absolutePath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writePrefab(relativePath, name, uuid, data) {
  writeJson(relativePath, data);
  writeJson(`${relativePath}.meta`, {
    ver: '1.1.50',
    importer: 'prefab',
    imported: true,
    uuid,
    files: ['.json'],
    subMetas: {},
    userData: { syncNodeName: name },
  });
}

Object.entries(DIRECTORY_METAS).forEach(([relativePath, uuid]) => {
  writeJson(relativePath, {
    ver: '1.2.0',
    importer: 'directory',
    imported: true,
    uuid,
    files: [],
    subMetas: {},
    userData: {},
  });
});

Object.entries(TEXT_METAS).forEach(([relativePath, uuid]) => {
  writeJson(relativePath, {
    ver: '1.0.1',
    importer: 'text',
    imported: true,
    uuid,
    files: ['.json'],
    subMetas: {},
    userData: {},
  });
});

Object.entries(SCRIPT_METAS).forEach(([relativePath, uuid]) => {
  writeJson(relativePath, {
    ver: '4.0.24',
    importer: 'typescript',
    imported: true,
    uuid,
    files: [],
    subMetas: {},
    userData: {},
  });
});

writePrefab(
  'assets/resources/game/prefabs/TablePurpleRound.prefab',
  'TablePurpleRound',
  UUID.tablePrefab,
  createTablePrefab(),
);
writePrefab(
  'assets/resources/game/prefabs/GoldCoin.prefab',
  'GoldCoin',
  UUID.coinPrefab,
  createCoinPrefab(),
);
writePrefab(
  'assets/resources/game/prefabs/DragonColumn.prefab',
  'DragonColumn',
  UUID.dragonPrefab,
  createDragonPrefab(),
);

console.log('Generated reusable gameplay Prefabs and Cocos metadata.');
