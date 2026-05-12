export type HistoryWeek = {
  weekId?: string;
  uploadedAt?: string;
  uploaded?: string;
  offenderCount?: number;
  totalIncomplete?: number;
};

export type ParsedRow = {
  email?: string;
  fullName?: string;
  title?: string;
  sentDate?: string;
  status?: string;
};

export type MetricsUser = {
  email?: string;
  name?: string;
  incompleteCount?: number;
  deltaFromPrevWeek?: number;
};

export type CheckpointUser = {
  email?: string;
  name?: string;
  displayName?: string;
  checkpointsOnList?: number;
  firstSeenCheckpointDate?: string | null;
  firstSeenCheckpointId?: string | null;
  lastSeenCheckpointDate?: string | null;
  lastSeenCheckpointId?: string | null;
};

export type CheckpointTimelineRow = {
  checkpointId?: string;
  checkpointDate?: string;
  userCount?: number;
  repeatUserCount?: number;
  newUserCount?: number;
};

export type UserProfile = {
  key: string;
  name: string;
  email: string;
  sessionCount: number;
  oldestOpenDate: string | null;
  oldestOpenDays: number | null;
  deltaFromPrevWeek: number | null;
  statusCounts: Array<{ label: string; value: number }>;
  titleCounts: Array<{ title: string; count: number }>;
  ageBuckets: { fresh: number; aging: number; stale: number; unknown: number };
  checkpoint: {
    checkpointsOnList: number;
    firstSeenCheckpointDate: string | null;
    lastSeenCheckpointDate: string | null;
    lastSeenCheckpointId: string | null;
  } | null;
  sessions: ParsedRow[];
};

const RISK_STATUSES = new Set(["not started", "in progress"]);

export function normalizeNameKey(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").replace(/[.,]/g, "").toLowerCase();
}

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export function shortName(value: unknown) {
  if (typeof value !== "string") return "Unknown";
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Unknown";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]?.toUpperCase() ?? ""}.`.trim();
}

export function isRiskRow(row: ParsedRow) {
  return RISK_STATUSES.has(String(row?.status ?? "").trim().toLowerCase());
}

export function getPendingDays(sentDate?: string) {
  const sent = sentDate ? new Date(sentDate) : null;
  if (!sent || Number.isNaN(sent.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - sent.getTime()) / 86400000));
}

function compareWeekIdsDesc(a?: string, b?: string) {
  return String(b ?? "").localeCompare(String(a ?? ""), undefined, { numeric: true });
}

function humanizeStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "not started") return "Not Started";
  if (normalized === "in progress") return "In Progress";
  return status || "Unknown";
}

