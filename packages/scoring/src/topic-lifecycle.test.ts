import { describe, expect, it } from "vitest";
import {
  TOPIC_LIFECYCLE_ACCELERATING_SCORE,
  TOPIC_LIFECYCLE_EMERGING_SCORE,
  TOPIC_LIFECYCLE_PEAKING_SCORE,
  TOPIC_LIFECYCLE_TRENDING_SCORE,
  nextTopicLifecycleState,
} from "./topic-lifecycle";

describe("nextTopicLifecycleState", () => {
  it("promotes to peaking once the score crosses the peaking threshold, regardless of current state", () => {
    expect(
      nextTopicLifecycleState({
        momentumScore: TOPIC_LIFECYCLE_PEAKING_SCORE,
        sampleConfidence: 1,
        isDeclining: false,
        currentState: "emerging",
      }),
    ).toBe("peaking");
  });

  it("moves a declining peaking topic into declining", () => {
    expect(
      nextTopicLifecycleState({
        momentumScore: TOPIC_LIFECYCLE_TRENDING_SCORE,
        sampleConfidence: 1,
        isDeclining: true,
        currentState: "peaking",
      }),
    ).toBe("declining");
  });

  it("holds a declining topic in declining until it recovers above the accelerating threshold without declining", () => {
    expect(
      nextTopicLifecycleState({
        momentumScore: TOPIC_LIFECYCLE_ACCELERATING_SCORE - 1,
        sampleConfidence: 1,
        isDeclining: false,
        currentState: "declining",
      }),
    ).toBe("declining");
    expect(
      nextTopicLifecycleState({
        momentumScore: TOPIC_LIFECYCLE_ACCELERATING_SCORE,
        sampleConfidence: 1,
        isDeclining: false,
        currentState: "declining",
      }),
    ).toBe("accelerating");
  });

  it("keeps a still-falling declining topic in declining rather than demoting it further", () => {
    expect(
      nextTopicLifecycleState({
        momentumScore: TOPIC_LIFECYCLE_EMERGING_SCORE - 1,
        sampleConfidence: 1,
        isDeclining: true,
        currentState: "declining",
      }),
    ).toBe("declining");
  });

  it("assigns trending/accelerating/emerging/candidate by score band for a non-peaking, non-declining topic", () => {
    expect(
      nextTopicLifecycleState({
        momentumScore: TOPIC_LIFECYCLE_TRENDING_SCORE,
        sampleConfidence: 1,
        isDeclining: false,
        currentState: "candidate",
      }),
    ).toBe("trending");
    expect(
      nextTopicLifecycleState({
        momentumScore: TOPIC_LIFECYCLE_ACCELERATING_SCORE,
        sampleConfidence: 1,
        isDeclining: false,
        currentState: "candidate",
      }),
    ).toBe("accelerating");
    expect(
      nextTopicLifecycleState({
        momentumScore: TOPIC_LIFECYCLE_EMERGING_SCORE,
        sampleConfidence: 1,
        isDeclining: false,
        currentState: "candidate",
      }),
    ).toBe("emerging");
    expect(
      nextTopicLifecycleState({
        momentumScore: TOPIC_LIFECYCLE_EMERGING_SCORE - 1,
        sampleConfidence: 1,
        isDeclining: false,
        currentState: "candidate",
      }),
    ).toBe("candidate");
  });

  it("forces candidate regardless of score or current state when sampleConfidence is too low", () => {
    expect(
      nextTopicLifecycleState({
        momentumScore: TOPIC_LIFECYCLE_PEAKING_SCORE,
        sampleConfidence: 0.1,
        isDeclining: false,
        currentState: "accelerating",
      }),
    ).toBe("candidate");
    expect(
      nextTopicLifecycleState({
        momentumScore: TOPIC_LIFECYCLE_PEAKING_SCORE,
        sampleConfidence: 0.1,
        isDeclining: false,
        currentState: "declining",
      }),
    ).toBe("candidate");
  });
});
