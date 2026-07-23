export type CampaignOutcome = 'playing' | 'succeeded' | 'failed';
export type CampaignLifeLossReason = 'shot-missed' | 'player-fell' | 'target-fell';
export type CampaignTargetResolution = 'stopped' | 'fell';

type CampaignTargetState = 'active' | 'hit' | 'resolved';

export interface CampaignShotResult {
    readonly playerResolution: CampaignTargetResolution;
    readonly hitTargetIds: readonly string[];
    readonly survivingHitTargetIds: readonly string[];
    readonly nextControlTargetId: string | null;
}

export interface CampaignSessionCallbacks {
    readonly onLivesChanged?: (
        currentLives: number,
        startingLives: number,
        reason: CampaignLifeLossReason,
    ) => void;
    readonly onTargetHit?: (targetId: string) => void;
    readonly onTargetResolved?: (
        targetId: string,
        resolution: CampaignTargetResolution,
    ) => void;
    readonly onOutcomeChanged?: (outcome: CampaignOutcome) => void;
}

export class CampaignSession {
    private readonly targetStates: Record<string, CampaignTargetState> = Object.create(null) as Record<
        string,
        CampaignTargetState
    >;
    private readonly targetIds: readonly string[];
    private lives: number;
    private remainingTargetCount: number;
    private shotInProgress = false;
    private shotHitOrder: string[] = [];
    private shotTargetResolutions: Record<string, CampaignTargetResolution> = Object.create(null) as Record<
        string,
        CampaignTargetResolution
    >;
    private outcome: CampaignOutcome = 'playing';

    constructor(
        private readonly startingLives: number,
        targetIds: readonly string[],
        private readonly callbacks: CampaignSessionCallbacks = {},
    ) {
        if (!Number.isInteger(startingLives) || startingLives <= 0) {
            throw new Error('闯关生命值必须是大于 0 的整数。');
        }
        if (targetIds.length === 0) {
            throw new Error('闯关模式至少需要一枚目标硬币。');
        }
        if (new Set(targetIds).size !== targetIds.length) {
            throw new Error('闯关目标硬币 id 不能重复。');
        }

        this.lives = startingLives;
        this.targetIds = [...targetIds];
        this.remainingTargetCount = targetIds.length;
        this.targetIds.forEach((targetId) => {
            this.targetStates[targetId] = 'active';
        });
    }

    public get currentLives(): number {
        return this.lives;
    }

    public get maxLives(): number {
        return this.startingLives;
    }

    public get remainingTargets(): number {
        return this.remainingTargetCount;
    }

    public get currentOutcome(): CampaignOutcome {
        return this.outcome;
    }

    public get isShotInProgress(): boolean {
        return this.shotInProgress;
    }

    public get canStartShot(): boolean {
        return this.outcome === 'playing' && !this.shotInProgress;
    }

    public beginShot(): boolean {
        if (!this.canStartShot) return false;
        this.shotInProgress = true;
        this.shotHitOrder = [];
        this.shotTargetResolutions = Object.create(null) as Record<
            string,
            CampaignTargetResolution
        >;
        return true;
    }

    public markTargetHit(targetId: string): boolean {
        if (!this.shotInProgress || this.outcome !== 'playing') return false;
        if (this.targetStates[targetId] !== 'active') return false;

        this.targetStates[targetId] = 'hit';
        this.shotHitOrder.push(targetId);
        this.callbacks.onTargetHit?.(targetId);
        return true;
    }

    public spreadTargetHit(sourceTargetId: string, targetId: string): boolean {
        if (!this.isTargetHit(sourceTargetId)) return false;
        return this.markTargetHit(targetId);
    }

    public isTargetHit(targetId: string): boolean {
        return this.targetStates[targetId] === 'hit';
    }

    public hasPendingHitTargets(): boolean {
        return this.targetIds.some((targetId) => this.targetStates[targetId] === 'hit');
    }

    public resolveTarget(
        targetId: string,
        resolution: CampaignTargetResolution,
    ): boolean {
        if (this.outcome !== 'playing' || this.targetStates[targetId] !== 'hit') {
            return false;
        }

        this.targetStates[targetId] = 'resolved';
        this.shotTargetResolutions[targetId] = resolution;
        this.remainingTargetCount -= 1;
        this.callbacks.onTargetResolved?.(targetId, resolution);

        if (resolution === 'fell') {
            this.loseLife('target-fell');
        }
        return true;
    }

    public finishShot(
        playerResolution: CampaignTargetResolution,
    ): CampaignShotResult | null {
        if (!this.shotInProgress || this.outcome !== 'playing') return null;
        if (this.hasPendingHitTargets()) return null;

        const hitTargetIds = [...this.shotHitOrder];
        const survivingHitTargetIds = hitTargetIds.filter((targetId) => (
            this.shotTargetResolutions[targetId] === 'stopped'
        ));
        const nextControlTargetId = survivingHitTargetIds.length > 0
            ? survivingHitTargetIds[survivingHitTargetIds.length - 1]
            : null;

        this.shotInProgress = false;
        if (hitTargetIds.length === 0) {
            this.loseLife(playerResolution === 'fell' ? 'player-fell' : 'shot-missed');
        }

        // Target-fall life loss is always resolved before victory. A shot only
        // succeeds after its whole hit chain has settled and at least one life
        // remains.
        if (this.outcome === 'playing' && this.remainingTargetCount === 0) {
            this.outcome = 'succeeded';
            this.callbacks.onOutcomeChanged?.(this.outcome);
        }

        return {
            playerResolution,
            hitTargetIds,
            survivingHitTargetIds,
            nextControlTargetId,
        };
    }

    private loseLife(reason: CampaignLifeLossReason): boolean {
        this.lives = Math.max(0, this.lives - 1);
        this.callbacks.onLivesChanged?.(this.lives, this.startingLives, reason);
        if (this.lives > 0) return false;

        this.outcome = 'failed';
        this.shotInProgress = false;
        this.callbacks.onOutcomeChanged?.(this.outcome);
        return true;
    }
}