function toSafeNumber(value: unknown): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function percentage(part: number, total: number): number {
  if (!total) return 0;
  return (part / total) * 100;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

export function buildTrendModel(historyWeeks: HistoryWeek[], masterCount: number) {
  const weeks = [...(historyWeeks ?? [])]
    .filter((week) => week?.weekId)
    .sort((a, b) => compareWeekIdsDesc(a.weekId, b.weekId))
    .map((week) => {
      const peopleOnList = Number(week.offenderCount ?? 0);
      const incompleteItems = Number(week.totalIncomplete ?? peopleOnList);
      const completionRate =
        masterCount > 0 ? Math.max(0, ((masterCount - peopleOnList) / masterCount) * 100) : null;
      return {
        weekId: String(week.weekId),
        peopleOnList,
        incompleteItems,
        completionRate,
        uploadedAt: String(week.uploadedAt ?? week.uploaded ?? ""),
      };
    });

  const latest = weeks[0] ?? null;
  const previous = weeks[1] ?? null;
  return {
    weeks,
    latest,
    previous,
    deltaPeople: latest && previous ? latest.peopleOnList - previous.peopleOnList : null,
    deltaIncomplete: latest && previous ? latest.incompleteItems - previous.incompleteItems : null,
    deltaCompletionRate:
      latest && previous && latest.completionRate !== null && previous.completionRate !== null
        ? latest.completionRate - previous.completionRate
        : null,
  };
}

export function buildStatusModel(parsedRows: ParsedRow[]) {
  const riskRows = parsedRows.filter(isRiskRow);
  const notStartedRows = riskRows.filter(
    (row) => String(row.status ?? "").trim().toLowerCase() === "not started"
  );
  const inProgressRows = riskRows.filter(
    (row) => String(row.status ?? "").trim().toLowerCase() === "in progress"
  );

  const usersByStatus = {
    all: Array.from(new Set(riskRows.map((row) => row.fullName).filter(Boolean))),
    "not started": Array.from(new Set(notStartedRows.map((row) => row.fullName).filter(Boolean))),
    "in progress": Array.from(new Set(inProgressRows.map((row) => row.fullName).filter(Boolean))),
  };

  const agingBuckets = [
    { label: "0-7 Days", min: 0, max: 7, count: 0 },
    { label: "8-14 Days", min: 8, max: 14, count: 0 },
    { label: "15+ Days", min: 15, max: Number.POSITIVE_INFINITY, count: 0 },
    { label: "Unknown", min: null, max: null, count: 0 },
  ];

  for (const row of riskRows) {
    const pending = getPendingDays(row.sentDate);
    if (pending === null) {
      agingBuckets[3].count += 1;
      continue;
    }
    const bucket = agingBuckets.find(
      (candidate) =>
        candidate.min !== null && pending >= candidate.min && pending <= (candidate.max ?? pending)
    );
    if (bucket) bucket.count += 1;
  }

  return {
    totals: {
      all: riskRows.length,
      notStarted: notStartedRows.length,
      inProgress: inProgressRows.length,
      userCount: usersByStatus.all.length,
    },
    distributions: [
      { label: "Not Started", value: notStartedRows.length },
      { label: "In Progress", value: inProgressRows.length },
    ],
    usersByStatus,
    agingBuckets,
  };
}

export function buildComparisonModel(
  parsedRows: ParsedRow[],
  metricsUsers: MetricsUser[],
  prevWeekId?: string | null
) {
  const currentByUser = new Map<
    string,
    { key: string; name: string; email: string; count: number; delta: number | null }
  >();
  const metricsByKey = new Map<string, MetricsUser>();

  for (const user of metricsUsers ?? []) {
    const key = normalizeEmail(user.email) || normalizeNameKey(user.name);
    if (!key) continue;
    metricsByKey.set(key, user);
  }

  for (const row of parsedRows.filter(isRiskRow)) {
    const key = normalizeEmail(row.email) || normalizeNameKey(row.fullName);
    const name = String(row.fullName ?? "").trim();
    if (!key || !name) continue;
    const existing = currentByUser.get(key) ?? {
      key,
      name,
      email: normalizeEmail(row.email),
      count: 0,
      delta: null,
    };
    existing.count += 1;
    const metric = metricsByKey.get(key);
    existing.delta =
      metric && Number.isFinite(metric.deltaFromPrevWeek) ? Number(metric.deltaFromPrevWeek) : existing.delta;
    currentByUser.set(key, existing);
  }

  const buckets = {
    newThisWeek: [] as Array<{ key: string; name: string; count: number; delta: number | null }>,
    improved: [] as Array<{ key: string; name: string; count: number; delta: number | null }>,
    repeated: [] as Array<{ key: string; name: string; count: number; delta: number | null }>,
    worsened: [] as Array<{ key: string; name: string; count: number; delta: number | null }>,
  };

  for (const user of currentByUser.values()) {
    if (!prevWeekId) {
      buckets.repeated.push(user);
      continue;
    }
    if (user.delta === null) {
      buckets.repeated.push(user);
      continue;
    }
    const inferredPrevCount = Math.max(0, user.count - user.delta);
    if (user.delta > 0 && inferredPrevCount === 0) {
      buckets.newThisWeek.push(user);
      continue;
    }
    if (user.delta > 0) {
      buckets.worsened.push(user);
      continue;
    }
    if (user.delta < 0) {
      buckets.improved.push(user);
      continue;
    }
    const matchingMetric = metricsByKey.get(user.key);
    if (!matchingMetric || Number(matchingMetric.incompleteCount ?? 0) === user.count) {
      buckets.repeated.push(user);
    } else {
      buckets.newThisWeek.push(user);
    }
  }

  const summary = [
    {
      id: "newThisWeek",
      label: "New This Week",
      description: prevWeekId ? `Added since ${prevWeekId}` : "Previous week unavailable",
      count: buckets.newThisWeek.length,
    },
    {
      id: "improved",
      label: "Improved",
      description: prevWeekId ? "Lower incomplete load" : "Previous week unavailable",
      count: buckets.improved.length,
    },
    {
      id: "repeated",
      label: "Repeated",
      description: "Still on the list",
      count: buckets.repeated.length,
    },
    {
      id: "worsened",
      label: "Higher Load",
      description: prevWeekId ? "More incomplete than last week" : "Previous week unavailable",
      count: buckets.worsened.length,
    },
  ];

  return { prevWeekId: prevWeekId ?? null, summary, buckets };
}

export function buildTitleHotspots(parsedRows: ParsedRow[]) {
  const titleMap = new Map<string, { title: string; incompleteCount: number; users: Set<string> }>();

  for (const row of parsedRows.filter(isRiskRow)) {
    const title = String(row.title ?? "").trim() || "Unknown title";
    const safeTitle = title.length < 2 ? "Unknown title" : title;
    const bucket = titleMap.get(safeTitle) ?? {
      title: safeTitle,
      incompleteCount: 0,
      users: new Set<string>(),
    };
    bucket.incompleteCount += 1;
    if (row.fullName) bucket.users.add(row.fullName);
    titleMap.set(safeTitle, bucket);
  }

  return Array.from(titleMap.values())
    .map((title) => ({
      title: title.title,
      incompleteCount: title.incompleteCount,
      userCount: title.users.size,
    }))
    .sort((a, b) => b.incompleteCount - a.incompleteCount || a.title.localeCompare(b.title))
    .slice(0, 8);
}

export function buildCheckpointPanelModel(users: CheckpointUser[], timeline: CheckpointTimelineRow[]) {
  const rankedUsers = [...(users ?? [])]
    .map((user) => ({
      email: normalizeEmail(user.email),
      name: user.displayName || user.name || user.email || "Unknown",
      checkpointsOnList: Number(user.checkpointsOnList ?? 0),
      firstSeenCheckpointDate: user.firstSeenCheckpointDate ?? null,
      lastSeenCheckpointDate: user.lastSeenCheckpointDate ?? null,
      lastSeenCheckpointId: user.lastSeenCheckpointId ?? null,
    }))
    .sort(
      (a, b) =>
        b.checkpointsOnList - a.checkpointsOnList ||
        String(a.name).localeCompare(String(b.name))
    );

  return {
    topRecurring: rankedUsers.slice(0, 8),
    summary: {
      totalTrackedUsers: rankedUsers.length,
      repeaters: rankedUsers.filter((user) => user.checkpointsOnList >= 2).length,
      persistent: rankedUsers.filter((user) => user.checkpointsOnList >= 3).length,
      latestCheckpoint: timeline[0] ?? null,
    },
    timeline: [...(timeline ?? [])].slice(0, 12).reverse(),
  };
}

export function buildUserProfiles(
  parsedRows: ParsedRow[],
  metricsUsers: MetricsUser[],
  checkpointUsers: CheckpointUser[]
) {
  const metricsByKey = new Map<string, MetricsUser>();
  const checkpointsByKey = new Map<string, CheckpointUser>();
  const groupedRows = new Map<string, ParsedRow[]>();

  for (const user of metricsUsers ?? []) {
    const key = normalizeEmail(user.email) || normalizeNameKey(user.name);
    if (!key) continue;
    metricsByKey.set(key, user);
  }

  for (const user of checkpointUsers ?? []) {
    const key = normalizeEmail(user.email) || normalizeNameKey(user.name || user.displayName);
    if (!key) continue;
    checkpointsByKey.set(key, user);
  }

  for (const row of parsedRows.filter(isRiskRow)) {
    const key = normalizeEmail(row.email) || normalizeNameKey(row.fullName);
    if (!key) continue;
    const sessions = groupedRows.get(key) ?? [];
    sessions.push(row);
    groupedRows.set(key, sessions);
  }

  const profiles: Record<string, UserProfile> = {};
  for (const [key, sessions] of groupedRows.entries()) {
    const sortedSessions = [...sessions].sort((a, b) => {
      const aTime = new Date(String(a.sentDate ?? "")).getTime() || 0;
      const bTime = new Date(String(b.sentDate ?? "")).getTime() || 0;
      return aTime - bTime;
    });
    const titleCounts = new Map<string, number>();
    const statusCounts = new Map<string, number>();
    const ageBuckets = { fresh: 0, aging: 0, stale: 0, unknown: 0 };

    for (const session of sortedSessions) {
      const title = String(session.title ?? "").trim() || "Unknown title";
      titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
      const status = humanizeStatus(String(session.status ?? "").trim());
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
      const days = getPendingDays(session.sentDate);
      if (days === null) ageBuckets.unknown += 1;
      else if (days <= 7) ageBuckets.fresh += 1;
      else if (days <= 14) ageBuckets.aging += 1;
      else ageBuckets.stale += 1;
    }

    const metric = metricsByKey.get(key);
    const checkpoint = checkpointsByKey.get(key);
    const firstSession = sortedSessions[0] ?? null;
    profiles[key] = {
      key,
      name: String(sortedSessions[0]?.fullName ?? metric?.name ?? checkpoint?.displayName ?? "Unknown"),
      email:
        normalizeEmail(sortedSessions[0]?.email) ||
        normalizeEmail(metric?.email) ||
        normalizeEmail(checkpoint?.email),
      sessionCount: sortedSessions.length,
      oldestOpenDate: firstSession?.sentDate ?? null,
      oldestOpenDays: firstSession ? getPendingDays(firstSession.sentDate) : null,
      deltaFromPrevWeek:
        metric && Number.isFinite(metric.deltaFromPrevWeek) ? Number(metric.deltaFromPrevWeek) : null,
      statusCounts: Array.from(statusCounts.entries()).map(([label, value]) => ({ label, value })),
      titleCounts: Array.from(titleCounts.entries())
        .map(([title, count]) => ({ title, count }))
        .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)),
      ageBuckets,
      checkpoint: checkpoint
        ? {
            checkpointsOnList: Number(checkpoint.checkpointsOnList ?? 0),
            firstSeenCheckpointDate: checkpoint.firstSeenCheckpointDate ?? null,
            lastSeenCheckpointDate: checkpoint.lastSeenCheckpointDate ?? null,
            lastSeenCheckpointId: checkpoint.lastSeenCheckpointId ?? null,
          }
        : null,
      sessions: sortedSessions,
    };
  }

  return profiles;
}

