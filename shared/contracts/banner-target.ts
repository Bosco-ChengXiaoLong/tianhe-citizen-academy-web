/** Banner destinations only. Authentication return URLs must remain internal. */
export function validBannerTarget(value: unknown): value is string {
  if (typeof value !== 'string' || /[\s\\\u0000-\u001f<>"`{}|^]/.test(value)) return false;
  if (/^\/(?!\/)[A-Za-z0-9/_?=&.-]*$/.test(value)) return true;
  if (!value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    return !!url.hostname && !url.username && !url.password && url.protocol === 'https:';
  } catch { return false; }
}
export function bannerTarget(value: unknown) {
  const href = validBannerTarget(value) ? value : '/courses';
  return {href, external: href.startsWith('https://')};
}
