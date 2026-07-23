import { Node } from 'cc';
import type {
    FixedObstaclePlacement,
    LevelDefinition,
    RandomObstacleDefinition,
} from './LevelConfig';
import { parseLevelDefinition } from './LevelConfig';
import { PrefabAssetLibrary, loadJsonData } from './PrefabAssetLibrary';

export interface BuiltLevel {
    readonly root: Node;
    readonly table: Node;
    readonly playerCoin: Node;
    readonly targetCoins: readonly Node[];
    readonly obstacles: readonly Node[];
}

export async function loadLevelDefinition(resourcePath: string): Promise<LevelDefinition> {
    return parseLevelDefinition(await loadJsonData(resourcePath));
}

export async function buildLevel(
    sceneRoot: Node,
    definition: LevelDefinition,
    library: PrefabAssetLibrary,
): Promise<BuiltLevel> {
    const prefabIds = collectPrefabIds(definition);
    await library.preload(prefabIds);
    removeEditorPreview(sceneRoot);

    const root = new Node('LevelRuntime');
    sceneRoot.addChild(root);

    const table = library.instantiate(definition.table.prefabId);
    table.name = 'Table';
    table.setPosition(...definition.table.position);
    table.setScale(...definition.table.scale);
    root.addChild(table);

    const playerCoin = createCoin(
        library,
        definition.coins.prefabId,
        'Coin_Player',
        definition.coins.player.position,
        definition.coins.scale,
    );
    root.addChild(playerCoin);

    const targetCoins = definition.coins.targets.map((spawn, index) => {
        const coin = createCoin(
            library,
            definition.coins.prefabId,
            `Coin_Target_${index + 1}`,
            spawn.position,
            definition.coins.scale,
        );
        root.addChild(coin);
        return coin;
    });

    const obstacles = definition.obstacles.mode === 'random'
        ? buildRandomObstacles(root, definition, library)
        : buildFixedObstacles(root, definition.obstacles.placements, library);

    return { root, table, playerCoin, targetCoins, obstacles };
}

function collectPrefabIds(definition: LevelDefinition): string[] {
    const obstacleIds = definition.obstacles.mode === 'random'
        ? [definition.obstacles.prefabId]
        : definition.obstacles.placements.map((placement) => placement.prefabId);
    return [
        definition.table.prefabId,
        definition.coins.prefabId,
        ...obstacleIds,
    ];
}

function createCoin(
    library: PrefabAssetLibrary,
    prefabId: string,
    name: string,
    position: readonly [number, number, number],
    scale: readonly [number, number, number],
): Node {
    const coin = library.instantiate(prefabId);
    coin.name = name;
    coin.setPosition(...position);
    coin.setScale(...scale);
    return coin;
}

function buildRandomObstacles(
    root: Node,
    definition: LevelDefinition,
    library: PrefabAssetLibrary,
): Node[] {
    const settings = definition.obstacles as RandomObstacleDefinition;
    const activeCount = settings.minCount
        + Math.floor(Math.random() * (settings.maxCount - settings.minCount + 1));
    const occupied: Array<{ x: number; z: number; clearance: number }> = [
        definition.coins.player,
        ...definition.coins.targets,
    ].map((spawn) => ({
        x: spawn.position[0],
        z: spawn.position[2],
        clearance: definition.coins.radius + settings.coinClearance,
    }));

    const obstacles: Node[] = [];
    for (let index = 0; index < activeCount; index++) {
        const radius = randomRange(...settings.radiusRange);
        const height = randomRange(...settings.heightRange);
        const position = findRandomObstaclePosition(
            definition.table.radius,
            radius,
            settings,
            occupied,
        );
        const obstacle = library.instantiate(settings.prefabId);
        obstacle.name = `Obstacle_${index + 1}`;
        obstacle.setPosition(position.x, height * 0.5, position.z);
        obstacle.setScale(radius * 2, height * 0.5, radius * 2);

        const playerPosition = definition.coins.player.position;
        const facePlayerYaw = Math.atan2(
            playerPosition[0] - position.x,
            playerPosition[2] - position.z,
        ) * 180 / Math.PI;
        obstacle.setRotationFromEuler(0, facePlayerYaw, 0);
        root.addChild(obstacle);
        obstacles.push(obstacle);
        occupied.push({
            x: position.x,
            z: position.z,
            clearance: radius + settings.obstacleClearance,
        });
    }
    return obstacles;
}

function buildFixedObstacles(
    root: Node,
    placements: readonly FixedObstaclePlacement[],
    library: PrefabAssetLibrary,
): Node[] {
    return placements.map((placement, index) => {
        const obstacle = library.instantiate(placement.prefabId);
        obstacle.name = placement.id || `Obstacle_${index + 1}`;
        obstacle.setPosition(...placement.position);
        obstacle.setScale(...placement.scale);
        obstacle.setRotationFromEuler(0, placement.rotationY, 0);
        root.addChild(obstacle);
        return obstacle;
    });
}

function findRandomObstaclePosition(
    tableRadius: number,
    obstacleRadius: number,
    settings: RandomObstacleDefinition,
    occupied: readonly { x: number; z: number; clearance: number }[],
): { x: number; z: number } {
    const usableRadius = tableRadius - obstacleRadius - settings.tableEdgePadding;
    for (let attempt = 0; attempt < settings.placementAttempts; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * usableRadius;
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        const overlaps = occupied.some((item) => {
            const dx = x - item.x;
            const dz = z - item.z;
            return dx * dx + dz * dz < item.clearance * item.clearance;
        });
        if (!overlaps) return { x, z };
    }
    return { x: 0, z: 0 };
}

function randomRange(minimum: number, maximum: number): number {
    return minimum + Math.random() * (maximum - minimum);
}

function removeEditorPreview(sceneRoot: Node): void {
    const oldRuntime = sceneRoot.getChildByName('LevelRuntime');
    if (oldRuntime) detachAndDestroy(oldRuntime);
    const editorPreview = sceneRoot.getChildByName('EditorPreview');
    if (editorPreview) detachAndDestroy(editorPreview);

    [
        'Table',
        'Coin_Player',
        'Coin_Target_1',
        'Coin_Target_2',
        'Coin_Target_3',
        'Obstacle_1',
        'Obstacle_2',
        'Obstacle_3',
        'Obstacle_4',
        'Obstacle_5',
        'Obstacle_6',
        'Obstacle_7',
        'Obstacle_8',
    ].forEach((name) => {
        const previewNode = sceneRoot.getChildByName(name);
        if (previewNode) detachAndDestroy(previewNode);
    });
}

function detachAndDestroy(node: Node): void {
    node.removeFromParent();
    node.destroy();
}
