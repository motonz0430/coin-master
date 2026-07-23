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

`campaign/levels/` 目前刻意留空。真正的 `level_001.json` 应在明确第一关的过关目标、失败条件和布局后创建，不能从基础测试样板直接改名冒充。

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
