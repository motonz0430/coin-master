import { Node, Prefab, TextAsset, instantiate, resources } from 'cc';
import type { AssetCatalog } from './LevelConfig';
import { parseAssetCatalog } from './LevelConfig';

const DEFAULT_CATALOG_PATH = 'game/asset_catalog';

export class PrefabAssetLibrary {
    private readonly prefabs = new Map<string, Prefab>();
    private readonly pendingPrefabs = new Map<string, Promise<Prefab>>();

    private constructor(private readonly catalog: AssetCatalog) {}

    public static async create(catalogPath = DEFAULT_CATALOG_PATH): Promise<PrefabAssetLibrary> {
        const data = await loadJsonData(catalogPath);
        return new PrefabAssetLibrary(parseAssetCatalog(data));
    }

    public async preload(assetIds: readonly string[]): Promise<void> {
        const uniqueIds = assetIds.filter((id, index) => assetIds.indexOf(id) === index);
        await Promise.all(uniqueIds.map((id) => this.loadPrefab(id)));
    }

    public instantiate(assetId: string): Node {
        const prefab = this.prefabs.get(assetId);
        if (!prefab) {
            throw new Error(`Prefab ${assetId} 尚未预加载。`);
        }
        return instantiate(prefab);
    }

    private async loadPrefab(assetId: string): Promise<Prefab> {
        const cached = this.prefabs.get(assetId);
        if (cached) return cached;

        const pending = this.pendingPrefabs.get(assetId);
        if (pending) return pending;

        const resourcePath = this.catalog.assets[assetId];
        if (!resourcePath) {
            throw new Error(`资产目录中不存在 Prefab ID：${assetId}`);
        }

        const request = loadPrefabAsset(resourcePath).then(
            (prefab) => {
                this.prefabs.set(assetId, prefab);
                this.pendingPrefabs.delete(assetId);
                return prefab;
            },
            (error: unknown) => {
                this.pendingPrefabs.delete(assetId);
                throw error;
            },
        );
        this.pendingPrefabs.set(assetId, request);
        return request;
    }
}

export function loadJsonData(resourcePath: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        resources.load(resourcePath, TextAsset, (error, asset) => {
            if (error || !asset) {
                reject(new Error(`无法加载 JSON 资源 ${resourcePath}：${error?.message ?? '未知错误'}`));
                return;
            }
            try {
                resolve(JSON.parse(asset.text) as unknown);
            } catch (parseError) {
                const message = parseError instanceof Error ? parseError.message : String(parseError);
                reject(new Error(`JSON 资源 ${resourcePath} 格式错误：${message}`));
            }
        });
    });
}

function loadPrefabAsset(resourcePath: string): Promise<Prefab> {
    return new Promise((resolve, reject) => {
        resources.load(resourcePath, Prefab, (error, prefab) => {
            if (error || !prefab) {
                reject(new Error(`无法加载 Prefab ${resourcePath}：${error?.message ?? '未知错误'}`));
                return;
            }
            resolve(prefab);
        });
    });
}
