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
    EventTouch,
    Graphics,
    HorizontalTextAlignment,
    input,
    Input,
    instantiate,
    Label,
    Layers,
    Material,
    MeshRenderer,
    Node,
    Prefab,
    PhysicsMaterial,
    PhysicsSystem,
    primitives,
    profiler,
    resources,
    RigidBody,
    screen,
    Texture2D,
    UITransform,
    utils,
    Vec3,
    VerticalTextAlignment,
    view,
} from 'cc';

const { ccclass, property } = _decorator;

// Cocos Creator 3.8.8 does not publicly export these two engine enums from `cc`.
// Their serialized values are stable: ShadowMap = 1, SOFT_2X = 2.
const SHADOW_TYPE_MAP = 1;
const SHADOW_PCF_SOFT_2X = 2;

type GestureMode = 'none' | 'camera' | 'charge';

/**
 * 《羊蹄山之魂》式弹钱币操作原型。
 *
 * - 圆桌、硬币、障碍物、摄像机和灯光都直接保存在 Main.scene 中。
 * - 玩家只控制黄色硬币。
 * - 屏幕主体左右拖拽，镜头围绕玩家硬币旋转。
 * - 镜头正前方就是硬币发射方向。
 * - 屏幕底部热区负责长按蓄力，松手发射。
 * - 硬币在桌面上滑动和碰撞，越过无围挡的圆桌边缘后会受重力掉落。
 */
@ccclass('CoinFlickPrototype')
export class CoinFlickPrototype extends Component {
    @property({ tooltip: '达到最大力度所需的长按时间（秒）' })
    public maxChargeSeconds = 2.2;

    @property({ tooltip: '最小发射冲量' })
    public minImpulse = 1.0;

    @property({ tooltip: '最大发射冲量' })
    public maxImpulse = 10.0;

    @property({ tooltip: '横向拖满整个屏幕时旋转的角度' })
    public cameraDragDegreesPerScreen = 72;

    @property({ tooltip: '底部蓄力热区占屏幕高度的比例' })
    public chargeZoneHeightRatio = 0.19;

    @property({ tooltip: '每局最少出现的圆柱障碍物数量' })
    public minObstacleCount = 3;

    @property({ tooltip: '每局最多出现的圆柱障碍物数量' })
    public maxObstacleCount = 7;

    private readonly coinRadius = 0.336;
    private readonly coinHeight = 0.048;
    private readonly tableRadius = 5.72;

    private camera: Camera | null = null;
    private playerCoin: Node | null = null;
    private chargeGraphics: Graphics | null = null;
    private chargeLabel: Label | null = null;

    private cameraYawDegrees = 0;
    private lastDragX = 0;
    private gestureMode: GestureMode = 'none';
    private isCharging = false;
    private chargeSeconds = 0;
    private materials = new Map<string, Material>();
    private obstacles: Node[] = [];
    private coinBodies: Array<{ node: Node; body: RigidBody; isFalling: boolean }> = [];

    protected start(): void {
        profiler.hideStats();
        PhysicsSystem.instance.gravity = new Vec3(0, -9.8, 0);

        this.ensureRecoveredVisuals();
        this.bindVisualScene();
        this.configureScenePhysics();
        this.applySceneMaterials();
        this.attachCoinFaces();
        this.attachDragonVisuals();
        this.configureLightingAndShadows();
        this.createUserInterface();
        this.updateCameraRig();

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }

