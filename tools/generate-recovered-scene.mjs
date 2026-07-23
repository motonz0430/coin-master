import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const scenePath = path.join(projectRoot, 'assets/scene/Main.scene');
const sceneMetaPath = `${scenePath}.meta`;

const UUID = {
  scene: '625622b0-bb32-47bb-971b-e83d519068b5',
  scriptType: '53bf1tn7gRL14WQbKIUE+Ws',
  cylinderMesh: '1263d74c-8167-4928-91a6-4e2672411f47@8abdc',
  planeMesh: '1263d74c-8167-4928-91a6-4e2672411f47@2e76e',
  tableMaterial: '4dd61083-638c-4df3-a81c-0f8ae35c5d90',
  coinEdgeMaterial: 'd88db13b-1b7a-4e05-9b57-b3e235005b1d',
  coinFaceMaterial: '65126e7c-5c81-45a5-abc7-61e5c8a2c375',
  dragon: 'ecb70f33-43c9-469a-b371-73f2ba757fc2',
};

const scene = [];
const WORLD_SCALE = 5;
const world = (values) => values.map((value) => (
  Math.round(value * WORLD_SCALE * 1_000_000) / 1_000_000
));
const vec3 = ([x, y, z]) => ({ __type__: 'cc.Vec3', x, y, z });
const quat = ([x, y, z, w]) => ({ __type__: 'cc.Quat', x, y, z, w });
const color = (r, g, b, a = 255) => ({ __type__: 'cc.Color', r, g, b, a });

const add = (value) => {
  scene.push(value);
  return scene.length - 1;
};

const addNode = ({
  name,
  parent,
  position = [0, 0, 0],
  rotation = [0, 0, 0, 1],
  scale = [1, 1, 1],
  euler = [0, 0, 0],
  active = true,
  id = `${name.replace(/[^A-Za-z0-9]/g, '')}VisualNode`,
}) => {
  const nodeId = add({
    __type__: 'cc.Node',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _parent: parent === null ? null : { __id__: parent },
    _children: [],
    _active: active,
    _components: [],
    _prefab: null,
    _lpos: vec3(position),
    _lrot: quat(rotation),
    _lscale: vec3(scale),
    _mobility: 0,
    _layer: 1073741824,
    _euler: vec3(euler),
    _id: id,
  });
  if (parent !== null) scene[parent]._children.push({ __id__: nodeId });
  return nodeId;
};

const addMeshRenderer = (nodeId, meshUuid, materialUuid, { cast = true, receive = true } = {}) => {
  const componentId = add({
    __type__: 'cc.MeshRenderer',
    _name: `${scene[nodeId]._name}<ModelComponent>`,
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _materials: [{ __uuid__: materialUuid, __expectedType__: 'cc.Material' }],
    _mesh: { __uuid__: meshUuid, __expectedType__: 'cc.Mesh' },
    _shadowCastingMode: cast ? 1 : 0,
    _shadowReceivingMode: receive ? 1 : 0,
    _shadowBias: 0.00015,
    _shadowNormalBias: 0.006 * WORLD_SCALE,
    _id: `${scene[nodeId]._id}Renderer`,
  });
  scene[nodeId]._components.push({ __id__: componentId });
  return componentId;
};

const addCoinFace = (coinId) => {
  const faceId = addNode({
    name: 'CoinFace',
    parent: coinId,
    position: [0, 1.04, 0],
    // Cocos' serialized built-in plane is 10 x 10 units. The original
    // runtime-created plane was 1 x 1, so the recovered editor scene needs
    // one tenth of the old scale to keep the face inside the coin rim.
    scale: [0.0965, 1, 0.0965],
    id: `${scene[coinId]._id}Face`,
  });
  addMeshRenderer(faceId, UUID.planeMesh, UUID.coinFaceMaterial, { cast: false, receive: true });
};

const dragonParts = [
  {
    name: 'DragonScale',
    mesh: 'cbdd6',
    material: 'ee5f2',
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
  },
  {
    name: 'EyeGlow',
    mesh: 'ce5e7',
    material: '830a8',
    position: [-0.07100000232458115, 0.6499999761581421, 0.6449999809265137],
    rotation: [0, 0, 0, 1],
  },
  {
    name: 'HornClaw',
    mesh: '3284b',
    material: '14414',
    position: [0.43499624729156494, -0.5862755179405212, -0.10517106205224991],
    rotation: [0.3616225401928573, 0.6374844874338627, -0.45947295179556524, 0.5017243000632128],
  },
  {
    name: 'Mouth',
    mesh: 'fd3a0',
    material: '6298d',
    position: [0, 0.48500001430511475, 0.5849999785423279],
    rotation: [0, 0, 0, 1],
  },
  {
    name: 'Stone',
    mesh: 'c244a',
    material: '17464',
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
  },
  {
    name: 'StoneEdge',
    mesh: '0b568',
    material: 'eff9a',
    position: [0, -0.9100000262260437, 0],
    rotation: [0, 0, 0, 1],
  },
];

