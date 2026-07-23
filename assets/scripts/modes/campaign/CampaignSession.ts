export type CampaignOutcome = 'playing' | 'succeeded' | 'failed';
export type CampaignLifeLossReason = 'shot-missed' | 'target-fell';
export type CampaignTargetResolution = 'stopped' | 'fell';

type CampaignTargetState = 'active' | 'hit' | 'resolved';

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
    private shotHitAnyTarget = false;
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
        this.shotHitAnyTarget = false;
        return true;
    }

    public markTargetHit(targetId: string): boolean {
        if (!this.shotInProgress || this.outcome !== 'playing') return false;
        if (this.targetStates[targetId] !== 'active') return false;

        this.targetStates[targetId] = 'hit';
        this.shotHitAnyTarget = true;
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
        this.remainingTargetCount -= 1;
        this.callbacks.onTargetResolved?.(targetId, resolution);

        // Life loss is deliberately evaluated before success. If the last
        // target falls and consumes the last life, the level fails.
        if (resolution === 'fell') {
            if (this.loseLife('target-fell')) return true;
        }

        if (this.remainingTargetCount === 0) {
            this.outcome = 'succeeded';
            this.shotInProgress = false;
            this.callbacks.onOutcomeChanged?.(this.outcome);
        }
        return true;
    }

    public finishShot(): boolean {
        if (!this.shotInProgress || this.outcome !== 'playing') return false;
        if (this.hasPendingHitTargets()) return false;

        this.shotInProgress = false;
        if (!this.shotHitAnyTarget) {
            this.loseLife('shot-missed');
        }
        return true;
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
