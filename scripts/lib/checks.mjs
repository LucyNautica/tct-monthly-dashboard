// Safety checks run before anything is published. Any "error" blocks the publish;
// "warning" is reported in the run summary but still publishes.

export function runChecks(model, { prevModel = null, prevSnapshot = null, trips = [], cfg }) {
  const c = cfg.checks || {};
  const errors = [], warnings = [];
  const k = model.kpi;
  const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

  // 1. Internal consistency of the KPI sheet
  const monthlySum = k.actualsMonthly.reduce((a, v) => a + (v || 0), 0);
  if (!near(monthlySum, k.bookingRev)) errors.push(`KPI sheet: monthly booking revenue adds up to $${monthlySum.toLocaleString()} but the Total column says $${k.bookingRev.toLocaleString()}.`);
  const qSum = k.quarters.reduce((a, q) => a + q.actual, 0);
  if (!near(qSum, k.bookingRev, 5)) warnings.push(`Quarter tracker adds up to $${qSum.toLocaleString()}, KPI total is $${k.bookingRev.toLocaleString()}.`);
  if (k.monthsWithActuals < 1) errors.push('KPI sheet: no monthly booking revenue found.');
  if (k.bookings <= 0) errors.push('KPI sheet: booking count is zero.');
  if (k.grossMarginPct < -0.5 || k.grossMarginPct > 0.9) errors.push(`Gross margin ${(k.grossMarginPct * 100).toFixed(1)}% is outside a believable range.`);

  // 2. Week-on-week movement vs the last published version
  if (prevModel?.kpi && prevModel.year === model.year) {
    const drop = (prevModel.kpi.bookingRev - k.bookingRev) / prevModel.kpi.bookingRev * 100;
    if (drop > (c.maxRevenueDropPct ?? 5)) errors.push(`Booking revenue YTD fell ${drop.toFixed(1)}% since the last update ($${prevModel.kpi.bookingRev.toLocaleString()} → $${k.bookingRev.toLocaleString()}).`);
    if (k.monthsWithActuals < prevModel.kpi.monthsWithActuals) errors.push(`KPI sheet now has ${k.monthsWithActuals} months of actuals, last update had ${prevModel.kpi.monthsWithActuals}.`);
  }

  // 3. WeTravel data
  if (!trips.length) errors.push('WeTravel returned no upcoming trips.');
  if (prevSnapshot?.trips?.length && trips.length) {
    const tripDrop = (prevSnapshot.trips.length - trips.length) / prevSnapshot.trips.length * 100;
    if (tripDrop > (c.maxTripCountDropPct ?? 30)) errors.push(`WeTravel trip count fell from ${prevSnapshot.trips.length} to ${trips.length}.`);
  }
  const pf = model.fill;
  const prevFill = prevModel?.fill;
  if (prevFill?.pax && pf.pax < prevFill.pax * (1 - (c.maxPaxDropPct ?? 15) / 100)) errors.push(`${model.nextYear} pax fell from ${prevFill.pax} to ${pf.pax} in one update.`);
  // Money unit check: the typical revenue per traveller must look like a tour price.
  const perPax = trips.filter((t) => t.pax > 0 && t.revenue > 0).map((t) => t.revenue / t.pax).sort((a, b) => a - b);
  const lo = c.minRevenuePerPax ?? 300, hi = c.maxRevenuePerPax ?? 25000;
  if (perPax.length) {
    const median = perPax[Math.floor(perPax.length / 2)];
    if (median < lo || median > hi) errors.push(`WeTravel revenue is $${Math.round(median)} per traveller on a typical trip, which looks like the wrong money unit (check wetravel.amountDivisor in config).`);
  }
  for (const t of trips) {
    if (t.pax > 0 && t.revenue > 0) {
      const per = t.revenue / t.pax;
      if (per < lo || per > hi) warnings.push(`WeTravel "${t.title}": $${Math.round(per)} per traveller looks unusual.`);
    }
    if (t.capacity > 0 && t.pax > t.capacity * (1 + (c.maxOverbookPct ?? 10) / 100)) warnings.push(`WeTravel "${t.title}": ${t.pax} pax on ${t.capacity} seats.`);
  }
  if (model.unmatched.length) warnings.push(`${model.nextYear} trips in WeTravel with no pricing row (left out of the profitability table): ${model.unmatched.join('; ')}.`);
  if (!model.pipeline.length) errors.push(`No ${model.nextYear} WeTravel trips matched a row in the pricing summary.`);

  return { errors, warnings, ok: errors.length === 0 };
}