const addDragonVisual = (obstacleId, index) => {
  const rootId = addNode({
    name: 'DragonColumnVisual',
    parent: obstacleId,
    id: `DragonColumnVisual${index}`,
  });
  dragonParts.forEach((part) => {
    const partId = addNode({
      name: part.name,
      parent: rootId,
      position: part.position,
      rotation: part.rotation,
      id: `Dragon${index}${part.name}`,
    });
    addMeshRenderer(
      partId,
      `${UUID.dragon}@${part.mesh}`,
      `${UUID.dragon}@${part.material}`,
      { cast: true, receive: true },
    );
  });
};

add({
  __type__: 'cc.SceneAsset',
  _name: 'Main',
  _objFlags: 0,
  __editorExtras__: {},
  _native: '',
  scene: { __id__: 1 },
});

add({
  __type__: 'cc.Scene',
  _name: 'Main',
  _objFlags: 0,
  __editorExtras__: {},
  _parent: null,
  _children: [],
  _active: true,
  _components: [],
  _prefab: null,
  _lpos: vec3([0, 0, 0]),
  _lrot: quat([0, 0, 0, 1]),
  _lscale: vec3([1, 1, 1]),
  _mobility: 0,
  _layer: 1073741824,
  _euler: vec3([0, 0, 0]),
  autoReleaseAssets: false,
  _globals: null,
  _id: UUID.scene,
});

const gameRootId = addNode({ name: 'GameRoot', parent: 1, id: '54WePFNrtJ0JbLdXsxtstz' });
const scriptId = add({
  __type__: UUID.scriptType,
  _name: '',
  _objFlags: 0,
  __editorExtras__: {},
  node: { __id__: gameRootId },
  _enabled: true,
  __prefab: null,
  gameMode: 0,
  sandboxSetupResourcePath: 'game/setups/core_gameplay',
  campaignLevelResourcePath: '',
  cameraDragDegreesPerScreen: 72,
  chargeZoneHeightRatio: 0.19,
  _id: '94GYPNCThCPaq0NuMkFPH5',
});
scene[gameRootId]._components.push({ __id__: scriptId });

const editorPreviewId = addNode({
  name: 'EditorPreview',
  parent: gameRootId,
  id: 'EditorPreviewNode',
});

const tableId = addNode({
  name: 'Table',
  parent: editorPreviewId,
  position: world([0, -0.18, 0]),
  scale: world([11.44, 0.18, 11.44]),
  id: 'TableRecoveredNode',
});
addMeshRenderer(tableId, UUID.cylinderMesh, UUID.tableMaterial, { cast: false, receive: true });

[
  ['Coin_Player', [0, 0.04, 3.85]],
  ['Coin_Target_1', [0, 0.04, 1.65]],
  ['Coin_Target_2', [-1.1, 0.04, -0.45]],
  ['Coin_Target_3', [1.05, 0.04, -2.4]],
].forEach(([name, position]) => {
  const coinId = addNode({
    name,
    parent: editorPreviewId,
    position: world(position),
    scale: world([0.672, 0.024, 0.672]),
    id: `${name.replace(/[^A-Za-z0-9]/g, '')}RecoveredNode`,
  });
  addMeshRenderer(coinId, UUID.cylinderMesh, UUID.coinEdgeMaterial, { cast: true, receive: true });
  addCoinFace(coinId);
});

const cameraId = addNode({
  name: 'MainCamera',
  parent: gameRootId,
  position: world([0, 8.4, 10.05]),
  rotation: [-0.341, 0, 0, 0.9401],
  euler: [-39.9, 0, 0],
  id: 'MainCameraRecoveredNode',
});
const cameraComponentId = add({
  __type__: 'cc.Camera',
  _name: '',
  _objFlags: 0,
  __editorExtras__: {},
  node: { __id__: cameraId },
  _enabled: true,
  __prefab: null,
  _projection: 1,
  _priority: 0,
  _fov: 42,
  _fovAxis: 0,
  _orthoHeight: 10,
  _near: 0.1 * WORLD_SCALE,
  _far: 100 * WORLD_SCALE,
  _color: color(25, 31, 38),
  _depth: 1,
  _stencil: 0,
  _clearFlags: 14,
  _rect: { __type__: 'cc.Rect', x: 0, y: 0, width: 1, height: 1 },
  _aperture: 19,
  _shutter: 7,
  _iso: 0,
  _screenScale: 1,
  _visibility: 1820327937,
  _targetTexture: null,
  _id: 'MainCameraVisualComponent',
});
scene[cameraId]._components.push({ __id__: cameraComponentId });

