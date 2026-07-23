# Prefab 与关卡配置说明

基础玩法已经拆成“共享资产 + 关卡数据”两层。关卡不再复制桌面、硬币和黑龙模型，而是通过配置引用共享 Prefab。

## 共享 Prefab

共享 Prefab 位于 `assets/resources/game/prefabs/`：

- `TablePurpleRound.prefab`：紫色圆桌、静态刚体和桌面碰撞体。
- `GoldCoin.prefab`：金币模型、金币正面、动态刚体和圆柱碰撞体。
- `DragonColumn.prefab`：黑龙模型、静态刚体和完整圆柱碰撞体。

`assets/resources/game/asset_catalog.json` 为这些 Prefab 提供稳定的资产 ID。关卡配置只引用 ID，不直接依赖具体文件路径；以后移动或替换 Prefab 时，只需修改资产目录。

## 新建关卡

1. 复制 `assets/resources/game/levels/level_001.json`，例如命名为 `level_002.json`。
2. 修改新文件中的 `id`、`displayName`、硬币位置、障碍物和镜头参数。
3. 在 `Main.scene` 的 `GameRoot` 节点上，将 `levelResourcePath` 改为 `game/levels/level_002`。
4. 不要填写 `.json` 扩展名，也不要删除 Cocos 自动生成的 `.meta` 文件。

当前 `Main.scene/EditorPreview` 仅用于编辑器内直观看到桌面、硬币和障碍物。游戏启动时会自动移除它，并完全按照关卡配置实例化共享 Prefab，因此关卡配置才是运行时的最终数据。

## 关卡结构

- `table`：桌面 Prefab、位置、缩放和有效半径。
- `coins`：硬币 Prefab、统一尺寸、玩家硬币位置和目标硬币列表。
- `obstacles`：支持随机布局或固定布局。
- `camera`：跟随镜头距离、高度和看向位置。

随机障碍物使用 `"mode": "random"`，可以设置数量范围、半径、高度、桌边安全距离和硬币安全距离。

固定障碍物使用以下结构：

```json
{
  "mode": "fixed",
  "placements": [
    {
      "id": "dragon_1",
      "prefabId": "obstacle.dragon-column",
      "position": [0, 2, 0],
      "scale": [3, 2, 3],
      "rotationY": 0
    }
  ]
}
```

## 校验与安全

游戏会在加载时校验配置版本、必填字段、数字范围、硬币 ID 和障碍物模式。配置错误时不会静默生成错误关卡，而会在控制台输出具体原因。

基础玩法重构前的可回退版本保存在 Git 标签 `core-gameplay-v1`。
