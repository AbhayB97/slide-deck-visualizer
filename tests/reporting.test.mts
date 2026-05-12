import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCheckpointExposureModel,
  buildComparisonModel,
  buildConcentrationModel,
  buildEscalationQueueModel,
  buildLoadDistributionModel,
  buildTitleHotspots,
  buildUserProfiles,
  buildWeekChangeStripModel,
  buildTrendModel,
} from "../lib/reporting.ts";

const NOW = Date.now();
const daysAgo = (days) => new Date(NOW - days * 86400000).toISOString();

const parsedRows = [
  {
    email: "alex@example.com",
    fullName: "Alex Stone",
    title: "Security Basics",
    sentDate: daysAgo(20),
    status: "Not Started",
  },
  {
    email: "alex@example.com",
    fullName: "Alex Stone",
    title: "Phishing 101",
    sentDate: daysAgo(10),
    status: "In Progress",
  },
  {
    email: "blair@example.com",
    fullName: "Blair North",
    title: "Security Basics",
    sentDate: daysAgo(5),
    status: "Not Started",
  },
  {
    email: "casey@example.com",
    fullName: "Casey Vale",
    title: "Annual Refresher",
    sentDate: "bad-date",
    status: "In Progress",
  },
];

const metricsUsers = [
  {
    email: "alex@example.com",
    name: "Alex Stone",
    incompleteCount: 2,
    deltaFromPrevWeek: 1,
  },
  {
    email: "blair@example.com",
    name: "Blair North",
    incompleteCount: 1,
    deltaFromPrevWeek: -1,
  },
  {
    email: "",
    name: "Casey Vale",
    incompleteCount: 1,
    deltaFromPrevWeek: 0,
  },
];

const checkpointUsers = [
  {
    email: "alex@example.com",
    name: "Alex Stone",
    displayName: "Alex Stone",
    checkpointsOnList: 3,
    firstSeenCheckpointDate: "2026-03-05",
    lastSeenCheckpointDate: "2026-05-08",
  },
  {
    email: "blair@example.com",
    name: "Blair North",
    displayName: "Blair North",
    checkpointsOnList: 2,
    firstSeenCheckpointDate: "2026-04-10",
    lastSeenCheckpointDate: "2026-05-08",
  },
];

test("buildEscalationQueueModel ranks worsening stale users first", () => {
  const model = buildEscalationQueueModel(parsedRows, metricsUsers, checkpointUsers);

  assert.equal(model.entries[0]?.name, "Alex Stone");
  assert.equal(model.summary.staleSessionCount, 1);
  assert.equal(model.summary.worseningUsers, 1);
  assert.equal(model.agingMix.find((bucket) => bucket.id === "unknown")?.count, 1);
});

test("buildLoadDistributionModel buckets current user load", () => {
  const profiles = buildUserProfiles(parsedRows, metricsUsers, checkpointUsers);
  const model = buildLoadDistributionModel(profiles);

  assert.equal(model.buckets.find((bucket) => bucket.id === "two")?.userCount, 1);
  assert.equal(model.buckets.find((bucket) => bucket.id === "one")?.userCount, 2);
  assert.equal(model.summary.heavyUsers, 0);
});

test("buildConcentrationModel computes top user and title share", () => {
  const profiles = buildUserProfiles(parsedRows, metricsUsers, checkpointUsers);
  const titleHotspots = buildTitleHotspots(parsedRows);
  const model = buildConcentrationModel(parsedRows, profiles, titleHotspots);

  assert.equal(model.summary.totalSessions, 4);
  assert.equal(model.titleMatrix[0]?.title, "Security Basics");
  assert.equal(model.summary.topUserShare, 100);
});

test("buildWeekChangeStripModel classifies recent direction from trend data", () => {
  const trend = buildTrendModel(
    [
      { weekId: "2026-Week-18", offenderCount: 3, totalIncomplete: 4 },
      { weekId: "2026-Week-17", offenderCount: 2, totalIncomplete: 2 },
      { weekId: "2026-Week-16", offenderCount: 2, totalIncomplete: 3 },
      { weekId: "2026-Week-15", offenderCount: 1, totalIncomplete: 1 },
    ],
    10
  );
  const comparison = buildComparisonModel(parsedRows, metricsUsers, "2026-Week-17");
  const model = buildWeekChangeStripModel(trend, comparison);

  assert.equal(model.changeItems.find((item) => item.id === "worsened")?.value, 1);
  assert.equal(model.recentInstability.label, "Rising");
});

test("buildComparisonModel separates new users from worsened repeat users", () => {
  const comparison = buildComparisonModel(
    parsedRows,
    [
      {
        email: "alex@example.com",
        name: "Alex Stone",
        incompleteCount: 2,
        deltaFromPrevWeek: 1,
      },
      {
        email: "blair@example.com",
        name: "Blair North",
        incompleteCount: 1,
        deltaFromPrevWeek: -1,
      },
      {
        email: "casey@example.com",
        name: "Casey Vale",
        incompleteCount: 1,
        deltaFromPrevWeek: 1,
      },
    ],
    "2026-Week-17"
  );

  assert.equal(comparison.buckets.worsened.length, 1);
  assert.equal(comparison.buckets.worsened[0]?.name, "Alex Stone");
  assert.equal(comparison.buckets.newThisWeek.length, 1);
  assert.equal(comparison.buckets.newThisWeek[0]?.name, "Casey Vale");
});

test("buildCheckpointExposureModel tracks recurring and persistent share", () => {
  const profiles = buildUserProfiles(parsedRows, metricsUsers, checkpointUsers);
  const model = buildCheckpointExposureModel(
    [
      { checkpointId: "checkpoint-1", checkpointDate: "2026-04-03", userCount: 4, repeatUserCount: 1, newUserCount: 3 },
      { checkpointId: "checkpoint-2", checkpointDate: "2026-04-10", userCount: 3, repeatUserCount: 2, newUserCount: 1 },
    ],
    profiles
  );

  assert.equal(model.timeline.length, 2);
  assert.equal(model.currentWeek.recurringUsers, 2);
  assert.equal(model.currentWeek.persistentUsers, 1);
  assert.equal(model.leaderboard[0]?.name, "Alex Stone");
});