export function buildEscalationQueueModel(
  parsedRows: ParsedRow[],
  metricsUsers: MetricsUser[],
  checkpointUsers: CheckpointUser[]
) {
  const profiles = Object.values(buildUserProfiles(parsedRows, metricsUsers, checkpointUsers));
  const entries = profiles
    .map((profile) => {
      const oldestOpenDays = toSafeNumber(profile.oldestOpenDays);
      const deltaFromPrevWeek = toSafeNumber(profile.deltaFromPrevWeek);
      const checkpointCount = toSafeNumber(profile.checkpoint?.checkpointsOnList);
      const escalationScore =
        profile.sessionCount * 12 +
        oldestOpenDays * 1.2 +
        Math.max(0, deltaFromPrevWeek) * 10 +
        checkpointCount * 8 +
        profile.ageBuckets.stale * 6 +
        profile.ageBuckets.aging * 3;

      return {
        key: profile.key,
        name: profile.name,
        email: profile.email,
        sessionCount: profile.sessionCount,
        oldestOpenDays: profile.oldestOpenDays,
        deltaFromPrevWeek: profile.deltaFromPrevWeek,
        checkpointCount,
        staleSessions: profile.ageBuckets.stale,
        agingSessions: profile.ageBuckets.aging,
        escalationScore,
      };
    })
    .sort(
      (a, b) =>
        b.escalationScore - a.escalationScore ||
        b.sessionCount - a.sessionCount ||
        toSafeNumber(b.oldestOpenDays) - toSafeNumber(a.oldestOpenDays) ||
        b.checkpointCount - a.checkpointCount ||
        a.name.localeCompare(b.name)
    );

  const sessionAging = profiles.reduce(
    (acc, profile) => {
      acc.fresh += profile.ageBuckets.fresh;
      acc.aging += profile.ageBuckets.aging;
      acc.stale += profile.ageBuckets.stale;
      acc.unknown += profile.ageBuckets.unknown;
      return acc;
    },
    { fresh: 0, aging: 0, stale: 0, unknown: 0 }
  );

  const agingMix = [
    {
      id: "fresh",
      label: "Fresh",
      count: sessionAging.fresh,
      tone: "emerald",
      share: percentage(sessionAging.fresh, parsedRows.length),
    },
    {
      id: "aging",
      label: "Aging",
      count: sessionAging.aging,
      tone: "amber",
      share: percentage(sessionAging.aging, parsedRows.length),
    },
    {
      id: "stale",
      label: "Stale",
      count: sessionAging.stale,
      tone: "rose",
      share: percentage(sessionAging.stale, parsedRows.length),
    },
    {
      id: "unknown",
      label: "Unknown",
      count: sessionAging.unknown,
      tone: "stone",
      share: percentage(sessionAging.unknown, parsedRows.length),
    },
  ];

  return {
    entries,
    agingMix,
    summary: {
      userCount: profiles.length,
      highPriorityUsers: entries.filter((entry) => entry.escalationScore >= 40).length,
      staleSessionCount: sessionAging.stale,
      worseningUsers: entries.filter((entry) => toSafeNumber(entry.deltaFromPrevWeek) > 0).length,
    },
  };
}

