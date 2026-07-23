import {
    _decorator,
    Camera,
    Canvas,
    Color,
    Component,
    CylinderCollider,
    DirectionalLight,
    director,
    ERigidBodyType,
    Enum,
    EventTouch,
    Graphics,
    HorizontalTextAlignment,
    input,
    Input,
    Label,
    Layers,
    Material,
    MeshRenderer,
    Node,
    PhysicsMaterial,
    PhysicsSystem,
    profiler,
    Quat,
    resources,
    RigidBody,
    screen,
    TextAsset,
    Texture2D,
    UITransform,
    Vec3,
    VerticalTextAlignment,
    view,
} from 'cc';
import type { ICollisionEvent } from 'cc';
import {
    CHARGE_CURVE_RESOURCE_PATH,
    createDefaultChargeCurve,
    parseChargeCurveCsv,
    sampleChargeCurve,
} from './ChargeCurveTable';
import type { ChargeCurvePoint } from './ChargeCurveTable';
import { buildGameplay, loadGameplayDefinition } from './gameplay/GameplayBuilder';
import type { CameraDefinition, GameplayDefinition } from './gameplay/GameplayConfig';
import { PrefabAssetLibrary } from './gameplay/PrefabAssetLibrary';
import { GameMode, resolveGameplayContent } from './modes/GameMode';
import {
    loadCampaignLevelDefinition,
} from './modes/campaign/CampaignLevelConfig';
import type { CampaignLevelDefinition } from './modes/campaign/CampaignLevelConfig';
import {
    CampaignSession,
} from './modes/campaign/CampaignSession';
import type {
    CampaignLifeLossReason,
    CampaignOutcome,
    CampaignShotResult,
    CampaignTargetResolution,
} from './modes/campaign/CampaignSession';

const { ccclass, property } = _decorator;

// Cocos Creator 3.8.8 does not publicly export these two engine enums from `cc`.
// Their serialized values are stable: ShadowMap = 1, SOFT_2X = 2.
const SHADOW_TYPE_MAP = 1;
const SHADOW_PCF_SOFT_2X = 2;
const WORLD_SCALE = 5;
const SHOT_MINIMUM_SECONDS = 0.12;
const TARGET_SETTLE_SECONDS = 0.3;
const TARGET_SETTLE_SPEED = 0.08 * WORLD_SCALE;
const COIN_FALL_PRESENTATION_SECONDS = 0.48;

type GestureMode = 'none' | 'camera' | 'charge';

interface CampaignTargetRuntime {
    readonly id: string;
    readonly node: Node;
    readonly body: RigidBody;
    readonly collider: CylinderCollider;
    hitElapsed: number;
    settledElapsed: number;
    resolved: boolean;
    resolution: CampaignTargetResolution | null;
}

interface CoinBodyRuntime {
    readonly node: Node;
    readonly body: RigidBody;
    isFalling: boolean;
    fallElapsed: number;
}

/**
 * 《羊蹄山之魂》式弹钱币操作原型。
 *
 * - Main.scene 只保存摄像机、灯光和可视化编辑预览。
 * - 桌面、硬币和障碍物由玩法内容配置从共享 Prefab 资产库生成。
 * - 基础玩法样板用于开发测试；所有正式关卡只属于闯关模式。
 * - 玩家只控制黄色硬币。
 * - 屏幕主体左右拖拽，镜头围绕玩家硬币旋转。
 * - 镜头正前方就是硬币发射方向。
 * - 屏幕底部热区负责长按蓄力，松手发射。
 * - 硬币在桌面上滑动和碰撞，越过无围挡的圆桌边缘后会受重力掉落。
 */
@ccclass('CoinFlickPrototype')
export class CoinFlickPrototype extends Component {
    @property({ tooltip: '横向拖满整个屏幕时旋转的角度' })
    public cameraDragDegreesPerScreen = 72;

    @property({ tooltip: '底部蓄力热区占屏幕高度的比例' })
    public chargeZoneHeightRatio = 0.19;

    @property({ type: Enum(GameMode), tooltip: '当前启动的游戏模式' })
    public gameMode = GameMode.SANDBOX;

    @property({ tooltip: '基础玩法测试样板路径，不包含扩展名' })
    public sandboxSetupResourcePath = 'game/setups/core_gameplay';

    @property({ tooltip: '闯关模式的当前关卡路径；正式关卡只能位于 campaign/levels 下' })
    public campaignLevelResourcePath = '';

    private coinRadius = 0.336 * WORLD_SCALE;
    private coinHeight = 0.048 * WORLD_SCALE;
    private tableRadius = 5.72 * WORLD_SCALE;
    private cameraDefinition: CameraDefinition = {
        backDistance: 6.2 * WORLD_SCALE,
        height: 8.4 * WORLD_SCALE,
        lookAhead: 2.65 * WORLD_SCALE,
        lookHeight: 0.05 * WORLD_SCALE,
    };

    private camera: Camera | null = null;
    private table: Node | null = null;
    private playerCoin: Node | null = null;
    private chargeGraphics: Graphics | null = null;
    private chargeLabel: Label | null = null;
    private campaignLivesLabel: Label | null = null;
    private campaignOutcomeLabel: Label | null = null;

