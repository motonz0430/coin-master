import type {
    FixedObstacleDefinition,
    GameplayDefinition,
} from '../../gameplay/GameplayConfig';
import { parseGameplayDefinition } from '../../gameplay/GameplayConfig';
import { loadJsonData } from '../../gameplay/PrefabAssetLibrary';

export interface CampaignLevelDefinition extends GameplayDefinition {
    readonly contentType: 'campaign-level';
    readonly startingLives: number;
    readonly obstacles: FixedObstacleDefinition;
}

export async function loadCampaignLevelDefinition(
    resourcePath: string,
): Promise<CampaignLevelDefinition> {
    return parseCampaignLevelDefinition(await loadJsonData(resourcePath));
}

export function parseCampaignLevelDefinition(value: unknown): CampaignLevelDefinition {
    const definition = parseGameplayDefinition(value, 'campaign-level');
    const rawLevel = requireObject(value, '闯关关卡配置');
    const startingLives = requirePositiveInteger(rawLevel.startingLives, 'startingLives');
    if (startingLives > 99) {
        throw new Error('startingLives 不能大于 99。');
    }
    if (definition.obstacles.mode !== 'fixed') {
        throw new Error('闯关模式的黑龙必须使用 fixed 布局，不能使用随机位置。');
    }

    const obstacleIds = definition.obstacles.placements.map((placement) => placement.id);
    if (new Set(obstacleIds).size !== obstacleIds.length) {
        throw new Error('闯关模式的黑龙 id 不能重复。');
    }

    return {
        ...definition,
        contentType: 'campaign-level',
        startingLives,
        obstacles: definition.obstacles,
    };
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${path} 必须是对象。`);
    }
    return value as Record<string, unknown>;
}

function requirePositiveInteger(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new Error(`${path} 必须是大于 0 的整数。`);
    }
    return value;
}
