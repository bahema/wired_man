type AudienceFilter =
  | { error: string }
  | { where: string; params: Record<string, string>; parsed: Record<string, unknown> };

export const buildAudienceFilter = (audience: string): AudienceFilter => {
  let parsed: { segment?: string; continents?: string[]; countries?: string[]; source?: string } = {};
  try {
    parsed = JSON.parse(audience);
  } catch {
    return { error: 'Audience must be valid JSON' };
  }
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (parsed.source && parsed.source !== 'All sources') {
    conditions.push('source = @source');
    params.source = parsed.source;
  }

  const selectedContinents = Array.isArray(parsed.continents) ? parsed.continents : [];
  const selectedCountries = Array.isArray(parsed.countries) ? parsed.countries : [];
  if (selectedContinents.length > 0 || selectedCountries.length > 0) {
    const continentParams: string[] = [];
    selectedContinents.forEach((continent, idx) => {
      const key = `ct${idx}`;
      params[key] = continent;
      continentParams.push(`@${key}`);
    });

    const countryParams: string[] = [];
    const normalizedCountries = selectedCountries
      .map((country) => String(country || '').trim().toUpperCase())
      .filter(Boolean);
    normalizedCountries.forEach((country, idx) => {
      const key = `cc${idx}`;
      params[key] = country;
      countryParams.push(`@${key}`);
    });

    const continentClause = continentParams.length ? `continent IN (${continentParams.join(', ')})` : '';
    const countryClause = countryParams.length ? `country IN (${countryParams.join(', ')})` : '';
    const combined =
      continentClause && countryClause
        ? `(${continentClause} OR ${countryClause})`
        : continentClause || countryClause;
    if (combined) {
      conditions.push(combined);
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params, parsed };
};