    private cameraYawDegrees = 0;
    private lastDragX = 0;
    private gestureMode: GestureMode = 'none';
    private isCharging = false;
    private chargeSeconds = 0;
    private chargeCurvePoints: ChargeCurvePoint[] = createDefaultChargeCurve();
    private maxChargeSeconds = this.chargeCurvePoints[this.chargeCurvePoints.length - 1].seconds;
    private materials = new Map<string, Material>();
    private obstacles: Node[] = [];
    private coinBodies: CoinBodyRuntime[] = [];
    private campaignSession: CampaignSession | null = null;
    private campaignTargets: CampaignTargetRuntime[] = [];
    private campaignPlayerCollider: CylinderCollider | null = null;
    private campaignShotElapsed = 0;
    private readonly campaignPlayerSafePosition = new Vec3();

    protected start(): void {
        profiler.hideStats();
        const physicsSystem = PhysicsSystem.instance;
        physicsSystem.fixedTimeStep = 1 / 120;
        physicsSystem.maxSubSteps = 4;
        // Keep motion timing visually identical after enlarging every gameplay
        // distance. Gravity, launch velocity and velocity thresholds must scale
        // with the world; dimensionless material and damping values stay intact.
        physicsSystem.gravity = new Vec3(0, -9.8 * WORLD_SCALE, 0);
        this.loadChargeCurveTable();

        this.bindBootstrapScene();
        this.createUserInterface();
        this.updateCameraRig();
        void this.loadSelectedGameplay();

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }

    protected onDestroy(): void {
        this.teardownCampaignRules();
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }

    protected update(deltaTime: number): void {
        if (!this.isCharging) return;

        this.chargeSeconds = Math.min(this.maxChargeSeconds, this.chargeSeconds + deltaTime);
        this.redrawChargeZone();
    }

    protected lateUpdate(deltaTime: number): void {
        this.updateCoinFallRotation(deltaTime);
        this.updateCampaignRules(deltaTime);
        this.updateCameraRig();
    }

    private bindBootstrapScene(): void {
        const cameraNode = this.requireSceneNode('MainCamera');
        const camera = cameraNode.getComponent(Camera) ?? cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.PERSPECTIVE;
        camera.fov = 42;
        camera.near = 0.1 * WORLD_SCALE;
        camera.far = 100 * WORLD_SCALE;
        camera.clearColor = new Color(25, 31, 38, 255);
        this.camera = camera;

        const lightNode = this.requireSceneNode('KeyLight');
        lightNode.setPosition(0, 8 * WORLD_SCALE, 0);
        lightNode.setRotationFromEuler(-48, -35, 0);
        const light = lightNode.getComponent(DirectionalLight) ?? lightNode.addComponent(DirectionalLight);
        light.color = new Color(255, 226, 190, 255);
        light.illuminance = 72000;
        light.shadowEnabled = true;
        light.shadowPcf = SHADOW_PCF_SOFT_2X;
        light.shadowBias = 0.0008;
        light.shadowNormalBias = 0.018 * WORLD_SCALE;
        light.shadowSaturation = 0.9;
        light.shadowFixedArea = true;
        light.shadowNear = 0.1 * WORLD_SCALE;
        light.shadowFar = 20 * WORLD_SCALE;
        light.shadowOrthoSize = 7.2 * WORLD_SCALE;
    }

