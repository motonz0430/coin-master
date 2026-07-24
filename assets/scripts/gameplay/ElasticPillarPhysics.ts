export const ELASTIC_PILLAR_PREFAB_ID = 'obstacle.elastic-pillar';
export const DEFAULT_ELASTIC_BOOST_MULTIPLIER = 1.6;
export const ELASTIC_BOOST_COOLDOWN_SECONDS = 0.12;

export interface Velocity3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface PlanarDirection {
    readonly x: number;
    readonly z: number;
}

/**
 * Enhances the horizontal velocity after the physics engine has resolved the
 * rubber collision. If the sampled velocity still points into the pillar, it
 * is reflected across the outward collision normal before amplification.
 */
export function calculateElasticPillarVelocity(
    velocity: Velocity3,
    outwardDirection: PlanarDirection,
    multiplier = DEFAULT_ELASTIC_BOOST_MULTIPLIER,
    maximumHorizontalSpeed = Number.POSITIVE_INFINITY,
): Velocity3 {
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    if (
        horizontalSpeed <= 1e-5
        || !Number.isFinite(horizontalSpeed)
        || !Number.isFinite(multiplier)
        || multiplier <= 1
    ) {
        return { x: velocity.x, y: velocity.y, z: velocity.z };
    }

    const outwardLength = Math.hypot(outwardDirection.x, outwardDirection.z);
    let horizontalX = velocity.x;
    let horizontalZ = velocity.z;
    if (outwardLength > 1e-5 && Number.isFinite(outwardLength)) {
        const normalX = outwardDirection.x / outwardLength;
        const normalZ = outwardDirection.z / outwardLength;
        const inwardDot = horizontalX * normalX + horizontalZ * normalZ;
        if (inwardDot < 0) {
            horizontalX -= 2 * inwardDot * normalX;
            horizontalZ -= 2 * inwardDot * normalZ;
        }
    }

    const amplifiedSpeed = horizontalSpeed * multiplier;
    const clampedSpeed = Number.isFinite(maximumHorizontalSpeed)
        ? Math.min(amplifiedSpeed, Math.max(0, maximumHorizontalSpeed))
        : amplifiedSpeed;
    const scale = clampedSpeed / horizontalSpeed;
    return {
        x: horizontalX * scale,
        y: velocity.y,
        z: horizontalZ * scale,
    };
}