export function buildLoadDistributionModel(userProfiles: Record<string, UserProfile>) {
  const profiles = Object.values(userProfiles);
  const bucketDefs = [
    { id: "one", label: "1 Session", min: 1, max: 1 },
    { id: "two", label: "2 Sessions", min: 2, max: 2 },
    { id: "threeToFour", label: "3-4 Sessions", min: 3, max: 4 },
    { id: "fivePlus", label: "5+ Sessions", min: 5, max: Number.POSITIVE_INFINITY },
  ];

  const buckets = bucketDefs.map((bucket) => {
    const bucketProfiles = profiles.filter(
      (profile) => profile.sessionCount >= bucket.min && profile.sessionCount <= bucket.max
    );
    const sessionCount = bucketProfiles.reduce((sum, profile) => sum + profile.sessionCount, 0);
    return {
      ...bucket,
      userCount: bucketProfiles.length,
      sessionCount,
      shareOfUsers: percentage(bucketProfiles.length, profiles.length),
      shareOfSessions: percentage(
        sessionCount,
        profiles.reduce((sum, profile) => sum + profile.sessionCount, 0)
      ),
    };
  });

  const heavyUsers = profiles.filter((profile) => profile.sessionCount >= 3).length;

  return {
    buckets,
    summary: {
      userCount: profiles.length,
      heavyUsers,
      heavyUserShare: percentage(heavyUsers, profiles.length),
    },
  };
}

