const CONTAINER_ID = /^[a-f0-9]{12,64}$/i;

export function normalizeDockerContainerId(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function sameDockerContainerId(left, right) {
  const normalizedLeft = normalizeDockerContainerId(left);
  const normalizedRight = normalizeDockerContainerId(right);
  if (!CONTAINER_ID.test(normalizedLeft) || !CONTAINER_ID.test(normalizedRight)) return false;
  return normalizedLeft === normalizedRight
    || normalizedLeft.startsWith(normalizedRight)
    || normalizedRight.startsWith(normalizedLeft);
}
