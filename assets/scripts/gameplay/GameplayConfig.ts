export type Vec3Tuple = [number, number, number];
export type GameplayContentType = 'sandbox-setup' | 'campaign-level';

export interface AssetCatalog {
    readonly schemaVersion: 1;
    readonly assets: Readonly<Record<string, string>>;
}

export interface TableDefinition {
    readonly prefabId: string;
    readonly position: Vec3Tuple;
    readonly scale: Vec3Tuple;
    readonly radius: number;
}

export interface CoinSpawnDefinition {
    readonly id: string;
    readonly position: Vec3Tuple;
}

export interface CoinDefinition {
    readonly prefabId: string;
    readonly scale: Vec3Tuple;
    readonly radius: number;
    readonly height: number;
    readonly player: CoinSpawnDefinition;
    readonly targets: readonly CoinSpawnDefinition[];
}

export interface RandomObstacleDefinition {
    readonly mode: 'random';
    readonly prefabId: string;
    readonly minCount: number;
    readonly maxCount: number;
    readonly radiusRange: [number, number];
    readonly heightRange: [number, number];
    readonly tableEdgePadding: number;
    readonly coinClearance: number;
    readonly obstacleClearance: number;
    readonly placementAttempts: number;
}

export interface FixedObstaclePlacement {
    readonly id: string;
    readonly prefabId: string;
    readonly position: Vec3Tuple;
    readonly scale: Vec3Tuple;
    readonly rotationY: number;
}

export interface FixedObstacleDefinition {
    readonly mode: 'fixed';
    readonly placements: readonly FixedObstaclePlacement[];
}

export type ObstacleDefinition = RandomObstacleDefinition | FixedObstacleDefinition;

export interface CameraDefinition {
    readonly backDistance: number;
    readonly height: number;
    readonly lookAhead: number;
    readonly lookHeight: number;
}

export interface GameplayDefinition {
    readonly schemaVersion: 1;
    readonly contentType: GameplayContentType;
    readonly id: string;
    readonly displayName: string;
    readonly table: TableDefinition;
    readonly coins: CoinDefinition;
    readonly obstacles: ObstacleDefinition;
    readonly camera: CameraDefinition;
}

export function parseAssetCatalog(value: unknown): AssetCatalog {
    const catalog = requireObject(value, '资产目录');
    requireSchemaVersion(catalog);
    const rawAssets = requireObject(catalog.assets, '资产目录.assets');
    const assets: Record<string, string> = {};

    Object.keys(rawAssets).forEach((id) => {
        const path = rawAssets[id];
        assets[requireNonEmptyString(id, '资产 ID')] = requireNonEmptyString(path, `资产 ${id} 的路径`);
    });
    if (Object.keys(assets).length === 0) {
        throw new Error('资产目录至少需要包含一个 Prefab。');
    }

    return { schemaVersion: 1, assets };
}

export function parseGameplayDefinition(
    value: unknown,
    expectedContentType: GameplayContentType,
): GameplayDefinition {
    const content = requireObject(value, '玩法内容配置');
    requireSchemaVersion(content);
    const contentType = requireNonEmptyString(content.contentType, 'contentType');
    if (contentType !== expectedContentType) {
        throw new Error(
            `玩法内容类型不匹配：期望 ${expectedContentType}，实际为 ${contentType}。`,
        );
    }

    const table = requireObject(content.table, 'table');
    const coins = requireObject(content.coins, 'coins');
    const player = requireObject(coins.player, 'coins.player');
    const rawTargets = requireArray(coins.targets, 'coins.targets');
    const camera = requireObject(content.camera, 'camera');

    const definition: GameplayDefinition = {
        schemaVersion: 1,
        contentType: expectedContentType,
        id: requireNonEmptyString(content.id, 'id'),
        displayName: requireNonEmptyString(content.displayName, 'displayName'),
        table: {
            prefabId: requireNonEmptyString(table.prefabId, 'table.prefabId'),
            position: requireVec3(table.position, 'table.position'),
            scale: requirePositiveVec3(table.scale, 'table.scale'),
            radius: requirePositiveNumber(table.radius, 'table.radius'),
        },
        coins: {
            prefabId: requireNonEmptyString(coins.prefabId, 'coins.prefabId'),
            scale: requirePositiveVec3(coins.scale, 'coins.scale'),
            radius: requirePositiveNumber(coins.radius, 'coins.radius'),
            height: requirePositiveNumber(coins.height, 'coins.height'),
            player: parseCoinSpawn(player, 'coins.player'),
            targets: rawTargets.map((target, index) => (
                parseCoinSpawn(requireObject(target, `coins.targets[${index}]`), `coins.targets[${index}]`)
            )),
        },
        obstacles: parseObstacles(content.obstacles),
        camera: {
            backDistance: requirePositiveNumber(camera.backDistance, 'camera.backDistance'),
            height: requirePositiveNumber(camera.height, 'camera.height'),
            lookAhead: requireNonNegativeNumber(camera.lookAhead, 'camera.lookAhead'),
            lookHeight: requireNumber(camera.lookHeight, 'camera.lookHeight'),
        },
    };

    const spawnIds = [
        definition.coins.player.id,
        ...definition.coins.targets.map((target) => target.id),
    ];
    if (new Set(spawnIds).size !== spawnIds.length) {
        throw new Error('玩家硬币和目标硬币的 id 不能重复。');
    }
    if (definition.coins.targets.length === 0) {
        throw new Error('玩法内容至少需要一枚目标硬币。');
    }

    return definition;
}

