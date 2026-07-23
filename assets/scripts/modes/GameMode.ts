import type { GameplayContentType } from '../gameplay/GameplayConfig';

export enum GameMode {
    SANDBOX = 0,
    CAMPAIGN = 1,
}

export interface GameplayContentRequest {
    readonly mode: GameMode;
    readonly modeName: string;
    readonly resourcePath: string;
    readonly contentType: GameplayContentType;
}

const SANDBOX_SETUP_ROOT = 'game/setups/';
const CAMPAIGN_LEVEL_ROOT = 'game/modes/campaign/levels/';

export function resolveGameplayContent(
    mode: GameMode,
    sandboxSetupResourcePath: string,
    campaignLevelResourcePath: string,
): GameplayContentRequest {
    if (mode === GameMode.SANDBOX) {
        const resourcePath = requirePathWithin(
            sandboxSetupResourcePath,
            SANDBOX_SETUP_ROOT,
            '基础玩法样板',
        );
        return {
            mode,
            modeName: '基础玩法测试',
            resourcePath,
            contentType: 'sandbox-setup',
        };
    }

    if (mode === GameMode.CAMPAIGN) {
        const resourcePath = requirePathWithin(
            campaignLevelResourcePath,
            CAMPAIGN_LEVEL_ROOT,
            '闯关模式关卡',
        );
        return {
            mode,
            modeName: '闯关模式',
            resourcePath,
            contentType: 'campaign-level',
        };
    }

    throw new Error(`不支持的游戏模式：${String(mode)}`);
}

function requirePathWithin(value: string, root: string, label: string): string {
    const resourcePath = value.trim();
    if (!resourcePath) {
        throw new Error(`${label}尚未指定资源路径。`);
    }
    if (resourcePath.includes('..') || resourcePath.includes('\\')) {
        throw new Error(`${label}路径不能包含上级目录或反斜杠。`);
    }
    if (!resourcePath.startsWith(root) || resourcePath === root.slice(0, -1)) {
        throw new Error(`${label}只能加载 ${root} 目录内的配置。`);
    }
    return resourcePath;
}
