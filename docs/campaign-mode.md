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
```

`campaign/levels/` 目前刻意留空。真正的 `level_001.json` 应在明确第一关的生命值、硬币位置和黑龙位置后创建，不能从基础测试样板直接改名冒充。

## 闯关模式规则

每次松开蓄力区发射玩家硬币，视为一次独立判定：

1. 只有玩家硬币直接碰到目标硬币才算命中；目标硬币之间的连锁碰撞不算。
2. 本次发射未命中任何目标时，玩家硬币停止或掉出桌外后扣 1 点生命。
3. 目标被命中后继续参与物理运动，不会在碰撞瞬间消失。
4. 已命中的目标在桌面停止后消失，不扣生命。
5. 已命中的目标掉出桌外后消失，并扣 1 点生命。
6. 生命归零时立即失败。扣生命的判定优先于过关判定，所以最后一枚目标掉落且正好耗尽最后一点生命时，结果为失败。
7. 生命仍有剩余且所有目标都已消失时，闯关成功。
8. 玩家硬币掉落且关卡仍可继续时，会回到本关配置的初始位置。

目标消失特效、失败界面和成功界面尚未制作，运行逻辑已经预留对应回调。

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