function parseCoinSpawn(value: Record<string, unknown>, path: string): CoinSpawnDefinition {
    return {
        id: requireNonEmptyString(value.id, `${path}.id`),
        position: requireVec3(value.position, `${path}.position`),
    };
}

function parseObstacles(value: unknown): ObstacleDefinition {
    const obstacles = requireObject(value, 'obstacles');
    const mode = requireNonEmptyString(obstacles.mode, 'obstacles.mode');
    if (mode === 'random') {
        const minCount = requireInteger(obstacles.minCount, 'obstacles.minCount');
        const maxCount = requireInteger(obstacles.maxCount, 'obstacles.maxCount');
        if (minCount < 0 || maxCount < minCount) {
            throw new Error('obstacles 的数量范围必须满足 0 <= minCount <= maxCount。');
        }

        return {
            mode,
            prefabId: requireNonEmptyString(obstacles.prefabId, 'obstacles.prefabId'),
            minCount,
            maxCount,
            radiusRange: requireIncreasingPair(obstacles.radiusRange, 'obstacles.radiusRange'),
            heightRange: requireIncreasingPair(obstacles.heightRange, 'obstacles.heightRange'),
            tableEdgePadding: requireNonNegativeNumber(obstacles.tableEdgePadding, 'obstacles.tableEdgePadding'),
            coinClearance: requireNonNegativeNumber(obstacles.coinClearance, 'obstacles.coinClearance'),
            obstacleClearance: requireNonNegativeNumber(obstacles.obstacleClearance, 'obstacles.obstacleClearance'),
            placementAttempts: requirePositiveInteger(obstacles.placementAttempts, 'obstacles.placementAttempts'),
        };
    }

    if (mode === 'fixed') {
        return {
            mode,
            placements: requireArray(obstacles.placements, 'obstacles.placements').map((placement, index) => {
                const item = requireObject(placement, `obstacles.placements[${index}]`);
                return {
                    id: requireNonEmptyString(item.id, `obstacles.placements[${index}].id`),
                    prefabId: requireNonEmptyString(item.prefabId, `obstacles.placements[${index}].prefabId`),
                    position: requireVec3(item.position, `obstacles.placements[${index}].position`),
                    scale: requirePositiveVec3(item.scale, `obstacles.placements[${index}].scale`),
                    rotationY: requireNumber(item.rotationY, `obstacles.placements[${index}].rotationY`),
                };
            }),
        };
    }

    throw new Error('obstacles.mode 只允许 random 或 fixed。');
}

function requireSchemaVersion(value: Record<string, unknown>): void {
    if (value.schemaVersion !== 1) {
        throw new Error(`不支持的 schemaVersion：${String(value.schemaVersion)}，当前只支持 1。`);
    }
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${path} 必须是对象。`);
    }
    return value as Record<string, unknown>;
}

function requireArray(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} 必须是数组。`);
    }
    return value;
}

function requireNonEmptyString(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${path} 必须是非空字符串。`);
    }
    return value.trim();
}

function requireNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${path} 必须是有限数字。`);
    }
    return value;
}

function requirePositiveNumber(value: unknown, path: string): number {
    const number = requireNumber(value, path);
    if (number <= 0) throw new Error(`${path} 必须大于 0。`);
    return number;
}

function requireNonNegativeNumber(value: unknown, path: string): number {
    const number = requireNumber(value, path);
    if (number < 0) throw new Error(`${path} 不能小于 0。`);
    return number;
}

function requireInteger(value: unknown, path: string): number {
    const number = requireNumber(value, path);
    if (!Number.isInteger(number)) throw new Error(`${path} 必须是整数。`);
    return number;
}

function requirePositiveInteger(value: unknown, path: string): number {
    const number = requireInteger(value, path);
    if (number <= 0) throw new Error(`${path} 必须大于 0。`);
    return number;
}

function requireVec3(value: unknown, path: string): Vec3Tuple {
    const items = requireArray(value, path);
    if (items.length !== 3) throw new Error(`${path} 必须包含 3 个数字。`);
    return [
        requireNumber(items[0], `${path}[0]`),
        requireNumber(items[1], `${path}[1]`),
        requireNumber(items[2], `${path}[2]`),
    ];
}

function requirePositiveVec3(value: unknown, path: string): Vec3Tuple {
    const items = requireVec3(value, path);
    items.forEach((item, index) => {
        if (item <= 0) throw new Error(`${path}[${index}] 必须大于 0。`);
    });
    return items;
}

function requireIncreasingPair(value: unknown, path: string): [number, number] {
    const items = requireArray(value, path);
    if (items.length !== 2) throw new Error(`${path} 必须包含最小值和最大值。`);
    const minimum = requirePositiveNumber(items[0], `${path}[0]`);
    const maximum = requirePositiveNumber(items[1], `${path}[1]`);
    if (maximum < minimum) throw new Error(`${path} 的最大值不能小于最小值。`);
    return [minimum, maximum];
}