export function buildConcentrationModel(
  parsedRows: ParsedRow[],
  userProfiles: Record<string, UserProfile>,
  titleHotspots: Array<{ title: string; incompleteCount: number; userCount: number }>
) {
  const totalSessions = parsedRows.filter(isRiskRow).length;
  const profiles = Object.values(userProfiles).sort(
    (a, b) => b.sessionCount - a.sessionCount || a.name.localeCompare(b.name)
  );
  const topUsers = profiles.slice(0, 5);
  const topTitles = [...(titleHotspots ?? [])].slice(0, 6);
  const topUserLoad = topUsers.reduce((sum, profile) => sum + profile.sessionCount, 0);
  const topTitleLoad = topTitles.slice(0, 3).reduce((sum, title) => sum + title.incompleteCount, 0);

  return {
    topUsers: topUsers.map((profile) => ({
      key: profile.key,
      name: profile.name,
      sessionCount: profile.sessionCount,
      share: percentage(profile.sessionCount, totalSessions),
    })),
    titleMatrix: topTitles.map((title) => ({
      ...title,
      sessionShare: percentage(title.incompleteCount, totalSessions),
      userShare: percentage(title.userCount, profiles.length),
    })),
    summary: {
      totalSessions,
      userCount: profiles.length,
      topUserShare: percentage(topUserLoad, totalSessions),
      topTitleShare: percentage(topTitleLoad, totalSessions),
    },
  };
}

