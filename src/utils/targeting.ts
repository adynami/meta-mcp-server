/**
 * Shared targeting spec builder.
 * Converts the tool-facing `targeting` input shape into the Meta API `targeting_spec` format.
 * Used by meta_deploy_campaign (creator.ts) and meta_estimate_audience_size (management.ts).
 */
export function buildTargetingSpec(t: any, useAdvantageAudience = false): Record<string, any> {
  const targeting: Record<string, any> = {
    age_min: t.age_min ?? 18,
    age_max: t.age_max ?? 65,
    genders: t.genders ?? [0],
    geo_locations: { countries: t.geo_locations?.countries ?? ['US'], location_types: ['home', 'recent'] },
    targeting_automation: { advantage_audience: useAdvantageAudience ? 1 : 0 },
  };

  // Interest / behavior targeting via flexible_spec
  if (t.interests?.length || t.behaviors?.length) {
    const spec: Record<string, any> = {};
    if (t.interests?.length) spec.interests = t.interests.map((i: any) => ({ id: i.id }));
    if (t.behaviors?.length) spec.behaviors = t.behaviors.map((b: any) => ({ id: b.id }));
    targeting.flexible_spec = [spec];
  }

  // Custom audience include / exclude
  if (t.custom_audiences?.length) targeting.custom_audiences = t.custom_audiences.map((a: any) => ({ id: a.id }));
  if (t.excluded_custom_audiences?.length) targeting.excluded_custom_audiences = t.excluded_custom_audiences.map((a: any) => ({ id: a.id }));

  // Manual placements (omitting lets Meta use Advantage+ Placements)
  if (t.placements) {
    const p = t.placements;
    if (p.publisher_platforms?.length) targeting.publisher_platforms = p.publisher_platforms;
    if (p.facebook_positions?.length) targeting.facebook_positions = p.facebook_positions;
    if (p.instagram_positions?.length) targeting.instagram_positions = p.instagram_positions;
    if (p.audience_network_positions?.length) targeting.audience_network_positions = p.audience_network_positions;
    if (p.messenger_positions?.length) targeting.messenger_positions = p.messenger_positions;
    if (p.threads_positions?.length) targeting.threads_positions = p.threads_positions;
  }

  return targeting;
}
