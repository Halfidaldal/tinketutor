/**
 * LoadingSkeleton — Generic loading placeholder
 *
 * Uses CSS shimmer animation defined in globals.css.
 */

export function LoadingSkeleton({
  width = '100%',
  height = '1rem',
  borderRadius = 'var(--radius-md)',
}: {
  width?: string;
  height?: string;
  borderRadius?: string;
}) {
  return (
    <div
      className="skeleton-loading"
      style={{ width, height, borderRadius }}
    />
  );
}

export default LoadingSkeleton;