export function buildWeekChangeStripModel(
  trendModel: ReturnType<typeof buildTrendModel>,
  comparisonModel: ReturnType<typeof buildComparisonModel>
) {
  const summaryById = new Map((comparisonModel.summary ?? []).map((item) => [item.id, item]));
  const recentWeeks = [...(trendModel.weeks ?? [])].slice(0, 6);
  const referenceWeeks = recentWeeks.slice(1, 5);
  const baselineValues = (referenceWeeks.length ? referenceWeeks : recentWeeks).map(
    (week) => week.incompleteItems
  );
  const recentMedian = median(baselineValues);
  const latestIncomplete = trendModel.latest?.incompleteItems ?? 0;
  const latestPeople = trendModel.latest?.peopleOnList ?? 0;
  const oldestComparable = recentWeeks[recentWeeks.length - 1] ?? null;
  const directionDelta = oldestComparable ? latestIncomplete - oldestComparable.incompleteItems : 0;

  let label = "Stable";
  let detail = "Recent weeks are holding close to the baseline.";
  if (
    recentMedian !== null &&
    latestIncomplete > recentMedian &&
    directionDelta > 0
  ) {
    label = "Rising";
    detail = "Current incomplete volume is running above the recent median.";
  } else if (
    recentMedian !== null &&
    latestIncomplete < recentMedian &&
    directionDelta < 0
  ) {
    label = "Cooling";
    detail = "Current incomplete volume is below the recent median.";
  } else if (Math.abs(directionDelta) >= 3) {
    label = "Choppy";
    detail = "The range is moving enough week to week that the trend is not settled.";
  }

  return {
    changeItems: [
      {
        id: "people",
        label: "People On List",
        value: latestPeople,
        delta: trendModel.deltaPeople,
      },
      {
        id: "incomplete",
        label: "Incomplete Items",
        value: latestIncomplete,
        delta: trendModel.deltaIncomplete,
      },
      {
        id: "worsened",
        label: "Worsened Users",
        value: Number(summaryById.get("worsened")?.count ?? 0),
        delta: null,
      },
    ],
    recentInstability: {
      label,
      detail,
      recentMedian,
      currentValue: latestIncomplete,
      deltaFromMedian:
        recentMedian === null ? null : Math.round((latestIncomplete - recentMedian) * 10) / 10,
      window: recentWeeks
        .slice()
        .reverse()
        .map((week) => ({
          weekId: week.weekId,
          incompleteItems: week.incompleteItems,
          peopleOnList: week.peopleOnList,
        })),
    },
  };
}

export function buildCheckpointExposureModel(
  checkpointTimeline: CheckpointTimelineRow[],
  currentProfiles: Record<string, UserProfile> | UserProfile[]
) {
  const profiles = Array.isArray(currentProfiles)
    ? currentProfiles
    : Object.values(currentProfiles ?? {});

  const timeline = [...(checkpointTimeline ?? [])]
    .map((row) => ({
      checkpointId: String(row.checkpointId ?? ""),
      checkpointDate: String(row.checkpointDate ?? ""),
      userCount: toSafeNumber(row.userCount),
      repeatUserCount: toSafeNumber(row.repeatUserCount),
      newUserCount: toSafeNumber(row.newUserCount),
    }))
    .filter((row) => row.checkpointId || row.checkpointDate);

  const recurringProfiles = profiles.filter(
    (profile) => toSafeNumber(profile.checkpoint?.checkpointsOnList) >= 2
  );
  const persistentProfiles = profiles.filter(
    (profile) => toSafeNumber(profile.checkpoint?.checkpointsOnList) >= 3
  );

  const leaderboard = profiles
    .filter((profile) => profile.checkpoint)
    .map((profile) => ({
      key: profile.key,
      name: profile.name,
      email: profile.email,
      checkpointsOnList: toSafeNumber(profile.checkpoint?.checkpointsOnList),
      firstSeenCheckpointDate: profile.checkpoint?.firstSeenCheckpointDate ?? null,
      lastSeenCheckpointDate: profile.checkpoint?.lastSeenCheckpointDate ?? null,
    }))
    .sort(
      (a, b) =>
        b.checkpointsOnList - a.checkpointsOnList ||
        String(a.name).localeCompare(String(b.name))
    );

  return {
    timeline,
    leaderboard,
    currentWeek: {
      trackedUsers: profiles.filter((profile) => profile.checkpoint).length,
      recurringUsers: recurringProfiles.length,
      persistentUsers: persistentProfiles.length,
      recurringShare: percentage(recurringProfiles.length, profiles.length),
      persistentShare: percentage(persistentProfiles.length, profiles.length),
    },
  };
}