    protected onDestroy(): void {
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

    protected lateUpdate(): void {
        this.updateCoinFallRotation();
        this.updateCameraRig();
    }

    private bindVisualScene(): void {
        const cameraNode = this.requireSceneNode('MainCamera');
        const camera = cameraNode.getComponent(Camera) ?? cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.PERSPECTIVE;
        camera.fov = 42;
        camera.near = 0.1;
        camera.far = 100;
        camera.clearColor = new Color(25, 31, 38, 255);
        this.camera = camera;

        const lightNode = this.requireSceneNode('KeyLight');
        lightNode.setPosition(0, 8, 0);
        lightNode.setRotationFromEuler(-48, -35, 0);
        const light = lightNode.getComponent(DirectionalLight) ?? lightNode.addComponent(DirectionalLight);
        light.color = new Color(255, 226, 190, 255);
        light.illuminance = 72000;
        light.shadowEnabled = true;
        light.shadowPcf = SHADOW_PCF_SOFT_2X;
        light.shadowBias = 0.0008;
        light.shadowNormalBias = 0.018;
        light.shadowSaturation = 0.9;
        light.shadowFixedArea = true;
        light.shadowNear = 0.1;
        light.shadowFar = 20;
        light.shadowOrthoSize = 7.2;

        this.playerCoin = this.requireSceneNode('Coin_Player');
    }

    /**
     * The original scene serialization was lost when the ChatGPT project mirror
     * was recreated. The recovered Main.scene keeps every editable gameplay
     * node, while this method restores their built-in meshes deterministically.
     */
    private ensureRecoveredVisuals(): void {
        const table = this.requireSceneNode('Table');
        this.ensureCylinderMesh(table, 64);

        ['Coin_Player', 'Coin_Target_1', 'Coin_Target_2', 'Coin_Target_3'].forEach((name) => {
            this.ensureCylinderMesh(this.requireSceneNode(name), 48);
        });

        for (let index = 1; index <= 8; index++) {
            const obstacle = this.requireSceneNode(`Obstacle_${index}`);
            if (!obstacle.getChildByName('DragonColumnVisual')) {
                this.ensureCylinderMesh(obstacle, 28);
            }
        }
    }

    private ensureCylinderMesh(node: Node, radialSegments: number): MeshRenderer {
        const renderer = node.getComponent(MeshRenderer) ?? node.addComponent(MeshRenderer);
        if (!renderer.mesh) {
            renderer.mesh = utils.createMesh(primitives.cylinder(0.5, 0.5, 2, { radialSegments }));
        }
        return renderer;
    }

    private configureScenePhysics(): void {
        const table = this.requireSceneNode('Table');
        // Cocos' built-in cylinder has a radius of 0.5, so diameter scale is
        // required to produce the requested world-space table radius.
        table.setScale(this.tableRadius * 2, 0.18, this.tableRadius * 2);
        const tableCollider = table.getComponent(CylinderCollider) ?? table.addComponent(CylinderCollider);
        tableCollider.radius = 0.5;
        tableCollider.height = 2;
        tableCollider.material = this.createPhysicsMaterial(0.45, 0.05);

        this.coinBodies = [];
        this.configureCoinPhysics('Coin_Player');
        this.configureCoinPhysics('Coin_Target_1');
        this.configureCoinPhysics('Coin_Target_2');
        this.configureCoinPhysics('Coin_Target_3');

        this.configureRandomObstacles();
    }

    private configureCoinPhysics(name: string): void {
        const coin = this.requireSceneNode(name);
        coin.setScale(this.coinRadius * 2, this.coinHeight * 0.5, this.coinRadius * 2);

        const body = coin.getComponent(RigidBody) ?? coin.addComponent(RigidBody);
        body.type = ERigidBodyType.DYNAMIC;
        body.mass = 1;
        body.useGravity = true;
        body.linearDamping = 0.62;
        body.angularDamping = 0.9;
        body.linearFactor = Vec3.ONE;
        body.angularFactor = Vec3.ZERO;

        const collider = coin.getComponent(CylinderCollider) ?? coin.addComponent(CylinderCollider);
        collider.radius = 0.5;
        collider.height = 2;
        collider.material = this.createPhysicsMaterial(0.16, 0.72);

        this.coinBodies.push({ node: coin, body, isFalling: false });
    }

    private updateCoinFallRotation(): void {
        for (const coin of this.coinBodies) {
            if (coin.isFalling) continue;

            const position = coin.node.worldPosition;
            const radialDistance = Math.sqrt(position.x * position.x + position.z * position.z);
            const isPastEdge = radialDistance > this.tableRadius - this.coinRadius * 0.35;
            const isDropping = position.y < this.coinHeight * 0.7;
            if (!isPastEdge || !isDropping) continue;

            coin.isFalling = true;
            coin.body.angularFactor = Vec3.ONE;
            coin.body.wakeUp();

            const velocity = new Vec3();
            coin.body.getLinearVelocity(velocity);
            const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
            const inverseSpeed = horizontalSpeed > 0.1 ? 1 / horizontalSpeed : 0;
            const tiltX = horizontalSpeed > 0.1 ? velocity.z * inverseSpeed : 0.82;
            const tiltZ = horizontalSpeed > 0.1 ? -velocity.x * inverseSpeed : 0.57;
            const flipSpeed = 4.5 + Math.min(3, horizontalSpeed * 0.5);

            coin.body.setAngularVelocity(new Vec3(
                tiltX * flipSpeed,
                0.7,
                tiltZ * flipSpeed,
            ));
        }
    }

    private configureRandomObstacles(): void {
        this.obstacles = Array.from({ length: 8 }, (_, index) => (
            this.requireSceneNode(`Obstacle_${index + 1}`)
        ));

        const minimum = Math.max(0, Math.min(this.obstacles.length, Math.floor(this.minObstacleCount)));
        const maximum = Math.max(minimum, Math.min(this.obstacles.length, Math.floor(this.maxObstacleCount)));
        const activeCount = minimum + Math.floor(Math.random() * (maximum - minimum + 1));

        const occupied: Array<{ x: number; z: number; clearance: number }> = [
            'Coin_Player',
            'Coin_Target_1',
            'Coin_Target_2',
            'Coin_Target_3',
        ].map((name) => {
            const position = this.requireSceneNode(name).position;
            return { x: position.x, z: position.z, clearance: this.coinRadius + 0.52 };
        });

        this.obstacles.forEach((obstacle, index) => {
            const isActive = index < activeCount;
            obstacle.active = isActive;
            if (!isActive) return;

            const radius = this.randomRange(0.24, 0.34);
            const height = this.randomRange(0.58, 0.92);
            const position = this.findObstaclePosition(radius, occupied);
            obstacle.setPosition(position.x, height * 0.5, position.z);
            obstacle.setScale(radius * 2, height * 0.5, radius * 2);

            const playerPosition = this.playerCoin?.position ?? Vec3.ZERO;
            const facePlayerYaw = Math.atan2(
                playerPosition.x - position.x,
                playerPosition.z - position.z,
            ) * 180 / Math.PI;
            obstacle.setRotationFromEuler(0, facePlayerYaw, 0);

            const collider = obstacle.getComponent(CylinderCollider) ?? obstacle.addComponent(CylinderCollider);
            collider.radius = 0.5;
            collider.height = 2;
            collider.material = this.createPhysicsMaterial(0.2, 0.78);

            occupied.push({ x: position.x, z: position.z, clearance: radius + 0.42 });
        });
    }

    private findObstaclePosition(
        radius: number,
        occupied: Array<{ x: number; z: number; clearance: number }>,
    ): { x: number; z: number } {
        const usableRadius = this.tableRadius - radius - 0.48;
        for (let attempt = 0; attempt < 80; attempt++) {
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

    private randomRange(minimum: number, maximum: number): number {
        return minimum + Math.random() * (maximum - minimum);
    }

    private applySceneMaterials(): void {
        // Keep the TableVisual material serialized in Main.scene. Replacing it
        // here used to discard the texture already assigned by Creator.
        const tableRenderer = this.requireSceneNode('Table').getComponent(MeshRenderer);
        const tableMaterial = tableRenderer?.getMaterialInstance(0);
        if (tableMaterial) {
            this.applyTableTexture(tableMaterial);
        } else {
            const fallback = this.getMaterial('table', new Color(255, 255, 255, 255), 0.12, 0.72);
            tableRenderer?.setSharedMaterial(fallback, 0);
            this.applyTableTexture(fallback);
        }

        const goldEdge = this.getMaterial('gold-edge', new Color(222, 168, 38, 255), 0.72, 0.3);
        ['Coin_Player', 'Coin_Target_1', 'Coin_Target_2', 'Coin_Target_3'].forEach((name) => {
            this.setNodeMaterial(name, goldEdge);
        });

        const obstacleMaterial = this.getMaterial('obstacle-fallback', new Color(28, 38, 58, 255), 0.42, 0.36);
        this.obstacles.forEach((obstacle) => this.setNodeMaterial(obstacle.name, obstacleMaterial));
    }

    private attachCoinFaces(): void {
        resources.load('textures/fantasy-gold-coin-face/texture/texture', Texture2D, (error, texture) => {
            if (error || !texture) {
                console.warn('无法载入魔幻金币贴图', error);
                return;
            }

            const faceMaterial = new Material();
            faceMaterial.initialize({
                effectName: 'builtin-unlit',
                technique: 1,
                defines: { USE_TEXTURE: true },
            });
            faceMaterial.setProperty('mainTexture', texture);
            faceMaterial.setProperty('mainColor', Color.WHITE);

            ['Coin_Player', 'Coin_Target_1', 'Coin_Target_2', 'Coin_Target_3'].forEach((name) => {
                const coin = this.requireSceneNode(name);
                const recoveredFace = coin.getChildByName('CoinFace');
                if (recoveredFace) {
                    // The built-in plane saved in Main.scene is 10 x 10,
                    // unlike the 1 x 1 plane created below at runtime.
                    recoveredFace.setScale(0.0965, 1, 0.0965);
                    return;
                }

                const face = new Node('CoinFace');
                face.setPosition(0, 1.04, 0);
                face.setScale(0.965, 1, 0.965);
                coin.addChild(face);

                const renderer = face.addComponent(MeshRenderer);
                renderer.mesh = utils.createMesh(primitives.plane({
                    width: 1,
                    length: 1,
                    widthSegments: 1,
                    lengthSegments: 1,
                }));
                renderer.setMaterial(faceMaterial, 0);
                renderer.receiveShadowForInspector = true;
            });
        });
    }

    private attachDragonVisuals(): void {
        resources.loadDir('models/dragon-column', Prefab, (error, prefabs) => {
            const dragonPrefab = prefabs?.[0];
            if (error || !dragonPrefab) {
                console.warn('无法载入黑龙柱模型，保留圆柱障碍物作为后备显示。', error);
                return;
            }

            this.obstacles.forEach((obstacle) => {
                if (obstacle.getChildByName('DragonColumnVisual')) return;
                const visual = instantiate(dragonPrefab);
                visual.name = 'DragonColumnVisual';
                visual.setPosition(Vec3.ZERO);
                obstacle.addChild(visual);
                const placeholderRenderer = obstacle.getComponent(MeshRenderer);
                if (placeholderRenderer) placeholderRenderer.enabled = false;
                this.configureNodeShadows(visual, true, true);
            });
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

    private configureLightingAndShadows(): void {
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

        this.configureNodeShadows(this.requireSceneNode('Table'), false, true);
        ['Coin_Player', 'Coin_Target_1', 'Coin_Target_2', 'Coin_Target_3'].forEach((name) => {
            this.configureNodeShadows(this.requireSceneNode(name), true, true);
        });
        this.obstacles.forEach((obstacle) => this.configureNodeShadows(obstacle, true, true));
    }

    private configureNodeShadows(node: Node, castShadow: boolean, receiveShadow: boolean): void {
        node.getComponentsInChildren(MeshRenderer).forEach((renderer) => {
            if (!renderer.enabled) return;
            renderer.shadowCastingModeForInspector = castShadow;
            renderer.receiveShadowForInspector = receiveShadow;
            renderer.shadowBias = 0.00015;
            renderer.shadowNormalBias = 0.006;
        });
    }

    private setNodeMaterial(name: string, material: Material): void {
        this.requireSceneNode(name).getComponent(MeshRenderer)?.setMaterial(material, 0);
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
        helpNode.setPosition(0, visibleSize.height * 0.5 - 62, 0);
        canvasNode.addChild(helpNode);
        helpNode.addComponent(UITransform).setContentSize(visibleSize.width - 48, 56);
        const helpLabel = helpNode.addComponent(Label);
        helpLabel.string = '左右拖拽调整朝向';
        helpLabel.fontSize = 28;
        helpLabel.lineHeight = 34;
        helpLabel.color = new Color(235, 240, 242, 230);
        helpLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        helpLabel.verticalAlign = VerticalTextAlignment.CENTER;

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

        const impulse = this.calculateChargeImpulse(this.chargeSeconds);
        const direction = this.getLaunchDirection(new Vec3());

        this.playerCoin.getComponent(RigidBody)?.applyImpulse(direction.multiplyScalar(impulse));
        this.isCharging = false;
        this.chargeSeconds = 0;
        this.redrawChargeZone();
    }

    private calculateChargeImpulse(chargeSeconds: number): number {
        const safeChargeDuration = Math.max(this.maxChargeSeconds, 0.001);
        const chargeRatio = Math.min(1, Math.max(0, chargeSeconds / safeChargeDuration));
        const easedCharge = chargeRatio * chargeRatio * (3 - 2 * chargeRatio);
        return this.minImpulse + (this.maxImpulse - this.minImpulse) * easedCharge;
    }

    private updateCameraRig(): void {
        if (!this.camera || !this.playerCoin) return;

        const forward = this.getLaunchDirection(new Vec3());
        const playerPosition = this.playerCoin.worldPosition;
        const cameraPosition = playerPosition.clone()
            .subtract(forward.clone().multiplyScalar(6.2))
            .add3f(0, 8.4, 0);
        const lookTarget = playerPosition.clone()
            .add(forward.clone().multiplyScalar(2.65))
            .add3f(0, 0.05, 0);

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
        return velocity.lengthSqr() < 0.05;
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