    private async loadSelectedGameplay(): Promise<void> {
        try {
            const request = resolveGameplayContent(
                this.gameMode,
                this.sandboxSetupResourcePath,
                this.campaignLevelResourcePath,
            );
            const definitionRequest = request.mode === GameMode.CAMPAIGN
                ? loadCampaignLevelDefinition(request.resourcePath)
                : loadGameplayDefinition(request.resourcePath, request.contentType);
            const [definition, library] = await Promise.all([
                definitionRequest,
                PrefabAssetLibrary.create(),
            ]);
            const builtGameplay = await buildGameplay(this.node, definition, library);
            this.applyGameplayDefinition(definition);
            this.table = builtGameplay.table;
            this.playerCoin = builtGameplay.playerCoin;
            this.obstacles = [...builtGameplay.obstacles];

            this.configureScenePhysics(builtGameplay.targetCoins);
            this.applySceneMaterials(builtGameplay.targetCoins);
            this.configureLightingAndShadows(builtGameplay.targetCoins);
            if (request.mode === GameMode.CAMPAIGN) {
                this.configureCampaignRules(
                    definition as CampaignLevelDefinition,
                    builtGameplay.targetCoins,
                );
            } else {
                this.teardownCampaignRules();
            }
            this.updateCameraRig();
            console.info(
                `[${request.modeName}] 已从 Prefab 资产库载入 ${definition.id}：${definition.displayName}`,
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[游戏模式] 内容加载失败：${message}`);
        }
    }

    private applyGameplayDefinition(definition: GameplayDefinition): void {
        this.coinRadius = definition.coins.radius;
        this.coinHeight = definition.coins.height;
        this.tableRadius = definition.table.radius;
        this.cameraDefinition = definition.camera;
    }

    private configureScenePhysics(targetCoins: readonly Node[]): void {
        if (!this.table || !this.playerCoin) {
            throw new Error('玩法内容构建完成后缺少桌面或玩家硬币。');
        }

        const tableBody = this.table.getComponent(RigidBody) ?? this.table.addComponent(RigidBody);
        tableBody.type = ERigidBodyType.STATIC;
        tableBody.useGravity = false;
        const tableCollider = this.table.getComponent(CylinderCollider) ?? this.table.addComponent(CylinderCollider);
        tableCollider.radius = 0.5;
        tableCollider.height = 2;
        tableCollider.material = this.createPhysicsMaterial(0.45, 0.05);

        this.coinBodies = [];
        this.configureCoinPhysics(this.playerCoin);
        targetCoins.forEach((coin) => this.configureCoinPhysics(coin));
        this.obstacles.forEach((obstacle) => this.configureObstaclePhysics(obstacle));
    }

    private configureCoinPhysics(coin: Node): void {
        const body = coin.getComponent(RigidBody) ?? coin.addComponent(RigidBody);
        body.type = ERigidBodyType.DYNAMIC;
        body.mass = 1;
        body.useGravity = true;
        body.linearDamping = 0.62;
        body.angularDamping = 0.9;
        body.linearFactor = Vec3.ONE;
        body.angularFactor = Vec3.ZERO;

        const collider = coin.getComponent(CylinderCollider) ?? coin.addComponent(CylinderCollider);
        collider.center = Vec3.ZERO;
        collider.radius = 0.5;
        collider.height = 2;
        collider.material = this.createPhysicsMaterial(0.16, 0.72);

        // In the 5x world the coin is 0.24 units thick, so its 0.12 half-height
        // safely contains Bullet's fixed 0.1-unit CCD swept-sphere radius.
        // Keep 120 Hz stepping as an independent safety layer for fast impacts.
        body.useCCD = true;

        this.coinBodies.push({
            node: coin,
            body,
            isFalling: false,
            fallElapsed: 0,
        });
    }

    private configureObstaclePhysics(obstacle: Node): void {
        const body = obstacle.getComponent(RigidBody) ?? obstacle.addComponent(RigidBody);
        body.type = ERigidBodyType.STATIC;
        body.useGravity = false;

        const collider = obstacle.getComponent(CylinderCollider) ?? obstacle.addComponent(CylinderCollider);
        collider.center = Vec3.ZERO;
        collider.radius = 0.5;
        collider.height = 2;
        collider.material = this.createPhysicsMaterial(0.2, 0.78);
    }

    private updateCoinFallRotation(deltaTime: number): void {
        for (const coin of this.coinBodies) {
            if (coin.isFalling) {
                coin.fallElapsed += deltaTime;
                continue;
            }

            if (!this.hasCoinLeftTable(coin.node)) continue;

            coin.isFalling = true;
            coin.fallElapsed = 0;
            coin.body.angularFactor = Vec3.ONE;
            coin.body.wakeUp();

            const velocity = new Vec3();
            coin.body.getLinearVelocity(velocity);
            const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
            const minimumFallSpeed = 0.1 * WORLD_SCALE;
            const inverseSpeed = horizontalSpeed > minimumFallSpeed ? 1 / horizontalSpeed : 0;
            const tiltX = horizontalSpeed > minimumFallSpeed ? velocity.z * inverseSpeed : 0.82;
            const tiltZ = horizontalSpeed > minimumFallSpeed ? -velocity.x * inverseSpeed : 0.57;
            const flipSpeed = 4.5 + Math.min(3, horizontalSpeed * 0.5 / WORLD_SCALE);

            coin.body.setAngularVelocity(new Vec3(
                tiltX * flipSpeed,
                0.7,
                tiltZ * flipSpeed,
            ));
        }
    }

    private applySceneMaterials(targetCoins: readonly Node[]): void {
        if (!this.table || !this.playerCoin) return;

        // Prefer materials embedded in the shared Prefab and only create a
        // fallback if an asset was accidentally detached in the editor.
        const tableRenderer = this.table.getComponent(MeshRenderer);
        const tableMaterial = tableRenderer?.getMaterialInstance(0);
        if (tableMaterial) {
            this.applyTableTexture(tableMaterial);
        } else {
            const fallback = this.getMaterial('table', new Color(255, 255, 255, 255), 0.12, 0.72);
            tableRenderer?.setSharedMaterial(fallback, 0);
            this.applyTableTexture(fallback);
        }

        const goldEdge = this.getMaterial('gold-edge', new Color(222, 168, 38, 255), 0.72, 0.3);
        [this.playerCoin, ...targetCoins].forEach((coin) => {
            const renderer = coin.getComponent(MeshRenderer);
            if (!renderer?.getSharedMaterial(0)) renderer?.setSharedMaterial(goldEdge, 0);
        });
    }

    private applyTableTexture(material: Material): void {
        resources.load('textures/fantasy-table-purple/texture/texture', Texture2D, (error, texture) => {
            if (error) {
                console.warn('无法载入烟紫黑曜石桌面贴图', error);
                return;
            }

            material.recompileShaders({ USE_ALBEDO_MAP: true });
            // `mainTexture` is the public property name of Cocos 3.8.8's
            // legacy/standard material; it maps internally to albedoMap.
            material.setProperty('mainTexture', texture);
        });
    }

    private configureLightingAndShadows(targetCoins: readonly Node[]): void {
        const scene = director.getScene();
        if (scene) {
            const shadows = scene.globals.shadows;
            // Cocos must be enabled before selecting ShadowMap; otherwise the
            // type setter silently resolves to its internal disabled mode.
            shadows.enabled = true;
            shadows.type = SHADOW_TYPE_MAP;
            shadows.shadowMapSize = 1024;
            shadows.maxReceived = 4;

            const ambient = scene.globals.ambient;
            ambient.skyLightingColor = new Color(82, 106, 142, 255);
            ambient.groundLightingColor = new Color(35, 43, 55, 255);
            ambient.skyIllum = 10000;
        }

        if (this.table) this.configureNodeShadows(this.table, false, true);
        if (this.playerCoin) this.configureNodeShadows(this.playerCoin, true, true);
        targetCoins.forEach((coin) => this.configureNodeShadows(coin, true, true));
        this.obstacles.forEach((obstacle) => this.configureNodeShadows(obstacle, true, true));
    }

    private configureNodeShadows(node: Node, castShadow: boolean, receiveShadow: boolean): void {
        node.getComponentsInChildren(MeshRenderer).forEach((renderer) => {
            if (!renderer.enabled) return;
            renderer.shadowCastingModeForInspector = castShadow;
            renderer.receiveShadowForInspector = receiveShadow;
            renderer.shadowBias = 0.00015;
            renderer.shadowNormalBias = 0.006 * WORLD_SCALE;
        });
    }

    private requireSceneNode(name: string): Node {
        const node = this.node.getChildByName(name);
        if (!node) {
            throw new Error(`Main.scene 缺少必要节点：${name}`);
        }
        return node;
    }

    private createUserInterface(): void {
        const uiLayer = Layers.Enum.UI_2D;
        const visibleSize = view.getVisibleSize();

        const canvasNode = new Node('GameUI');
        canvasNode.layer = uiLayer;
        this.node.addChild(canvasNode);
        canvasNode.addComponent(UITransform).setContentSize(visibleSize.width, visibleSize.height);

        const uiCameraNode = new Node('UICamera');
        uiCameraNode.layer = uiLayer;
        canvasNode.addChild(uiCameraNode);
        const uiCamera = uiCameraNode.addComponent(Camera);
        uiCamera.projection = Camera.ProjectionType.ORTHO;
        uiCamera.priority = 10;
        uiCamera.visibility = uiLayer;
        uiCamera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;

        const canvas = canvasNode.addComponent(Canvas);
        canvas.cameraComponent = uiCamera;
        canvas.alignCanvasWithScreen = true;

        const helpNode = new Node('CameraHelp');
        helpNode.layer = uiLayer;
        helpNode.setPosition(0, visibleSize.height * 0.5 - 96, 0);
        canvasNode.addChild(helpNode);
        helpNode.addComponent(UITransform).setContentSize(visibleSize.width - 48, 56);
        const helpLabel = helpNode.addComponent(Label);
        helpLabel.string = '左右拖拽调整朝向';
        helpLabel.fontSize = 28;
        helpLabel.lineHeight = 34;
        helpLabel.color = new Color(235, 240, 242, 230);
        helpLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        helpLabel.verticalAlign = VerticalTextAlignment.CENTER;

        const livesNode = new Node('CampaignLives');
        livesNode.layer = uiLayer;
        livesNode.setPosition(0, visibleSize.height * 0.5 - 48, 0);
        canvasNode.addChild(livesNode);
        livesNode.addComponent(UITransform).setContentSize(visibleSize.width - 48, 48);
        this.campaignLivesLabel = livesNode.addComponent(Label);
        this.campaignLivesLabel.string = '';
        this.campaignLivesLabel.fontSize = 30;
        this.campaignLivesLabel.lineHeight = 38;
        this.campaignLivesLabel.color = new Color(255, 224, 130, 255);
        this.campaignLivesLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        this.campaignLivesLabel.verticalAlign = VerticalTextAlignment.CENTER;

        const outcomeNode = new Node('CampaignOutcome');
        outcomeNode.layer = uiLayer;
        outcomeNode.setPosition(0, visibleSize.height * 0.18, 0);
        canvasNode.addChild(outcomeNode);
        outcomeNode.addComponent(UITransform).setContentSize(visibleSize.width - 64, 72);
        this.campaignOutcomeLabel = outcomeNode.addComponent(Label);
        this.campaignOutcomeLabel.string = '';
        this.campaignOutcomeLabel.fontSize = 46;
        this.campaignOutcomeLabel.lineHeight = 56;
        this.campaignOutcomeLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        this.campaignOutcomeLabel.verticalAlign = VerticalTextAlignment.CENTER;

        const zoneDiameter = Math.min(196, visibleSize.width * 0.29);
        const zoneNode = new Node('ChargeZone');
        zoneNode.layer = uiLayer;
        zoneNode.setPosition(0, -visibleSize.height * 0.5 + zoneDiameter * 0.66, 0);
        canvasNode.addChild(zoneNode);
        zoneNode.addComponent(UITransform).setContentSize(zoneDiameter, zoneDiameter);
        this.chargeGraphics = zoneNode.addComponent(Graphics);

        const labelNode = new Node('ChargeLabel');
        labelNode.layer = uiLayer;
        zoneNode.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(zoneDiameter - 24, zoneDiameter - 24);
        this.chargeLabel = labelNode.addComponent(Label);
        this.chargeLabel.fontSize = 28;
        this.chargeLabel.lineHeight = 34;
        this.chargeLabel.color = new Color(255, 255, 255, 255);
        this.chargeLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        this.chargeLabel.verticalAlign = VerticalTextAlignment.CENTER;

        this.redrawChargeZone();
    }

    private onTouchStart(event: EventTouch): void {
        if (this.gestureMode !== 'none') return;

        const location = event.getLocation();
        if (this.isInsideChargeZone(location.x, location.y)) {
            if (!this.playerCoin) return;
            const body = this.playerCoin.getComponent(RigidBody);
            if (!body || !this.isBodyNearlyStopped(body)) return;
            if (this.campaignSession && !this.campaignSession.canStartShot) return;

            this.gestureMode = 'charge';
            this.isCharging = true;
            this.chargeSeconds = 0;
            this.redrawChargeZone();
            return;
        }

        this.gestureMode = 'camera';
        this.lastDragX = location.x;
    }

    private onTouchMove(event: EventTouch): void {
        if (this.gestureMode !== 'camera') return;

        const currentX = event.getLocation().x;
        const deltaX = currentX - this.lastDragX;
        this.lastDragX = currentX;

        const screenWidth = Math.max(1, screen.windowSize.width);
        this.cameraYawDegrees -= deltaX / screenWidth * this.cameraDragDegreesPerScreen;
    }

    private onTouchEnd(): void {
        if (this.gestureMode === 'charge' && this.isCharging) {
            this.launchPlayerCoin();
        }
        this.gestureMode = 'none';
    }

    private onTouchCancel(): void {
        this.gestureMode = 'none';
        this.isCharging = false;
        this.chargeSeconds = 0;
        this.redrawChargeZone();
    }

    private launchPlayerCoin(): void {
        if (!this.playerCoin) return;

        const body = this.playerCoin.getComponent(RigidBody);
        if (!body) return;
        if (this.campaignSession && !this.campaignSession.beginShot()) return;
        this.campaignShotElapsed = 0;

        // The designer table remains in readable logical values (1–10). Scaling
        // only the applied impulse preserves the original motion time and framing.
        const impulse = this.calculateChargeImpulse(this.chargeSeconds) * WORLD_SCALE;
        const direction = this.getLaunchDirection(new Vec3());

        body.wakeUp();
        body.applyImpulse(direction.multiplyScalar(impulse));
        this.isCharging = false;
        this.chargeSeconds = 0;
        this.redrawChargeZone();
    }

    private calculateChargeImpulse(chargeSeconds: number): number {
        return sampleChargeCurve(this.chargeCurvePoints, chargeSeconds);
    }

    private loadChargeCurveTable(): void {
        resources.load(CHARGE_CURVE_RESOURCE_PATH, TextAsset, (error, table) => {
            if (error) {
                console.error(`[蓄力配表] 无法加载配表，继续使用内置安全曲线：${error.message}`);
                return;
            }

            try {
                const points = parseChargeCurveCsv(table.text);
                this.chargeCurvePoints = points;
                this.maxChargeSeconds = points[points.length - 1].seconds;
                console.info(
                    `[蓄力配表] 已加载 ${points.length} 个数值点，最大蓄力时间 ${this.maxChargeSeconds.toFixed(1)} 秒。`,
                );
            } catch (parseError) {
                const message = parseError instanceof Error ? parseError.message : String(parseError);
                console.error(`[蓄力配表] 配表校验失败，继续使用内置安全曲线：${message}`);
            }
        });
    }

    private updateCameraRig(): void {
        if (!this.camera || !this.playerCoin) return;

        const forward = this.getLaunchDirection(new Vec3());
        const playerPosition = this.playerCoin.worldPosition;
        const cameraPosition = playerPosition.clone()
            .subtract(forward.clone().multiplyScalar(this.cameraDefinition.backDistance))
            .add3f(0, this.cameraDefinition.height, 0);
        const lookTarget = playerPosition.clone()
            .add(forward.clone().multiplyScalar(this.cameraDefinition.lookAhead))
            .add3f(0, this.cameraDefinition.lookHeight, 0);

        this.camera.node.setWorldPosition(cameraPosition);
        this.camera.node.lookAt(lookTarget, Vec3.UP);
    }

    private redrawChargeZone(): void {
        if (!this.chargeGraphics || !this.chargeLabel) return;

        const transform = this.chargeGraphics.node.getComponent(UITransform);
        if (!transform) return;

        const diameter = Math.min(transform.contentSize.width, transform.contentSize.height);
        const radius = diameter * 0.5 - 7;
        const ratio = this.isCharging
            ? Math.min(1, this.chargeSeconds / this.maxChargeSeconds)
            : 0;

        const flashesPerSecond = 1.6 + ratio * 7.4;
        const pulse = this.isCharging
            ? 0.5 + 0.5 * Math.sin(this.chargeSeconds * flashesPerSecond * Math.PI * 2)
            : 0;

        const graphics = this.chargeGraphics;
        graphics.clear();

        if (this.isCharging) {
            graphics.fillColor = new Color(255, 177, 55, Math.round(36 + pulse * 70));
            graphics.circle(0, 0, radius + 6 + pulse * 8);
            graphics.fill();
        }

        graphics.fillColor = this.isCharging
            ? new Color(92, 53, 20, Math.round(205 + pulse * 40))
            : new Color(23, 28, 35, 220);
        graphics.circle(0, 0, radius);
        graphics.fill();

        graphics.lineWidth = this.isCharging ? 7 + pulse * 5 : 5;
        graphics.strokeColor = this.isCharging
            ? new Color(255, 205, 92, Math.round(190 + pulse * 65))
            : new Color(238, 187, 92, 245);
        graphics.circle(0, 0, radius);
        graphics.stroke();

        this.chargeLabel.string = this.isCharging
            ? '蓄力中\n松开发射'
            : '按住\n蓄力';
    }

    private getLaunchDirection(out: Vec3): Vec3 {
        const radians = this.cameraYawDegrees * Math.PI / 180;
        out.set(Math.sin(radians), 0, -Math.cos(radians));
        return out.normalize();
    }

    private isInsideChargeZone(screenX: number, screenY: number): boolean {
        const centerX = screen.windowSize.width * 0.5;
        const centerY = screen.windowSize.height * this.chargeZoneHeightRatio * 0.52;
        const radius = Math.min(screen.windowSize.width * 0.145, screen.windowSize.height * 0.082);
        const offsetX = screenX - centerX;
        const offsetY = screenY - centerY;
        return offsetX * offsetX + offsetY * offsetY <= radius * radius;
    }

    private isBodyNearlyStopped(body: RigidBody): boolean {
        const velocity = new Vec3();
        body.getLinearVelocity(velocity);
        return velocity.lengthSqr() < 0.05 * WORLD_SCALE * WORLD_SCALE;
    }

    private configureCampaignRules(
        definition: CampaignLevelDefinition,
        targetCoins: readonly Node[],
    ): void {
        this.teardownCampaignRules();
        if (!this.playerCoin) throw new Error('闯关模式缺少玩家硬币。');
        if (targetCoins.length !== definition.coins.targets.length) {
            throw new Error('闯关目标硬币数量与配置不一致。');
        }

        this.campaignTargets = targetCoins.map((node, index) => {
            const body = node.getComponent(RigidBody);
            if (!body) throw new Error(`目标硬币 ${node.name} 缺少刚体。`);
            const collider = node.getComponent(CylinderCollider);
            if (!collider) throw new Error(`目标硬币 ${node.name} 缺少碰撞体。`);
            return {
                id: definition.coins.targets[index].id,
                node,
                body,
                collider,
                hitElapsed: 0,
                settledElapsed: 0,
                resolved: false,
                resolution: null,
            };
        });

        this.campaignPlayerSafePosition.set(...definition.coins.player.position);
        this.campaignSession = new CampaignSession(
            definition.startingLives,
            definition.coins.targets.map((target) => target.id),
            {
                onLivesChanged: (lives, maximum, reason) => (
                    this.onCampaignLivesChanged(lives, maximum, reason)
                ),
                onTargetHit: (targetId) => {
                    console.info(`[闯关模式] 命中目标 ${targetId}，等待停止或掉落判定。`);
                },
                onTargetResolved: (targetId, resolution) => {
                    console.info(`[闯关模式] 目标 ${targetId} 已结算：${resolution}`);
                },
                onOutcomeChanged: (outcome) => this.onCampaignOutcomeChanged(outcome),
            },
        );
        if (this.campaignLivesLabel) {
            this.campaignLivesLabel.string = `生命：${definition.startingLives}/${definition.startingLives}`;
        }
        if (this.campaignOutcomeLabel) {
            this.campaignOutcomeLabel.string = '';
        }

        const playerCollider = this.playerCoin.getComponent(CylinderCollider);
        if (!playerCollider) throw new Error('闯关模式的玩家硬币缺少碰撞体。');
        this.campaignPlayerCollider = playerCollider;
        playerCollider.on('onCollisionEnter', this.onCampaignPlayerCollisionEnter, this);
        this.campaignTargets.forEach((target) => {
            target.collider.on(
                'onCollisionEnter',
                this.onCampaignTargetCollisionEnter,
                this,
            );
        });
        console.info(
            `[闯关模式] 初始生命 ${this.campaignSession.currentLives}，目标 ${this.campaignSession.remainingTargets} 枚。`,
        );
    }

    private teardownCampaignRules(): void {
        this.campaignPlayerCollider?.off(
            'onCollisionEnter',
            this.onCampaignPlayerCollisionEnter,
            this,
        );
        this.campaignTargets.forEach((target) => {
            target.collider.off(
                'onCollisionEnter',
                this.onCampaignTargetCollisionEnter,
                this,
            );
        });
        this.campaignPlayerCollider = null;
        this.campaignSession = null;
        this.campaignTargets = [];
        this.campaignShotElapsed = 0;
        if (this.campaignLivesLabel) {
            this.campaignLivesLabel.string = '';
        }
        if (this.campaignOutcomeLabel) {
            this.campaignOutcomeLabel.string = '';
        }
    }

    private onCampaignPlayerCollisionEnter(event?: ICollisionEvent): void {
        if (!event || !this.campaignSession) return;
        const target = this.campaignTargets.find((item) => (
            !item.resolved && item.node === event.otherCollider.node
        ));
        if (!target) return;

        this.markCampaignTargetHit(target);
    }

    private onCampaignTargetCollisionEnter(event?: ICollisionEvent): void {
        const session = this.campaignSession;
        if (!event || !session?.isShotInProgress) return;

        const source = this.campaignTargets.find((item) => (
            !item.resolved && item.node === event.selfCollider.node
        ));
        const target = this.campaignTargets.find((item) => (
            !item.resolved && item.node === event.otherCollider.node
        ));
        if (!source || !target) return;

        if (session.spreadTargetHit(source.id, target.id)) {
            this.resetCampaignTargetSettlement(target);
            console.info(
                `[闯关模式] 目标 ${source.id} 连锁命中 ${target.id}。`,
            );
        }
    }

    private markCampaignTargetHit(target: CampaignTargetRuntime): void {
        if (!this.campaignSession?.markTargetHit(target.id)) return;
        this.resetCampaignTargetSettlement(target);
    }

    private resetCampaignTargetSettlement(target: CampaignTargetRuntime): void {
        target.hitElapsed = 0;
        target.settledElapsed = 0;
    }

    private updateCampaignRules(deltaTime: number): void {
        const session = this.campaignSession;
        if (!session?.isShotInProgress || !this.playerCoin) return;

        this.campaignShotElapsed += deltaTime;
        this.campaignTargets.forEach((target) => {
            if (target.resolved || !session.isTargetHit(target.id)) return;

            target.hitElapsed += deltaTime;
            if (this.isCoinFallPresentationComplete(target.node)) {
                this.resolveCampaignTarget(target, 'fell');
                return;
            }

            const velocity = new Vec3();
            target.body.getLinearVelocity(velocity);
            const isSlowEnough = velocity.lengthSqr() <= TARGET_SETTLE_SPEED * TARGET_SETTLE_SPEED;
            if (target.hitElapsed >= SHOT_MINIMUM_SECONDS && isSlowEnough) {
                target.settledElapsed += deltaTime;
            } else {
                target.settledElapsed = 0;
            }
            if (target.settledElapsed >= TARGET_SETTLE_SECONDS) {
                this.resolveCampaignTarget(target, 'stopped');
            }
        });

        if (session.currentOutcome !== 'playing' || !session.isShotInProgress) return;
        const playerBody = this.playerCoin.getComponent(RigidBody);
        if (!playerBody) return;

        const playerFell = this.isCoinFallPresentationComplete(this.playerCoin);
        const playerStopped = this.campaignShotElapsed >= SHOT_MINIMUM_SECONDS
            && this.isBodyNearlyStopped(playerBody);
        if ((!playerFell && !playerStopped) || session.hasPendingHitTargets()) return;

        const result = session.finishShot(playerFell ? 'fell' : 'stopped');
        if (!result) return;
        this.finalizeCampaignShot(result, playerBody);
    }

    private resolveCampaignTarget(
        target: CampaignTargetRuntime,
        resolution: CampaignTargetResolution,
    ): void {
        if (!this.campaignSession?.resolveTarget(target.id, resolution)) return;
        target.resolved = true;
        target.resolution = resolution;
        target.collider.off(
            'onCollisionEnter',
            this.onCampaignTargetCollisionEnter,
            this,
        );
        if (resolution === 'fell') {
            this.retireCampaignTarget(target);
        }
    }

    private finalizeCampaignShot(
        result: CampaignShotResult,
        currentPlayerBody: RigidBody,
    ): void {
        const nextControlTarget = result.nextControlTargetId
            ? this.campaignTargets.find((target) => target.id === result.nextControlTargetId)
            : undefined;
        const resolvedTargets = this.campaignTargets.filter((target) => (
            result.hitTargetIds.indexOf(target.id) >= 0
        ));

        resolvedTargets.forEach((target) => {
            if (target !== nextControlTarget) {
                this.retireCampaignTarget(target);
            }
        });

        if (nextControlTarget) {
            this.promoteCampaignTargetToPlayer(nextControlTarget);
            return;
        }

        if (this.campaignSession?.currentOutcome === 'failed' || !this.playerCoin) return;
        if (result.playerResolution === 'fell') {
            this.resetCampaignPlayerCoin(currentPlayerBody);
        } else {
            this.campaignPlayerSafePosition.set(this.playerCoin.position);
        }
    }

    private promoteCampaignTargetToPlayer(target: CampaignTargetRuntime): void {
        if (!this.playerCoin) return;

        this.campaignPlayerCollider?.off(
            'onCollisionEnter',
            this.onCampaignPlayerCollisionEnter,
            this,
        );
        const previousPlayer = this.playerCoin;
        this.coinBodies = this.coinBodies.filter((coin) => coin.node !== previousPlayer);
        previousPlayer.active = false;
        previousPlayer.destroy();

        this.campaignTargets = this.campaignTargets.filter((item) => item !== target);
        this.playerCoin = target.node;
        this.playerCoin.name = 'Coin_Player';
        target.body.sleep();
        target.body.clearVelocity();
        target.body.angularFactor = Vec3.ZERO;
        this.playerCoin.setRotation(Quat.IDENTITY);
        this.campaignPlayerSafePosition.set(this.playerCoin.position);
        const trackedCoin = this.coinBodies.find((coin) => coin.node === this.playerCoin);
        if (trackedCoin) {
            trackedCoin.isFalling = false;
            trackedCoin.fallElapsed = 0;
        }

        this.campaignPlayerCollider = target.collider;
        target.collider.on('onCollisionEnter', this.onCampaignPlayerCollisionEnter, this);
        target.body.wakeUp();
        console.info(`[闯关模式] 控制权已转移到最后命中的桌面硬币 ${target.id}。`);
    }

    private retireCampaignTarget(target: CampaignTargetRuntime): void {
        target.collider.off(
            'onCollisionEnter',
            this.onCampaignTargetCollisionEnter,
            this,
        );
        this.coinBodies = this.coinBodies.filter((coin) => coin.node !== target.node);
        this.campaignTargets = this.campaignTargets.filter((item) => item !== target);

        // Placeholder for the target disappearance VFX requested for a later task.
        target.node.active = false;
        target.node.destroy();
    }

    private resetCampaignPlayerCoin(body: RigidBody): void {
        if (!this.playerCoin) return;
        body.sleep();
        body.clearVelocity();
        body.angularFactor = Vec3.ZERO;
        this.playerCoin.setPosition(this.campaignPlayerSafePosition);
        this.playerCoin.setRotation(Quat.IDENTITY);
        const trackedCoin = this.coinBodies.find((coin) => coin.node === this.playerCoin);
        if (trackedCoin) {
            trackedCoin.isFalling = false;
            trackedCoin.fallElapsed = 0;
        }
        body.wakeUp();
    }

    private hasCoinLeftTable(coin: Node): boolean {
        const position = coin.worldPosition;
        const radialDistance = Math.sqrt(position.x * position.x + position.z * position.z);
        const isPastEdge = radialDistance > this.tableRadius - this.coinRadius * 0.35;
        const isDropping = position.y < this.coinHeight * 0.7;
        return isPastEdge && isDropping;
    }

    private isCoinFallPresentationComplete(coin: Node): boolean {
        const trackedCoin = this.coinBodies.find((item) => item.node === coin);
        return trackedCoin?.isFalling === true
            && trackedCoin.fallElapsed >= COIN_FALL_PRESENTATION_SECONDS;
    }

    private onCampaignLivesChanged(
        currentLives: number,
        startingLives: number,
        reason: CampaignLifeLossReason,
    ): void {
        const reasonLabel = reason === 'shot-missed'
            ? '未命中任何目标'
            : reason === 'player-fell'
                ? '当前控制硬币掉出桌外'
                : '命中传递硬币掉出桌外';
        if (this.campaignLivesLabel) {
            this.campaignLivesLabel.string = `生命：${currentLives}/${startingLives}`;
        }
        console.info(
            `[闯关模式] ${reasonLabel}，生命 ${currentLives}/${startingLives}。`,
        );
    }

    private onCampaignOutcomeChanged(outcome: CampaignOutcome): void {
        if (outcome === 'failed') {
            if (this.campaignOutcomeLabel) {
                this.campaignOutcomeLabel.string = '本关失败';
                this.campaignOutcomeLabel.color = new Color(255, 112, 98, 255);
            }
            console.info('[闯关模式] 本关失败；失败界面 UI 等待后续接入。');
            return;
        }
        if (outcome === 'succeeded') {
            if (this.campaignOutcomeLabel) {
                this.campaignOutcomeLabel.string = '闯关成功';
                this.campaignOutcomeLabel.color = new Color(255, 224, 92, 255);
            }
            console.info('[闯关模式] 所有目标均已消失，本关成功。');
        }
    }

    private getMaterial(
        key: string,
        color: Color,
        metallic = 0,
        roughness = 0.65,
    ): Material {
        const cached = this.materials.get(key);
        if (cached) return cached;

        const material = new Material();
        material.initialize({ effectName: 'builtin-standard' });
        material.setProperty('mainColor', color);
        material.setProperty('metallic', metallic);
        material.setProperty('roughness', roughness);
        this.materials.set(key, material);
        return material;
    }

    private createPhysicsMaterial(friction: number, restitution: number): PhysicsMaterial {
        const material = new PhysicsMaterial();
        material.friction = friction;
        material.restitution = restitution;
        return material;
    }

}
