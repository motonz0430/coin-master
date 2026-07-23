# 游戏模式与闯关关卡说明

项目现在明确区分“基础玩法测试”和“闯关模式”。当前桌面、硬币和随机黑龙布局只是基础玩法样板，不是第一关。

## 模式边界

- `SANDBOX / 基础玩法测试`：供程序、美术和物理参数调试，不参与关卡编号、解锁和通关进度。
- `CAMPAIGN / 闯关模式`：正式关卡、过关目标、失败条件和关卡进度只在此模式内生效。

代码会同时校验配置类型和资源目录：

- 基础玩法样板只能从 `assets/resources/game/setups/` 加载，并使用 `"contentType": "sandbox-setup"`。
- 闯关关卡只能从 `assets/resources/game/modes/campaign/levels/` 加载，并使用 `"contentType": "campaign-level"`。

因此即使误填路径，也不能把基础玩法样板当成正式关卡运行。

## 当前资源结构

```text
assets/resources/game/
├── asset_catalog.json
├── prefabs/
│   ├── TablePurpleRound.prefab
│   ├── GoldCoin.prefab
│   └── DragonColumn.prefab
├── setups/
│   └── core_gameplay.json
└── modes/
    └── campaign/
        └── levels/
            ├── level_001.json
            ├── level_002.json
            ├── level_003.json
            └── level_004.json
```

`campaign/levels/level_001.json` 是正式第一关：3 点生命，玩家硬币位于下方中央，两枚目标硬币分别位于桌面中央和右上方，不包含黑龙障碍物。

`campaign/levels/level_002.json` 是正式第二关：3 点生命，玩家硬币位于下方中央，两枚目标硬币分别位于中上方和右侧；一只固定黑龙位于桌面中央偏下，布局比例来自第二关草图。

`campaign/levels/level_003.json` 是正式第三关：3 点生命，玩家硬币位于下方中央，三枚目标硬币分布在左上、右上和中央偏右；两只固定黑龙分布在桌面中央区域，布局比例来自第三关草图。

`campaign/levels/level_004.json` 是正式第四关：3 点生命，玩家硬币位于右下方，五枚目标硬币分布在上方、左侧、中央、右侧和左下方；四只固定黑龙分布在桌面中央区域，布局比例来自第四关草图。

## 闯关模式规则

每次松开蓄力区发射玩家硬币，视为一次独立判定：

1. 玩家硬币直接碰到目标硬币后，该目标进入命中状态。
2. 已命中的目标继续运动并碰到其他未命中目标时，命中状态会继续向后传递，支持任意层级的连锁命中。
3. 未进入命中状态的目标互相碰撞，不会自行触发命中或消失。
4. 当前控制硬币每次在桌面静止时都会记录安全位置；它直接掉出桌外且关卡仍可继续时扣 1 点生命，并在最后一次安全位置复活。
5. 本次发射未命中任何目标但仍在桌面停止时，沿用基础惩罚并扣 1 点生命，同时把停止点记录为新的安全位置。
6. 命中发生后不会立刻切换控制权，而是等待整条命中链中的硬币全部停止或掉落后统一结算。
7. 命中链中每一枚掉出桌外的目标硬币分别扣 1 点生命。
8. 命中链中若有硬币留在桌面，当前控制硬币消失；按照命中先后顺序，最后一枚仍在桌面的命中硬币成为下一轮控制硬币，其余已命中硬币消失。
9. 命中链中的硬币全部掉出桌外时，保持当前控制硬币；若当前控制硬币也掉落，则回到它最后一次安全位置。
10. 任意硬币越过桌沿后会继续保留约 0.48 秒的物理滑落和翻转过程，再执行消失、复活、扣血及控制权结算。
11. 生命归零时立即失败。所有掉落扣血均优先于过关判定。
12. 生命仍有剩余且所有目标硬币都已完成结算时，闯关成功。

目标消失特效和完整结算界面尚未制作；当前已提供生命值、失败和成功的简单文字反馈。

## 正式关卡配置

闯关关卡在通用玩法配置上额外要求：

- 顶层必须包含 `startingLives`，只允许 `1–99` 的整数。
- `coins.player.position` 配置玩家硬币初始位置。
- `coins.targets` 配置所有目标硬币及其固定位置，硬币 ID 不得重复。
- `obstacles.mode` 必须为 `fixed`。
- `obstacles.placements` 配置每一条黑龙的位置、缩放和 Y 轴旋转，黑龙 ID 不得重复。

关键字段示例：

```json
{
  "schemaVersion": 1,
  "contentType": "campaign-level",
  "id": "level_001",
  "displayName": "第一关",
  "startingLives": 3,
  "coins": {
    "player": {
      "id": "player",
      "position": [0, 0.74, 20]
    },
    "targets": [
      {
        "id": "target-01",
        "position": [0, 0.74, -2]
      }
    ]
  },
  "obstacles": {
    "mode": "fixed",
    "placements": []
  }
}
```

示例省略了桌面、Prefab、硬币尺寸和镜头等通用必填字段；正式文件必须保留完整结构。

## 在 Main.scene 中切换

`GameRoot` 组件包含以下字段：

- `gameMode`：`SANDBOX` 或 `CAMPAIGN`。
- `sandboxSetupResourcePath`：默认指向 `game/setups/core_gameplay`。
- `campaignLevelResourcePath`：选择闯关模式时，填写对应关卡路径，例如 `game/modes/campaign/levels/level_001`。

路径不填写 `.json` 扩展名。

`Main.scene/EditorPreview` 只用于编辑器可视化。运行时会移除预览，并按当前模式的配置实例化共享 Prefab。

## 共享 Prefab

- `TablePurpleRound.prefab`：桌面模型、静态刚体和碰撞体。
- `GoldCoin.prefab`：金币模型、动态刚体和碰撞体。
- `DragonColumn.prefab`：黑龙模型、静态刚体和完整碰撞体。

关卡只通过 `asset_catalog.json` 中的稳定资产 ID 引用 Prefab。

## 安全与回退

配置加载时会检查类型、目录、版本、必填字段、数字范围、硬币 ID 和障碍物规则。基础玩法重构前的版本保存在 Git 标签 `core-gameplay-v1`。
