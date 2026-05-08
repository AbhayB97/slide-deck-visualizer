type HistoryWeek = {
  weekId?: string;
  uploadedAt?: string;
  uploaded?: string;
  offenderCount?: number;
  totalIncomplete?: number;
};

type ParsedRow = {
  email?: string;
  fullName?: string;
  title?: string;
  sentDate?: string;
  status?: string;
};

type MetricsUser = {
  email?: string;
  name?: string;
  incompleteCount?: number;
  deltaFromPrevWeek?: number;
};

type CheckpointUser = {
  email?: string;
  name?: string;
  displayName?: string;
  checkpointsOnList?: number;
  firstSeenCheckpointDate?: string | null;
  firstSeenCheckpointId?: string | null;
  lastSeenCheckpointDate?: string | null;
  lastSeenCheckpointId?: string | null;
};

type CheckpointTimelineRow = {
  checkpointId?: string;
  checkpointDate?: string;
  userCount?: number;
  repeatUserCount?: number;
};

type UserProfile = {
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

export function buildComparisonModel(parsedRows: ParsedRow[], metricsUsers: MetricsUser[], prevWeekId?: string | null) {
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

export function buildUserProfiles(parsedRows: ParsedRow[], metricsUsers: MetricsUser[], checkpointUsers: CheckpointUser[]) {
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
      email: normalizeEmail(sortedSessions[0]?.email) || normalizeEmail(metric?.email) || normalizeEmail(checkpoint?.email),
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
