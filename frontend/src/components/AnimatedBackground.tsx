// Reusable animated + textured background: drifting aurora blobs over the
// global grid texture. Purely decorative (aria-hidden), sits behind content.
export function AnimatedBackground() {
  return (
    <div className="aurora-bg" aria-hidden>
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="blob b3" />
    </div>
  );
}