const lightId = addNode({
  name: 'KeyLight',
  parent: gameRootId,
  position: world([0, 8, 0]),
  rotation: [-0.388, -0.275, -0.122, 0.871],
  euler: [-48, -35, 0],
  id: 'KeyLightRecoveredNode',
});
const staticLightId = add({
  __type__: 'cc.StaticLightSettings',
  _baked: false,
  _editorOnly: false,
  _bakeable: false,
  _castShadow: false,
});
const lightComponentId = add({
  __type__: 'cc.DirectionalLight',
  _name: '',
  _objFlags: 0,
  __editorExtras__: {},
  node: { __id__: lightId },
  _enabled: true,
  __prefab: null,
  _color: color(255, 226, 190),
  _useColorTemperature: false,
  _colorTemperature: 6550,
  _staticSettings: { __id__: staticLightId },
  _illuminance: 72000,
  _shadowEnabled: true,
  _shadowPcf: 2,
  _shadowBias: 0.0008,
  _shadowNormalBias: 0.018 * WORLD_SCALE,
  _shadowSaturation: 0.9,
  _shadowFixedArea: true,
  _shadowNear: 0.1 * WORLD_SCALE,
  _shadowFar: 20 * WORLD_SCALE,
  _shadowOrthoSize: 7.2 * WORLD_SCALE,
  _id: 'KeyLightVisualComponent',
});
scene[lightId]._components.push({ __id__: lightComponentId });

[
  [-1.8, 0.38, 2],
  [1.7, 0.38, 1.7],
  [-2.2, 0.38, 0.2],
  [1.9, 0.38, -0.3],
  [-1.4, 0.38, -1.8],
  [0.4, 0.38, -2.5],
  [2.6, 0.38, -1.8],
  [0.2, 0.38, 0.1],
].forEach((position, offset) => {
  const index = offset + 1;
  const obstacleId = addNode({
    name: `Obstacle_${index}`,
    parent: editorPreviewId,
    position: world(position),
    scale: world([0.56, 0.38, 0.56]),
    id: `Obstacle${index}RecoveredNode`,
  });
  addDragonVisual(obstacleId, index);
});

const ambientId = add({
  __type__: 'cc.AmbientInfo',
  _skyColor: color(82, 106, 142),
  _skyIllum: 10000,
  _groundAlbedo: color(35, 43, 55),
});
const shadowsId = add({
  __type__: 'cc.ShadowsInfo',
  _type: 1,
  _enabled: true,
  _normal: vec3([0, 1, 0]),
  _distance: 1,
  _shadowColor: color(0, 0, 0, 115),
  _autoAdapt: true,
  _pcf: 2,
  _bias: 0.000001,
  _near: 0.1 * WORLD_SCALE,
  _far: 50 * WORLD_SCALE,
  _aspect: 1,
  _shadowDistance: 10 * WORLD_SCALE,
  _invisibleOcclusionRange: 200 * WORLD_SCALE,
  _orthoSize: 10 * WORLD_SCALE,
  _maxReceived: 4,
  _size: { __type__: 'cc.Vec2', x: 1024, y: 1024 },
});
const skyboxId = add({
  __type__: 'cc.SkyboxInfo',
  _envmap: null,
  _isRGBE: false,
  _enabled: false,
  _useIBL: false,
});
const fogId = add({
  __type__: 'cc.FogInfo',
  _type: 0,
  _fogColor: color(200, 200, 200),
  _enabled: false,
  _fogDensity: 0.3,
  _fogStart: 0.5,
  _fogEnd: 300,
  _fogAtten: 5,
  _fogTop: 1.5,
  _fogRange: 1.2,
});
const globalsId = add({
  __type__: 'cc.SceneGlobals',
  ambient: { __id__: ambientId },
  shadows: { __id__: shadowsId },
  _skybox: { __id__: skyboxId },
  fog: { __id__: fogId },
});
scene[1]._globals = { __id__: globalsId };

fs.mkdirSync(path.dirname(scenePath), { recursive: true });
fs.writeFileSync(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
fs.writeFileSync(sceneMetaPath, `${JSON.stringify({
  ver: '1.1.50',
  importer: 'scene',
  imported: true,
  uuid: UUID.scene,
  files: ['.json'],
  subMetas: {},
  userData: {},
}, null, 2)}\n`);

console.log(`Generated visible editor scene with ${scene.length} serialized objects: ${scenePath}`);
